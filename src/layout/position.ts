// 図形の本体の中心の位置を決める。置き方(at、隣、置き方なし)と揃え(align)をたどる。
// x と y は別々に解く。相対配置は向きの軸では間を空け、もう一方の軸では基準に揃える
import { ZuError } from "../errors.ts";
import type { AlignStatement, Direction, Document, ShapeStatement } from "../syntax/ast.ts";
import type { Point } from "./geometry.ts";
import { roomFor } from "./lines.ts";
import { FONT_SIZE } from "./measure.ts";
import type { Sized } from "./size.ts";

// 既定の間は字の大きさから決める(16 の字で 40)。字を大きくすれば、間も同じ割合で広がる
export const DEFAULT_GAP = FONT_SIZE * 2.5;

// 間を書かずに from を to の direction に置くときの間。2つを結ぶ線にラベルがあれば、
// ラベルと矢先が収まるよう広げる
export function defaultGap(document: Document, from: string, to: string, direction: Direction) {
  const lines = document.statements.filter((statement) => statement.kind === "line");
  const coord = direction === "left" || direction === "right" ? "x" : "y";
  return Math.max(DEFAULT_GAP, roomFor(lines, from, to, coord));
}

type Coord = "x" | "y";
const DIRECTION_OF: Record<Direction, { coord: Coord; sign: 1 | -1 }> = {
  left: { coord: "x", sign: -1 },
  right: { coord: "x", sign: 1 },
  above: { coord: "y", sign: -1 },
  below: { coord: "y", sign: 1 },
};

// 本体の中心から、外枠の手前(左か上)の端と奥(右か下)の端まで
function extent(size: Sized, coord: Coord) {
  if (coord === "x") return { before: size.width / 2, after: size.width / 2 };
  return { before: size.anchorTop, after: size.height - size.anchorTop };
}

type Relation = { base: ShapeStatement; direction: Direction; gap: number };

type Group = {
  members: ShapeStatement[];
  at: AlignStatement["at"];
  value: number | undefined;
  resolving: boolean;
};

// 図形ごとの本体の中心。byId は名前の重なりと、置き方の参照先を確かめ終えたもの
export function solvePositions(
  document: Document,
  statements: ShapeStatement[],
  byId: Map<string, ShapeStatement>,
  sizes: Map<string, Sized>,
): Map<string, Point> {
  const aligns = document.statements.filter((statement) => statement.kind === "align");

  // 置き方がなければ、直前の図形の右に置く。最初の図形と at の図形には基準がない
  const relations = new Map<string, Relation | null>(
    statements.map((statement, index): [string, Relation | null] => {
      const { placement } = statement;
      if (placement?.kind === "at") return [statement.id, null];
      if (placement) {
        const base = byId.get(placement.of)!;
        const gap = placement.gap ?? defaultGap(document, statement.id, base.id, placement.direction);
        return [statement.id, { base, direction: placement.direction, gap }];
      }
      const previous = statements[index - 1];
      if (!previous) return [statement.id, null];
      const gap = defaultGap(document, statement.id, previous.id, "right");
      return [statement.id, { base: previous, direction: "right", gap }];
    }),
  );

  const groups = { x: buildGroups(aligns, byId, "column"), y: buildGroups(aligns, byId, "row") };

  const owns = new Map<string, number>();
  const resolving = new Set<string>();

  function position(statement: ShapeStatement, coord: Coord): number {
    const group = groups[coord].get(statement.id);
    return group ? aligned(group, coord) : own(statement, coord);
  }

  // 揃えを考えないときの位置
  function own(statement: ShapeStatement, coord: Coord): number {
    const key = `${coord}:${statement.id}`;
    const known = owns.get(key);
    if (known !== undefined) return known;
    if (resolving.has(key)) throw new ZuError(`「${statement.id}」の置き方が循環しています`, statement.at);
    resolving.add(key);

    const { placement } = statement;
    const relation = relations.get(statement.id)!;
    let value = 0;
    if (placement?.kind === "at") {
      value = placement[coord];
    } else if (relation) {
      const from = position(relation.base, coord);
      const { coord: along, sign } = DIRECTION_OF[relation.direction];
      if (along !== coord) {
        value = from;
      } else {
        const self = extent(sizes.get(statement.id)!, coord);
        const other = extent(sizes.get(relation.base.id)!, coord);
        value =
          sign > 0
            ? from + other.after + relation.gap + self.before
            : from - (other.before + relation.gap + self.after);
      }
    }

    resolving.delete(key);
    owns.set(key, value);
    return value;
  }

  // 置き方をたどると同じ揃えの別の図形と同じ位置になる図形(row で right of など)は、
  // 合わせる先を決めるときに数えない
  function follows(statement: ShapeStatement, group: Group, coord: Coord) {
    const seen = new Set<ShapeStatement>();
    let current = statement;
    for (;;) {
      const relation = relations.get(current.id);
      if (!relation || DIRECTION_OF[relation.direction].coord === coord) return false;
      current = relation.base;
      if (group.members.includes(current)) return true;
      if (seen.has(current)) return false;
      seen.add(current);
    }
  }

  // 揃える位置。above/below(column では left/right)で置いた図形は基準から離れる向きにだけ動かす。
  // それ以外の置き方の図形があれば、そのうち最初に挙げたものに合わせる
  function aligned(group: Group, coord: Coord): number {
    if (group.value !== undefined) return group.value;
    if (group.resolving) throw new ZuError("揃えと置き方が循環しています", group.at);
    group.resolving = true;

    const candidates = group.members
      .filter((member) => !follows(member, group, coord))
      .map((member) => {
        const relation = relations.get(member.id);
        const along = relation ? DIRECTION_OF[relation.direction] : null;
        const pull = along && along.coord === coord ? along.sign : 0;
        return { value: own(member, coord), pull };
      });
    const first = candidates[0];
    if (!first) throw new ZuError("揃えと置き方が循環しています", group.at);

    const fixed = candidates.find(({ pull }) => pull === 0);
    const values = candidates.map(({ value }) => value);
    let value = first.value;
    if (fixed) value = fixed.value;
    else if (candidates.every(({ pull }) => pull > 0)) value = Math.max(...values);
    else if (candidates.every(({ pull }) => pull < 0)) value = Math.min(...values);

    group.resolving = false;
    group.value = value;
    return value;
  }

  return new Map(
    statements.map((statement) => [statement.id, { x: position(statement, "x"), y: position(statement, "y") }]),
  );
}

// 同じ向きの揃えで図形を共有するものは一つにまとめる。並びは最初に挙げた順
function buildGroups(aligns: AlignStatement[], byId: Map<string, ShapeStatement>, axis: AlignStatement["axis"]) {
  const parent = new Map<string, string>();
  const root = (id: string): string => {
    const up = parent.get(id)!;
    if (up === id) return id;
    const top = root(up);
    parent.set(id, top);
    return top;
  };
  const order: string[] = [];
  const firstAt = new Map<string, AlignStatement["at"]>();

  for (const align of aligns) {
    const seen = new Set<string>();
    for (const member of align.members) {
      if (!byId.has(member.id)) throw new ZuError(`「${member.id}」という図形はありません`, member.at);
      if (seen.has(member.id)) throw new ZuError(`「${member.id}」を2回挙げています`, member.at);
      seen.add(member.id);
    }
    if (align.axis !== axis) continue;
    for (const { id } of align.members) {
      if (!parent.has(id)) {
        parent.set(id, id);
        order.push(id);
        firstAt.set(id, align.at);
      }
    }
    const [head, ...rest] = align.members.map(({ id }) => root(id));
    for (const id of rest) if (id !== head) parent.set(id, head!);
  }

  const byRoot = new Map<string, Group>();
  const groups = new Map<string, Group>();
  for (const id of order) {
    const key = root(id);
    let group = byRoot.get(key);
    if (!group) {
      group = { members: [], at: firstAt.get(id)!, value: undefined, resolving: false };
      byRoot.set(key, group);
    }
    group.members.push(byId.get(id)!);
    groups.set(id, group);
  }
  return groups;
}
