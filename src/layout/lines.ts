// 線の両端の位置とラベルの場所を決める。図形の位置には、ラベルの入る間(roomFor)を通してだけ影響する
import { ZuError } from "../errors.ts";
import type { Head, LineStatement, LineStyle } from "../syntax/ast.ts";
import { along, clip, direction, distance, grow } from "./geometry.ts";
import type { Box, Point } from "./geometry.ts";
import { aimInside, spreadTips, tipInside } from "./into.ts";
import { LABEL, labelSize, placeLabels } from "./labels.ts";

// 線の端。point は線の端の位置(図形の本体の手前か、中まで伸ばした所)
export type PlacedEnd = { id: string; point: Point; head: Head };

export type PlacedLine = {
  style: LineStyle;
  from: PlacedEnd;
  to: PlacedEnd;
  label: string | null;
  // ラベルの下地の外枠
  labelBox: Box | null;
  // 端を図形の中まで伸ばした線(into)。図形に隠れないよう、図形の上に重ねる
  over: boolean;
};

// 線を結ぶ図形の枠。anchor は本体の中心、body は線を切る本体の枠、inner は中まで伸ばす端を置いてよい枠、box は外枠
export type ShapeFrame = { id: string; anchor: Point; body: Box; inner: Box; box: Box };

// 線の端と図形の本体の間、同じ2つの図形を結ぶ線どうしの間隔、ラベルと矢先の間
const LINE = { margin: 6, spacing: 16, clearance: 10 };

// 矢先の大きさ。二重線は2本を覆うよう大きくする。描く段(svg)もこれを使う
export const HEAD = { length: 12, width: 10, radius: 4, doubleScale: 1.35 };

export const headScale = (style: LineStyle) => (style === "double" ? HEAD.doubleScale : 1);

// 矢先が線の向きに占める長さ
export function headLength(head: Head, style: LineStyle) {
  if (head === "none") return 0;
  return (head === "dot" ? HEAD.radius * 2 : HEAD.length) * headScale(style);
}

// 2つの図形 a、b を coord の向きに並べるとき、ラベルが収まるのに要る間。ラベル付きの線がなければ 0。
// 1. a と b を結ぶ線のラベルと矢先
// 2. a と b の両方と線で結ばれた図形 t があれば(三角形)、t へ向かう2辺のラベルを a と b の間に積める分。
//    三角形の辺のラベルは、a と b の間の幅に並ぶので
export function roomFor(statements: LineStatement[], a: string, b: string, coord: "x" | "y") {
  const between = (p: string, q: string) =>
    statements.filter(({ from, to }) => (from.id === p && to.id === q) || (from.id === q && to.id === p));
  const extent = (label: string) => labelSize(label)[coord === "x" ? "width" : "height"];

  let room = 0;
  for (const { label, style, from, to } of between(a, b)) {
    if (label === null) continue;
    const heads = headLength(from.head, style) + headLength(to.head, style);
    room = Math.max(room, extent(label) + heads + 2 * (LINE.margin + LINE.clearance));
  }

  const others = new Set(statements.flatMap(({ from, to }) => [from.id, to.id]));
  for (const t of others) {
    if (t === a || t === b) continue;
    const sides = [between(a, t), between(b, t)];
    if (sides.some((side) => side.length === 0)) continue;
    const stacked = sides
      .flat()
      .reduce((sum, { label }) => sum + (label === null ? 0 : extent(label) + LABEL.aside * 2), 0);
    if (stacked > 0) room = Math.max(room, stacked + 2 * LINE.clearance);
  }
  return room;
}

// 線を引く前の下書き。添字 0 は from の側、1 は to の側。aim は線が向かう点、tip は中まで伸ばす端の位置
type Draft = {
  statement: LineStatement;
  frames: [ShapeFrame, ShapeFrame];
  aims: [Point, Point];
  tips: [Point | null, Point | null];
  // 同じ組の線をずらす向き(名前の順で決める)と、ずらした量
  normal: Point;
  offset: number;
};

export function placeLines(statements: LineStatement[], frames: Map<string, ShapeFrame>): PlacedLine[] {
  for (const statement of statements) {
    for (const end of [statement.from, statement.to]) {
      if (!frames.has(end.id)) throw new ZuError(`「${end.id}」という図形はありません`, end.at);
    }
    if (statement.from.id === statement.to.id) {
      throw new ZuError("同じ図形どうしは線で結べません", statement.to.at);
    }
  }

  const drafts = draftLines(statements, frames);
  spreadAllTips(drafts);
  const segments = drafts.map(cut);

  // ラベルは図形、矢先、ほかの線、先に置いたラベルを避けて置く
  const headBoxes = segments.flatMap(({ statement, start, end }) =>
    (
      [
        [start, statement.from.head],
        [end, statement.to.head],
      ] as const
    )
      .filter(([, head]) => head !== "none")
      .map(([point, head]) => grow({ ...point, width: 0, height: 0 }, headLength(head, statement.style))),
  );
  const labelBoxes = placeLabels(
    segments.map(({ statement, start, end, side }) => ({ start, end, label: statement.label, side })),
    [...[...frames.values()].map(({ box }) => box), ...headBoxes],
  );

  return segments.map(({ statement, start, end }, index) => ({
    style: statement.style,
    from: { id: statement.from.id, point: start, head: statement.from.head },
    to: { id: statement.to.id, point: end, head: statement.to.head },
    label: statement.label,
    labelBox: labelBoxes[index]!,
    over: statement.from.into || statement.to.into,
  }));
}

// 1. 図形の本体の中心どうしを結ぶ。同じ2つの図形を結ぶ線は、平行にずらして重ならないようにする
function draftLines(statements: LineStatement[], frames: Map<string, ShapeFrame>): Draft[] {
  const pairKey = ({ from, to }: LineStatement) => [from.id, to.id].sort().join("\u0000");
  const counts = new Map<string, number>();
  for (const statement of statements) counts.set(pairKey(statement), (counts.get(pairKey(statement)) ?? 0) + 1);
  const seen = new Map<string, number>();

  return statements.map((statement) => {
    const key = pairKey(statement);
    const order = seen.get(key) ?? 0;
    seen.set(key, order + 1);
    const offset = (order - (counts.get(key)! - 1) / 2) * LINE.spacing;

    const a = frames.get(statement.from.id)!;
    const b = frames.get(statement.to.id)!;
    // ずらす向きは、結ぶ向きによらず名前の順で決める
    const [first, second] = a.id < b.id ? [a, b] : [b, a];
    const u = direction(first.anchor, second.anchor);
    const normal = u.x === 0 && u.y === 0 ? { x: 0, y: 1 } : { x: -u.y, y: u.x };

    // 中まで伸ばす端は、線が向かう点を図形の内側の枠に収める
    const aim = (frame: ShapeFrame, into: boolean) => {
      const point = along(frame.anchor, normal, offset);
      return into ? aimInside(point, frame.inner) : point;
    };
    const aims: [Point, Point] = [aim(a, statement.from.into), aim(b, statement.to.into)];
    const tips: Draft["tips"] = [
      statement.from.into ? tipInside(a.inner, aims[0], aims[1]) : null,
      statement.to.into ? tipInside(b.inner, aims[1], aims[0]) : null,
    ];
    return { statement, frames: [a, b], aims, tips, normal, offset };
  });
}

// 2. 同じ図形に刺さる端(into)が近すぎれば離す
function spreadAllTips(drafts: Draft[]) {
  const byShape = new Map<ShapeFrame, { draft: Draft; side: 0 | 1 }[]>();
  for (const draft of drafts) {
    for (const side of [0, 1] as const) {
      if (!draft.tips[side]) continue;
      const frame = draft.frames[side];
      byShape.set(frame, [...(byShape.get(frame) ?? []), { draft, side }]);
    }
  }
  for (const [frame, stuck] of byShape) {
    const spread = spreadTips(
      frame.inner,
      stuck.map(({ draft, side }) => draft.tips[side]!),
    );
    stuck.forEach(({ draft, side }, index) => (draft.tips[side] = spread[index]!));
  }
}

// 3. 線の両端を決める。中まで伸ばす端はその点、ほかの端は本体の手前で切る
function cut({ statement, frames, aims, tips, normal, offset }: Draft) {
  const p = tips[0] ?? aims[0];
  const q = tips[1] ?? aims[1];
  const d = direction(p, q);
  // 向かう点から、本体(に余白を足した枠)の外へ出るまでの長さ
  const leave = (frame: ShapeFrame, from: Point, toward: Point) =>
    clip(from, toward, grow(frame.body, LINE.margin))?.[1] ?? 0;
  const fromStart = tips[0] ? 0 : leave(frames[0], p, d);
  const fromEnd = tips[1] ? 0 : leave(frames[1], q, { x: -d.x, y: -d.y });
  // 図形が重なっていて切ると線が残らないときは、向かう点どうしを結ぶ
  const [start, end] =
    fromStart + fromEnd < distance(p, q) ? [along(p, d, fromStart), along(q, d, -fromEnd)] : [p, q];

  // ラベルを脇に置くなら、組の外側(ずらした向き)を先に試す。この線から見た向き(左が 1)に直す
  const towards = Math.sign(offset) || 1;
  const side = towards * (Math.sign(-d.y * normal.x + d.x * normal.y) || 1);
  return { statement, start, end, side };
}
