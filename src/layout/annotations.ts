// 図形に紐づく注釈(発言の吹き出しと、小さな字の注記)の置き場所。図形と線を置いた後に、
// 図形のまわりの候補を順に試し、図形、線、ラベル、先に置いた注釈に重ならない最初の場所に置く。図形の位置は変えない
import { ZuError } from "../errors.ts";
import type { AnnotationKind, AnnotationStatement, Spot } from "../syntax/ast.ts";
import { along, clip, direction, grow, overlapArea } from "./geometry.ts";
import type { Box, Path, Point } from "./geometry.ts";
import { crosses } from "./labels.ts";
import type { PlacedLine, ShapeFrame } from "./lines.ts";
import { FONT_SIZE, measureText } from "./measure.ts";

// 吹き出しの尾。base は吹き出しの縁の上の2点、tip は図形のそばの先端
export type Tail = { base: [Point, Point]; tip: Point };

// box は吹き出しの枠か、注記の字の外枠。tail は吹き出しの尾(注記は null)
export type PlacedAnnotation = {
  annotation: AnnotationKind;
  target: string;
  text: string;
  fontSize: number;
  box: Box;
  tail: Tail | null;
};

// 吹き出し: 字のまわりの余白、図形との間(尾の長さ)、角の丸み、尾の付け根の幅、尾の先と図形の間。
// 注記: 字の大きさと、図形との間
export const SAYS = { padX: 8, padY: 4, gap: 12, radius: 8, tail: 10, reach: 3 };
export const NOTE = { fontSize: 12, gap: 3, stack: 1 };

// 置き場所の向き。v は上(-1)、下(1)、中(0)。h は左(-1)、右(1)、中(0)
type Way = { v: -1 | 0 | 1; h: -1 | 0 | 1 };

// 書かなければ試す順。吹き出しは漫画のように頭の上(斜め上)から、注記は名札のように下から
const ORDER: Record<AnnotationKind, Way[]> = {
  says: [
    { v: -1, h: 1 },
    { v: -1, h: -1 },
    { v: -1, h: 0 },
    { v: 0, h: 1 },
    { v: 0, h: -1 },
    { v: 1, h: 1 },
    { v: 1, h: -1 },
    { v: 1, h: 0 },
  ],
  note: [
    { v: 1, h: 0 },
    { v: 0, h: 1 },
    { v: 0, h: -1 },
    { v: -1, h: 0 },
    { v: 1, h: 1 },
    { v: 1, h: -1 },
    { v: -1, h: 1 },
    { v: -1, h: -1 },
  ],
};

const wayOf = ({ vertical, horizontal }: Spot): Way => ({
  v: vertical === "above" ? -1 : vertical === "below" ? 1 : 0,
  h: horizontal === "left" ? -1 : horizontal === "right" ? 1 : 0,
});

// 線を横切る注釈の重さ。重なりの面積と比べる
const CROSSING = 1000;

export function placeAnnotations(
  statements: AnnotationStatement[],
  shapes: Map<string, ShapeFrame>,
  lines: PlacedLine[],
): PlacedAnnotation[] {
  const lineNames = new Set(lines.flatMap(({ id }) => (id === null ? [] : [id])));
  const obstacles: Box[] = [
    ...[...shapes.values()].map(({ box }) => box),
    ...lines.flatMap(({ labelBox }) => (labelBox ? [labelBox] : [])),
  ];
  const paths: Path[] = lines.map(({ from, to, control }) => ({ start: from.point, control, end: to.point }));
  // 図形ごと、向きごとに、先に置いた注記(続けて並べるため)
  const stacks = new Map<string, Box>();

  return statements.map((statement) => {
    const frame = shapes.get(statement.target);
    if (!frame) {
      if (lineNames.has(statement.target)) {
        throw new ZuError(`「${statement.target}」は線です(注釈は図形に付けます)`, statement.targetAt);
      }
      throw new ZuError(`「${statement.target}」という図形はありません`, statement.targetAt);
    }
    const says = statement.annotation === "says";
    const fontSize = says ? FONT_SIZE : NOTE.fontSize;
    const text = measureText(statement.text, fontSize);
    const size = says
      ? { width: text.width + SAYS.padX * 2, height: text.height + SAYS.padY * 2 }
      : { width: text.width, height: text.height };

    const ways = statement.spot ? [wayOf(statement.spot)] : ORDER[statement.annotation];
    const key = (way: Way) => `${statement.target}\u0000${statement.annotation}\u0000${way.v},${way.h}`;
    const candidates = ways.map((way) => ({ way, box: spotBox(frame, size, way, says, stacks.get(key(way)) ?? null) }));
    const cost = (box: Box) => {
      let total = 0;
      for (const other of obstacles) total += overlapArea(box, other);
      for (const path of paths) if (crosses(path, box)) total += CROSSING;
      return total;
    };
    let best = candidates[0]!;
    let bestCost = Infinity;
    for (const candidate of candidates) {
      const value = cost(candidate.box);
      if (value < bestCost) {
        best = candidate;
        bestCost = value;
      }
      if (bestCost === 0) break;
    }
    obstacles.push(best.box);
    if (!says) stacks.set(key(best.way), best.box);
    return {
      annotation: statement.annotation,
      target: statement.target,
      text: statement.text,
      fontSize,
      box: best.box,
      tail: says ? tailOf(best.box, best.way, frame) : null,
    };
  });
}

// 図形のまわりの、向き way の置き場所。左右は図形の外枠の外、上下は外枠の上か下、中は本体の中心に揃える。
// 吹き出しの斜めは、図形の中心から外へ伸ばす(頭の上に出る形)。注記の斜めは、外枠の角の外に置く。
// 同じ図形の同じ向きに注記があれば、その続き(下向きならその下、上向きならその上)に置く
function spotBox(frame: ShapeFrame, size: { width: number; height: number }, way: Way, says: boolean, previous: Box | null): Box {
  const { box, anchor } = frame;
  const gap = says ? SAYS.gap : NOTE.gap;
  const diagonal = way.v !== 0 && way.h !== 0;
  let x: number;
  if (way.h === 0) x = anchor.x - size.width / 2;
  else if (diagonal && says) x = way.h === 1 ? anchor.x : anchor.x - size.width;
  else x = way.h === 1 ? box.x + box.width + gap : box.x - gap - size.width;

  let y: number;
  if (way.v === 0) y = anchor.y - size.height / 2;
  else y = way.v === 1 ? box.y + box.height + gap : box.y - gap - size.height;

  if (previous) {
    y = way.v === -1 ? previous.y - NOTE.stack - size.height : previous.y + previous.height + NOTE.stack;
    if (way.h === 0) x = anchor.x - size.width / 2;
  }
  return { x, y, ...size };
}

// 吹き出しの尾。図形に面した縁から、図形の本体の中心へ向けて、本体の手前まで伸ばす。
// 付け根は、縁の上で図形の中心にいちばん近い所(角の丸みは避ける)
function tailOf(bubble: Box, way: Way, frame: ShapeFrame): Tail {
  const { anchor, body } = frame;
  const half = SAYS.tail / 2;
  const margin = SAYS.radius + half;
  const clampTo = (value: number, low: number, high: number) => (low > high ? (low + high) / 2 : Math.min(Math.max(value, low), high));
  let base: [Point, Point];
  if (way.v !== 0) {
    // 上か下にある吹き出しは、図形に面した横の縁から
    const y = way.v === -1 ? bubble.y + bubble.height : bubble.y;
    const x = clampTo(anchor.x, bubble.x + margin, bubble.x + bubble.width - margin);
    base = [
      { x: x - half, y },
      { x: x + half, y },
    ];
  } else {
    const x = way.h === 1 ? bubble.x : bubble.x + bubble.width;
    const y = clampTo(anchor.y, bubble.y + margin, bubble.y + bubble.height - margin);
    base = [
      { x, y: y - half },
      { x, y: y + half },
    ];
  }
  const middle = { x: (base[0].x + base[1].x) / 2, y: (base[0].y + base[1].y) / 2 };
  const d = direction(middle, anchor);
  const enter = clip(middle, d, grow(body, SAYS.reach))?.[0];
  const tip = enter !== undefined && enter > 0 ? along(middle, d, enter) : along(middle, d, SAYS.gap);
  return { base, tip };
}
