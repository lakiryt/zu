// ドラッグしたときの吸着先を、配置済みの図(Scene)から求める。DOM を知らない
import { DEFAULT_GAP, DIRECTIONS } from "../src/index.ts";
import type { Direction, PlacedShape, Placement, Point } from "../src/index.ts";
import { NOWHERE } from "./edit.ts";

// 位置が同じとみなす差
const EXACT = 0.05;

// 向きごとの軸と符号。right と below が正
const AXIS: Record<Direction, { coord: "x" | "y"; sign: 1 | -1 }> = {
  left: { coord: "x", sign: -1 },
  right: { coord: "x", sign: 1 },
  above: { coord: "y", sign: -1 },
  below: { coord: "y", sign: 1 },
};

// 本体の中心から外枠の手前(左か上)と奥(右か下)の端まで
function reach({ box, anchor }: PlacedShape, coord: "x" | "y") {
  const start = coord === "x" ? box.x : box.y;
  const size = coord === "x" ? box.width : box.height;
  return { before: anchor[coord] - start, after: start + size - anchor[coord] };
}

// base の direction の向きに、外枠どうしの間を gap 空けて self を置いたときの self の本体の中心
export function besideAnchor(base: PlacedShape, self: PlacedShape, direction: Direction, gap: number): Point {
  const { coord, sign } = AXIS[direction];
  const far = sign > 0 ? reach(base, coord).after : reach(base, coord).before;
  const near = sign > 0 ? reach(self, coord).before : reach(self, coord).after;
  return { ...base.anchor, [coord]: base.anchor[coord] + sign * (far + gap + near) };
}

// self の本体の中心を anchor に置いたとき、base との外枠どうしの間(direction の向き)
function gapBetween(base: PlacedShape, self: PlacedShape, direction: Direction, anchor: Point) {
  const { coord, sign } = AXIS[direction];
  const far = sign > 0 ? reach(base, coord).after : reach(base, coord).before;
  const near = sign > 0 ? reach(self, coord).before : reach(self, coord).after;
  return sign * (anchor[coord] - base.anchor[coord]) - far - near;
}

// 間を書かずに置くときの間。of の図形の direction に置く場合。配置の段の defaultGap と同じにする
export type GapOf = (of: string, direction: Direction) => number;
const fixedGap: GapOf = () => DEFAULT_GAP;

// 吸着先。dragged をそこへ置いたときの本体の中心(anchor)を持つ。gap が null なら既定の間
export type Slot = { direction: Direction; of: string; anchor: Point; gap: number | null };

// 既定の間で、ほかの図形の上下左右に置いたときの位置
export function slots(shapes: PlacedShape[], dragged: PlacedShape, excluded: Set<string>, gapOf: GapOf = fixedGap): Slot[] {
  return shapes
    .filter((shape) => shape.id !== dragged.id && !excluded.has(shape.id))
    .flatMap((shape) =>
      DIRECTIONS.map((direction) => ({
        direction,
        of: shape.id,
        gap: null,
        anchor: besideAnchor(shape, dragged, direction, gapOf(shape.id, direction)),
      })),
    );
}

export function nearest(candidates: Slot[], point: Point, radius: number) {
  let best: Slot | null = null;
  let bestDistance = radius;
  for (const slot of candidates) {
    const distance = Math.hypot(slot.anchor.x - point.x, slot.anchor.y - point.y);
    if (distance <= bestDistance) {
      best = slot;
      bestDistance = distance;
    }
  }
  return best;
}

const beside = (direction: Direction, of: string, gap: number | null): Placement => ({
  kind: "beside",
  direction,
  of,
  gap,
  at: NOWHERE,
});

// self の本体の中心を anchor に置く置き方の候補。数の少ないものから並べる。
// 1. ほかの図形の上下左右に既定の間で置くとぴったり合うもの(数なし)
// 2. 縦か横がほかの図形と揃っていて、間を書けば合うもの(間の狭い順)
export function placementsFor(
  shapes: PlacedShape[],
  self: PlacedShape,
  anchor: Point,
  excluded: Set<string>,
  gapOf: GapOf = fixedGap,
): Placement[] {
  const exact = slots(shapes, self, excluded, gapOf)
    .filter((slot) => Math.abs(slot.anchor.x - anchor.x) < EXACT && Math.abs(slot.anchor.y - anchor.y) < EXACT)
    .map((slot) => beside(slot.direction, slot.of, null));

  const spaced: { placement: Placement; gap: number }[] = [];
  for (const shape of shapes) {
    if (shape.id === self.id || excluded.has(shape.id)) continue;
    const candidates: Direction[] = [];
    if (Math.abs(shape.anchor.y - anchor.y) < EXACT) candidates.push(anchor.x >= shape.anchor.x ? "right" : "left");
    if (Math.abs(shape.anchor.x - anchor.x) < EXACT) candidates.push(anchor.y >= shape.anchor.y ? "below" : "above");
    for (const direction of candidates) {
      const gap = gapBetween(shape, self, direction, anchor);
      if (gap >= 0) spaced.push({ placement: beside(direction, shape.id, Math.round(gap * 100) / 100), gap });
    }
  }
  spaced.sort((a, b) => a.gap - b.gap);
  return [...exact, ...spaced.map(({ placement }) => placement)];
}

// 基準の向きの線の上だけを動かし、間(by)を求める。間は整数にし、0 より狭くしない
export function slide(dragged: PlacedShape, base: PlacedShape, direction: Direction, point: Point): Slot {
  const gap = Math.max(0, Math.round(gapBetween(base, dragged, direction, point)));
  return { direction, of: base.id, gap, anchor: besideAnchor(base, dragged, direction, gap) };
}
