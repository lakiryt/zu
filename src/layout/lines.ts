// 線の両端の位置とラベルの場所を決める。図形の位置には、ラベルの入る間(roomFor)を通してだけ影響する
import { ZuError } from "../errors.ts";
import type { Head, LineStatement, LineStyle } from "../syntax/ast.ts";
import { along, clip, direction, distance, grow } from "./geometry.ts";
import type { Box, Point } from "./geometry.ts";
import { aimInside, spreadTips, tipInside } from "./into.ts";
import { LABEL, labelSize, placeLabels } from "./labels.ts";

// 線の端。id はつないだ図形か線。point は線の端の位置(図形の本体の手前か、中まで伸ばした所)
export type PlacedEnd = { id: string; point: Point; head: Head };

// id は線の名前(as。なければ null)
export type PlacedLine = {
  id: string | null;
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
// 線に向けた線の端と、向けた先のラベルの下地や線との間(二重線は2本の外側で止める)。
// 同じ線に当てる端どうしの間隔。shallow は、線に浅く当たるときに止める長さを抑える角度の正弦
const ONTO = { label: 1, line: 1.5, double: 3, spacing: 12, shallow: 0.3 };

// 線を向ける先。図形か、名前を付けた線。線なら anchor は当てる点、body は当てる枠(ラベルの下地か、大きさのない点)。
// margin は線の端を body のどれだけ手前で止めるか。
// along は線そのものに当てるときのその線(anchor を中点とする向き u、長さ length)。当てる点はこの線の上で動かす
type Target = ShapeFrame & { margin: number; along: { u: Point; length: number } | null };

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
// 線に向けた線は数えない(図形の位置は、図形どうしを結ぶ線だけで決める)
export function roomFor(all: LineStatement[], a: string, b: string, coord: "x" | "y") {
  const names = new Set(all.flatMap(({ id }) => (id === null ? [] : [id])));
  const statements = all.filter(({ from, to }) => !names.has(from.id) && !names.has(to.id));
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
  frames: [Target, Target];
  aims: [Point, Point];
  tips: [Point | null, Point | null];
  // 同じ組の線をずらす向き(名前の順で決める)と、ずらした量
  normal: Point;
  offset: number;
};

// 図形どうしを結ぶ線を先に置き、線に向けた線は、向ける先の線が決まってから順に置く
export function placeLines(statements: LineStatement[], shapes: Map<string, ShapeFrame>): PlacedLine[] {
  check(statements, shapes);
  const targets = new Map<string, Target>(
    [...shapes].map(([id, frame]) => [id, { ...frame, margin: LINE.margin, along: null }]),
  );
  const result: PlacedLine[] = [];
  // ラベルが避けるもの。図形、矢先、先に置いたラベルと線
  const obstacles = [...shapes.values()].map(({ box }) => box);
  const earlier: { start: Point; end: Point }[] = [];

  let waiting = statements.map((statement, index) => ({ statement, index }));
  while (waiting.length > 0) {
    const ready = waiting.filter(({ statement }) => targets.has(statement.from.id) && targets.has(statement.to.id));
    if (ready.length === 0) throw new ZuError("線の向ける先が循環しています", waiting[0]!.statement.at);

    const drafts = draftLines(
      ready.map(({ statement }) => statement),
      targets,
    );
    spreadAllTips(drafts);
    spreadOnLines(drafts);
    const segments = drafts.map(cut);

    obstacles.push(...segments.flatMap(headBoxes));
    const labelBoxes = placeLabels(
      segments.map(({ statement, start, end, side }) => ({ start, end, label: statement.label, side })),
      obstacles,
      earlier,
    );

    segments.forEach(({ statement, start, end }, index) => {
      const line: PlacedLine = {
        id: statement.id,
        style: statement.style,
        from: { id: statement.from.id, point: start, head: statement.from.head },
        to: { id: statement.to.id, point: end, head: statement.to.head },
        label: statement.label,
        labelBox: labelBoxes[index]!,
        over: statement.from.into || statement.to.into,
      };
      result[ready[index]!.index] = line;
      earlier.push({ start, end });
      if (line.labelBox) obstacles.push(line.labelBox);
      if (line.id !== null) targets.set(line.id, lineTarget(line.id, line));
    });
    waiting = waiting.filter((entry) => !ready.includes(entry));
  }
  return result;
}

// 名前の重なり、ない図形や線を結ぶ誤り、線に向けられない端
function check(statements: LineStatement[], shapes: Map<string, ShapeFrame>) {
  const names = new Set<string>();
  for (const { id, at } of statements) {
    if (id === null) continue;
    if (shapes.has(id)) throw new ZuError(`「${id}」という名前の図形がすでにあります`, at);
    if (names.has(id)) throw new ZuError(`「${id}」という名前の線がすでにあります`, at);
    names.add(id);
  }
  for (const statement of statements) {
    for (const end of [statement.from, statement.to]) {
      if (!shapes.has(end.id) && !names.has(end.id)) throw new ZuError(`「${end.id}」という図形や線はありません`, end.at);
      if (end.id === statement.id) throw new ZuError("線をその線自身に向けることはできません", end.at);
      if (end.into && names.has(end.id)) throw new ZuError(`「${end.id}」は線なので、中まで伸ばせません`, end.at);
    }
    if (statement.from.id === statement.to.id) {
      throw new ZuError("同じ図形どうしは線で結べません", statement.to.at);
    }
  }
}

// 線に向ける線の当て先。線の中点を狙う。線がラベルの下地を通っていれば(ラベルが線の上にあれば)、ラベルに当てる
function lineTarget(id: string, { style, from, to, labelBox }: PlacedLine): Target {
  const p = from.point;
  const q = to.point;
  if (labelBox && clip(p, { x: q.x - p.x, y: q.y - p.y }, labelBox, 0, 1)) {
    const anchor = { x: labelBox.x + labelBox.width / 2, y: labelBox.y + labelBox.height / 2 };
    return { id, anchor, body: labelBox, inner: labelBox, box: labelBox, margin: ONTO.label, along: null };
  }
  const u = direction(p, q);
  const length = distance(p, q);
  const middle = along(p, u, length / 2);
  const point = { ...middle, width: 0, height: 0 };
  const margin = style === "double" ? ONTO.double : ONTO.line;
  return { id, anchor: middle, body: point, inner: point, box: point, margin, along: { u, length } };
}

// 線そのものに当てる端の、当てる点の位置(線の中点から線に沿って測った長さ)
const positionOn = (frame: Target, point: Point) =>
  (point.x - frame.anchor.x) * frame.along!.u.x + (point.y - frame.anchor.y) * frame.along!.u.y;

// 線に当てる点を、その線の上の位置 t に置く。線の端を越えないようにする
function pointOn(frame: Target, t: number) {
  const half = Math.max(0, frame.along!.length / 2 - ONTO.spacing / 2);
  return along(frame.anchor, frame.along!.u, Math.min(Math.max(t, -half), half));
}

// 矢先の占める枠。ラベルはこれを避ける
function headBoxes({ statement, start, end }: { statement: LineStatement; start: Point; end: Point }) {
  return (
    [
      [start, statement.from.head],
      [end, statement.to.head],
    ] as const
  )
    .filter(([, head]) => head !== "none")
    .map(([point, head]) => grow({ ...point, width: 0, height: 0 }, headLength(head, statement.style)));
}

// 1. 本体の中心(線なら当てる点)どうしを結ぶ。同じ2つを結ぶ線は、平行にずらして重ならないようにする
function draftLines(statements: LineStatement[], frames: Map<string, Target>): Draft[] {
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

    // 中まで伸ばす端は、線が向かう点を図形の内側の枠に収める。線に当てる端は、ずらしてもその線の上に置く
    const aim = (frame: Target, into: boolean) => {
      const point = along(frame.anchor, normal, offset);
      if (frame.along) return pointOn(frame, positionOn(frame, point));
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
  const byShape = new Map<Target, { draft: Draft; side: 0 | 1 }[]>();
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

// 2'. 同じ線に当てる端が近すぎれば、その線に沿って離す。並びは、もう一方の端が線のどちら寄りにあるかの順
function spreadOnLines(drafts: Draft[]) {
  const byLine = new Map<Target, { draft: Draft; side: 0 | 1; order: number }[]>();
  for (const draft of drafts) {
    for (const side of [0, 1] as const) {
      const frame = draft.frames[side];
      if (!frame.along) continue;
      const order = positionOn(frame, draft.aims[side]) * 1000 + positionOn(frame, draft.aims[1 - side]!);
      byLine.set(frame, [...(byLine.get(frame) ?? []), { draft, side, order }]);
    }
  }
  for (const [frame, ends] of byLine) {
    if (ends.length < 2) continue;
    ends.sort((a, b) => a.order - b.order);
    const at = ends.map(({ draft, side }) => positionOn(frame, draft.aims[side]));
    if (at.every((t, index) => index === 0 || t - at[index - 1]! >= ONTO.spacing)) continue;
    const center = at.reduce((sum, t) => sum + t, 0) / at.length;
    ends.forEach(({ draft, side }, index) => {
      draft.aims[side] = pointOn(frame, center + (index - (ends.length - 1) / 2) * ONTO.spacing);
    });
  }
}

// 3. 線の両端を決める。中まで伸ばす端はその点、ほかの端は本体の手前で切る
function cut({ statement, frames, aims, tips, normal, offset }: Draft) {
  const p = tips[0] ?? aims[0];
  const q = tips[1] ?? aims[1];
  const d = direction(p, q);
  // 向かう点から、本体(に余白を足した枠)の外へ出るまでの長さ。
  // 線そのものに当てる端は、その線から margin 離れるまでの長さ(浅く当たっても離れすぎないよう、角度は抑える)
  const leave = (frame: Target, from: Point, toward: Point) => {
    if (frame.along) {
      const sine = Math.abs(toward.x * frame.along.u.y - toward.y * frame.along.u.x);
      return frame.margin / Math.max(sine, ONTO.shallow);
    }
    return clip(from, toward, grow(frame.body, frame.margin))?.[1] ?? 0;
  };
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
