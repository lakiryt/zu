import { ZuError } from "../errors.ts";
import type { AlignStatement, Direction, Document, Shape, ShapeStatement } from "../syntax/ast.ts";
import { measureText } from "./measure.ts";

// 図形の外枠。左上の座標と大きさ
export type Box = { x: number; y: number; width: number; height: number };

export type Point = { x: number; y: number };

// 図形ごとの描き方に要る寸法。外枠の中のどこに何を描くかは svg 側で決める
export type Geometry =
  | { shape: "text" }
  | { shape: "parallelogram"; skew: number }
  // 立方体は外枠の上部に描き、ラベルはその下に置く。labelTop は外枠の上端からラベルの上端まで
  | { shape: "cube"; edge: number; depth: number; labelTop: number };

// anchor は図形の本体(ラベルを除く)の中心。at、相対配置の揃え、align はこの点で決まる
export type PlacedShape = { id: string; label: string; box: Box; anchor: Point; geometry: Geometry };

export type Scene = { width: number; height: number; shapes: PlacedShape[] };

export const DEFAULT_GAP = 40;
export const PADDING = 20;
const PARALLELOGRAM = { minWidth: 120, height: 60, padding: 24, skewRatio: 0.5 };
const CUBE = { edge: 60, depthRatio: 0.3, labelGap: 6 };

// anchorTop は外枠の上端から本体の中心まで
type Sized = { width: number; height: number; anchorTop: number; geometry: Geometry };

function sizeOf(statement: ShapeStatement, label: string): Sized {
  const text = measureText(label);
  const shape: Shape = statement.shape;
  if (shape === "text") return { ...text, anchorTop: text.height / 2, geometry: { shape } };

  if (shape === "parallelogram") {
    const height = statement.size?.height ?? PARALLELOGRAM.height;
    const skew = height * PARALLELOGRAM.skewRatio;
    const fitted = Math.max(PARALLELOGRAM.minWidth, text.width + PARALLELOGRAM.padding * 2 + skew);
    return { width: statement.size?.width ?? fitted, height, anchorTop: height / 2, geometry: { shape, skew } };
  }

  const edge = statement.size?.width ?? CUBE.edge;
  const depth = edge * CUBE.depthRatio;
  return {
    width: Math.max(edge + depth, text.width),
    height: edge + depth + CUBE.labelGap + text.height,
    anchorTop: (edge + depth) / 2,
    geometry: { shape, edge, depth, labelTop: edge + depth + CUBE.labelGap },
  };
}

// x と y は別々に解く。相対配置は向きの軸では間を空け、もう一方の軸では基準に揃える
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

// 文を図形の外枠に置き換える。置き方と揃えをたどって本体の中心を決め、全体を余白の内側へ寄せる
export function layout(document: Document): Scene {
  const statements = document.statements.filter((statement) => statement.kind === "shape");
  const aligns = document.statements.filter((statement) => statement.kind === "align");

  const byId = new Map<string, ShapeStatement>();
  for (const statement of statements) {
    if (byId.has(statement.id)) {
      throw new ZuError(`「${statement.id}」という名前の図形がすでにあります`, statement.at);
    }
    byId.set(statement.id, statement);
  }
  for (const { placement } of statements) {
    if (placement?.kind === "beside" && !byId.has(placement.of)) {
      throw new ZuError(`「${placement.of}」という図形はありません`, placement.at);
    }
  }

  const sizes = new Map(
    statements.map((statement) => [statement.id, sizeOf(statement, statement.label ?? statement.id)]),
  );

  // 置き方がなければ、直前の図形の右に置く。最初の図形と at の図形には基準がない
  const relations = new Map<string, Relation | null>(
    statements.map((statement, index): [string, Relation | null] => {
      const { placement } = statement;
      if (placement?.kind === "at") return [statement.id, null];
      if (placement) {
        const base = byId.get(placement.of)!;
        return [statement.id, { base, direction: placement.direction, gap: placement.gap ?? DEFAULT_GAP }];
      }
      const previous = statements[index - 1];
      return [statement.id, previous ? { base: previous, direction: "right", gap: DEFAULT_GAP } : null];
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

  const placed = statements.map((statement) => {
    const size = sizes.get(statement.id)!;
    const anchor = { x: position(statement, "x"), y: position(statement, "y") };
    const box = {
      x: anchor.x - size.width / 2,
      y: anchor.y - size.anchorTop,
      width: size.width,
      height: size.height,
    };
    return { statement, size, anchor, box };
  });

  // いちばん左上の図形が余白のすぐ内側に来るようずらす
  const shiftX = PADDING - Math.min(Infinity, ...placed.map(({ box }) => box.x));
  const shiftY = PADDING - Math.min(Infinity, ...placed.map(({ box }) => box.y));

  const shapes = placed.map(({ statement, size, anchor, box }) => ({
    id: statement.id,
    label: statement.label ?? statement.id,
    box: { ...box, x: box.x + shiftX, y: box.y + shiftY },
    anchor: { x: anchor.x + shiftX, y: anchor.y + shiftY },
    geometry: size.geometry,
  }));

  if (shapes.length === 0) return { width: PADDING * 2, height: PADDING * 2, shapes };
  const right = Math.max(...shapes.map(({ box }) => box.x + box.width));
  const bottom = Math.max(...shapes.map(({ box }) => box.y + box.height));
  return { width: right + PADDING, height: bottom + PADDING, shapes };
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
