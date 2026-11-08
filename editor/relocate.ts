// 図形を動かしたり消したりしても、ほかの図形をその場に残すための書き換え。
// 動かす図形につながっていた図形は、今の位置のまま別の置き方に付け替える。
//
// 進め方:
// 1. 付け替える図形をいったん座標(at)で今の位置に置く。これで循環は起こらない
// 2. 一つずつ、数の少ない置き方に置き換える。数のいらない置き方(置き方なし、既定の間の関係)で
//    元の位置の近くに置けるならそれを選び、少しずれるのは許す(.zu の綺麗さを優先する)。
//    だめなら間を書いた関係で位置をぴったり保ち、それもだめなら座標のまま残す
// 3. 座標が1つだけ残り、それを最初の図形にできるなら、置き方なしにする
import { DEFAULT_GAP, ZuError, defaultGap, layout, parse, print } from "../src/index.ts";
import type {
  AlignStatement,
  Direction,
  Document,
  PlacedShape,
  Placement,
  Point,
  Scene,
  ShapeStatement,
} from "../src/index.ts";
import * as edit from "./edit.ts";
import { placementsFor, slots } from "./snap.ts";

const TOLERANCE = 0.05;

function tryLayout(text: string): Scene | null {
  try {
    return layout(parse(text));
  } catch (error) {
    if (error instanceof ZuError) return null;
    throw error;
  }
}

const atPoint = (point: Point, origin: Point): Placement => ({
  kind: "at",
  x: Math.round((point.x - origin.x) * 100) / 100,
  y: Math.round((point.y - origin.y) * 100) / 100,
});

// 付け替える図形は、数を書かずに済むなら、元の位置からこの距離まではずれてよい(.zu の綺麗さを優先する)
const NEARBY = DEFAULT_GAP * 1.5;

// 図形を desired の位置に置いた図。吸着先や置き方の候補を作るのに使う
function placedAt(sizes: PlacedShape[], desired: Map<string, Point>) {
  return sizes
    .filter((shape) => desired.has(shape.id))
    .map((shape) => {
      const to = desired.get(shape.id)!;
      const dx = to.x - shape.anchor.x;
      const dy = to.y - shape.anchor.y;
      return { ...shape, anchor: to, box: { ...shape.box, x: shape.box.x + dx, y: shape.box.y + dy } };
    });
}

// affected 以外の図形が desired どおりなら、全図形の位置を desired と同じ座標で返す。
// 全体の平行移動は問わない(出力では全体をずらすので)
function measure(text: string, desired: Map<string, Point>, affected = new Set<string>()) {
  const scene = tryLayout(text);
  if (!scene) return null;
  const now = new Map(scene.shapes.map((shape) => [shape.id, shape.anchor]));
  let offset: Point | null = null;
  for (const [id, wanted] of desired) {
    const actual = now.get(id);
    if (!actual) return null;
    if (affected.has(id)) continue;
    offset ??= { x: actual.x - wanted.x, y: actual.y - wanted.y };
    if (Math.abs(actual.x - offset.x - wanted.x) > TOLERANCE) return null;
    if (Math.abs(actual.y - offset.y - wanted.y) > TOLERANCE) return null;
  }
  const shift = offset ?? { x: 0, y: 0 };
  return new Map([...now].map(([id, point]) => [id, { x: point.x - shift.x, y: point.y - shift.y }]));
}

// 図形の位置が desired のとおりか
const matches = (text: string, desired: Map<string, Point>) => measure(text, desired) !== null;

// 2 と 3 の段。loose の図形を数の少ない置き方にする。試す順:
// 元の置き方でぴったり → 数のいらない置き方で近く(いちばん近いもの) → 間を書いてぴったり → 座標のまま
// 数のいらない置き方でずれたときは、その図形とそれにつながる図形だけが動く
function tidy(text: string, loose: string[], desired: Map<string, Point>, sizes: PlacedShape[], original: Document) {
  let next = text;
  const replace = (document: Document, statement: ShapeStatement, placement: Placement | null) =>
    edit.replaceShape(next, document, { ...statement, placement });

  for (const id of loose) {
    const document = parse(next);
    const statement = edit.findShape(document, id);
    const placed = placedAt(sizes, desired);
    const self = placed.find((shape) => shape.id === id);
    if (!statement || !self) continue;
    const excluded = new Set([id, ...edit.dependents(document, id)]);
    const gapOf = (of: string, direction: Direction) => defaultGap(document, id, of, direction);

    const before = edit.findShape(original, id)?.placement ?? null;
    const unchanged = replace(document, statement, before);
    if (matches(unchanged, desired)) {
      next = unchanged;
      continue;
    }

    const plain: (Placement | null)[] = [
      null,
      ...slots(placed, self, excluded, gapOf).map(
        (slot): Placement => ({ kind: "beside", direction: slot.direction, of: slot.of, gap: null, at: edit.NOWHERE }),
      ),
    ];
    let best: { text: string; distance: number; positions: Map<string, Point>; affected: Set<string> } | null = null;
    for (const placement of plain) {
      const candidate = replace(document, statement, placement);
      const affected = new Set([id, ...edit.dependents(parse(candidate), id)]);
      const positions = measure(candidate, desired, affected);
      const to = positions?.get(id);
      if (!positions || !to) continue;
      const distance = Math.hypot(to.x - self.anchor.x, to.y - self.anchor.y);
      if (distance <= NEARBY && (!best || distance < best.distance - TOLERANCE)) {
        best = { text: candidate, distance, positions, affected };
      }
    }
    if (best) {
      next = best.text;
      for (const moved of best.affected) desired.set(moved, best.positions.get(moved)!);
      continue;
    }

    for (const placement of placementsFor(placed, self, self.anchor, excluded, gapOf)) {
      const candidate = replace(document, statement, placement);
      if (matches(candidate, desired)) {
        next = candidate;
        break;
      }
    }
  }

  // 座標で置いた図形が1つだけなら、それを最初の図形にして置き方なしにできる
  const document = parse(next);
  const list = edit.shapes(document);
  const fixed = list.filter((statement) => statement.placement?.kind === "at");
  const only = fixed[0];
  if (fixed.length === 1 && only) {
    const first = list[0]!;
    let candidate: string | null = null;
    if (first === only) {
      candidate = edit.replaceShape(next, document, { ...only, placement: null });
    } else if (first.placement !== null) {
      // 最初の図形に置き方があるときだけ、前に足しても最初の図形の位置は変わらない
      const removed = edit.rewrite(next, document, (statement) => (statement === only ? null : undefined));
      const start = edit.offsetOf(removed, { line: first.at.line - (only.at.line < first.at.line ? 1 : 0), column: 1 });
      candidate = removed.slice(0, start) + print({ ...only, placement: null }) + "\n" + removed.slice(start);
    }
    if (candidate !== null && matches(candidate, desired)) next = candidate;
  }
  return next;
}

export type Move = {
  // 一緒に動かす図形(選んでいる図形)。互いの位置関係は保つ
  moved: Set<string>;
  // 動かす量。null なら primary の新しい置き方から決まる
  delta: Point | null;
  // 新しい置き方を与える図形と、その置き方
  primary: string;
  placement: Placement | null;
};


// 揃えから外す図形を決め、揃えの書き換えと、揃えが変わって付け替えが要る図形を返す。
// 揃えから図形が抜けると、残った図形の段や列が変わることがあるので、残った図形も付け替える
function shrinkAligns(document: Document, leaving: (align: AlignStatement) => Set<string>) {
  const changes = new Map<AlignStatement, AlignStatement | null>();
  const unsettled = new Set<string>();
  for (const statement of document.statements) {
    if (statement.kind !== "align") continue;
    const gone = leaving(statement);
    if (gone.size === 0) continue;
    const members = statement.members.filter((member) => !gone.has(member.id));
    changes.set(statement, members.length < 2 ? null : { ...statement, members });
    for (const member of members) unsettled.add(member.id);
  }
  return { changes, unsettled };
}

// 1 の段: 揃えを書き換え、primary に新しい置き方を与え、loose の図形を座標で今の位置に置く
function pinDown(
  text: string,
  document: Document,
  changes: Map<AlignStatement, AlignStatement | null>,
  loose: string[],
  desired: Map<string, Point>,
  origin: Point,
  override: (statement: ShapeStatement) => ShapeStatement | null | undefined,
  // 消す図形。その図形に結んだ線も消す
  removed: string | null = null,
) {
  return edit.rewrite(text, document, (statement) => {
    if (statement.kind === "caption") return undefined;
    if (statement.kind === "align") return changes.has(statement) ? changes.get(statement) : undefined;
    if (statement.kind === "line") return statement.from.id === removed || statement.to.id === removed ? null : undefined;
    const overridden = override(statement);
    if (overridden !== undefined) return overridden;
    if (loose.includes(statement.id)) return { ...statement, placement: atPoint(desired.get(statement.id)!, origin) };
    return undefined;
  });
}

// 図形を動かす。moved 以外の図形は動かない
export function relocate(text: string, { moved, delta, primary, placement }: Move) {
  const document = parse(text);
  const scene = layout(document);
  const list = edit.shapes(document);
  const desired = new Map(
    scene.shapes.map((shape) => [
      shape.id,
      moved.has(shape.id) && delta ? { x: shape.anchor.x + delta.x, y: shape.anchor.y + delta.y } : shape.anchor,
    ]),
  );

  // 動いた向きの揃えからは、動いた図形を外す(揃えの全員が一緒に動くなら残す)
  const { changes, unsettled } = shrinkAligns(document, (align) => {
    if (!delta) return new Set();
    const shifted = align.axis === "row" ? Math.abs(delta.y) > TOLERANCE : Math.abs(delta.x) > TOLERANCE;
    const inside = align.members.filter((member) => moved.has(member.id));
    if (!shifted || inside.length === align.members.length) return new Set();
    return new Set(inside.map(({ id }) => id));
  });

  // 付け替える図形: 外から動く図形につながっていたもの、動く図形のうち外につながっていたもの、揃えが変わったもの
  const loose = list
    .filter((statement, index) => {
      if (statement.id === primary) return false;
      if (unsettled.has(statement.id)) return true;
      const base = edit.baseOf(list, index);
      if (moved.has(statement.id)) return base === null || !moved.has(base);
      return base !== null && moved.has(base);
    })
    .map(({ id }) => id);

  let next = pinDown(text, document, changes, loose, desired, scene.origin, (statement) =>
    statement.id === primary ? { ...statement, placement } : undefined,
  );

  const after = tryLayout(next);
  if (!after) throw new edit.EditError("ここには置けません");
  if (!delta) {
    // primary の行き先は、ほかの図形との相対で決める
    const reference = scene.shapes.find((shape) => shape.id !== primary);
    const at = after.shapes.find((shape) => shape.id === primary)!.anchor;
    if (reference) {
      const now = after.shapes.find((shape) => shape.id === reference.id)!.anchor;
      desired.set(primary, { x: at.x - now.x + reference.anchor.x, y: at.y - now.y + reference.anchor.y });
    } else {
      desired.set(primary, at);
    }
  }
  if (!matches(next, desired)) throw new edit.EditError("ここには置けません(揃えと合いません)");

  return tidy(next, loose, desired, scene.shapes, document);
}

// 図形を消す。ほかの図形は動かない
export function removeShape(text: string, id: string) {
  const document = parse(text);
  const scene = layout(document);
  const list = edit.shapes(document);
  if (!list.some((statement) => statement.id === id)) return text;
  const desired = new Map(scene.shapes.filter((shape) => shape.id !== id).map((shape) => [shape.id, shape.anchor]));
  const { changes, unsettled } = shrinkAligns(document, (align) =>
    align.members.some((member) => member.id === id) ? new Set([id]) : new Set(),
  );
  const loose = list
    .filter((statement, index) => statement.id !== id && (unsettled.has(statement.id) || edit.baseOf(list, index) === id))
    .map((statement) => statement.id);

  const next = pinDown(text, document, changes, loose, desired, scene.origin, (statement) =>
    statement.id === id ? null : undefined, id,
  );
  if (desired.size > 0 && !matches(next, desired)) throw new edit.EditError("消せませんでした");
  return tidy(next, loose, desired, scene.shapes, document);
}
