// ドラッグしたときの吸着先を、配置済みの図(Scene)から求める。DOM を知らない
import { DEFAULT_GAP } from "../src/layout/layout.ts";
import type { PlacedShape, Point } from "../src/layout/layout.ts";
import type { Direction, Placement } from "../src/syntax/ast.ts";

// 本体の中心から外枠の四辺まで
function reach({ box, anchor }: PlacedShape) {
  return {
    left: anchor.x - box.x,
    right: box.x + box.width - anchor.x,
    top: anchor.y - box.y,
    bottom: box.y + box.height - anchor.y,
  };
}

// 間を書かずに置くときの間。of の図形の direction に置く場合。配置の段の defaultGap と同じにする
export type GapOf = (of: string, direction: Direction) => number;
const fixedGap: GapOf = () => DEFAULT_GAP;

// 吸着先。dragged をそこへ置いたときの本体の中心(anchor)を持つ
export type Slot = { direction: Direction; of: string; anchor: Point; gap: number | null };

// 既定の間で、ほかの図形の上下左右に置いたときの位置
export function slots(shapes: PlacedShape[], dragged: PlacedShape, excluded: Set<string>, gapOf: GapOf = fixedGap): Slot[] {
  const self = reach(dragged);
  const result: Slot[] = [];
  for (const shape of shapes) {
    if (shape.id === dragged.id || excluded.has(shape.id)) continue;
    const other = reach(shape);
    const { x, y } = shape.anchor;
    const of = shape.id;
    result.push(
      { direction: "right", of, gap: null, anchor: { x: x + other.right + gapOf(of, "right") + self.left, y } },
      { direction: "left", of, gap: null, anchor: { x: x - other.left - gapOf(of, "left") - self.right, y } },
      { direction: "below", of, gap: null, anchor: { x, y: y + other.bottom + gapOf(of, "below") + self.top } },
      { direction: "above", of, gap: null, anchor: { x, y: y - other.top - gapOf(of, "above") - self.bottom } },
    );
  }
  return result;
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

const NOWHERE = { line: 0, column: 0 };
const EXACT = 0.05;

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
  const mine = reach(self);
  const exact: Placement[] = [];
  const spaced: { placement: Placement; gap: number }[] = [];
  for (const shape of shapes) {
    if (shape.id === self.id || excluded.has(shape.id)) continue;
    for (const slot of slots([shape], self, new Set(), gapOf)) {
      if (Math.abs(slot.anchor.x - anchor.x) < EXACT && Math.abs(slot.anchor.y - anchor.y) < EXACT) {
        exact.push({ kind: "beside", direction: slot.direction, of: shape.id, gap: null, at: NOWHERE });
      }
    }
    const other = reach(shape);
    const add = (direction: Direction, gap: number) => {
      if (gap >= 0) spaced.push({ placement: { kind: "beside", direction, of: shape.id, gap: Math.round(gap * 100) / 100, at: NOWHERE }, gap });
    };
    if (Math.abs(shape.anchor.y - anchor.y) < EXACT) {
      if (anchor.x >= shape.anchor.x) add("right", anchor.x - mine.left - (shape.anchor.x + other.right));
      else add("left", shape.anchor.x - other.left - (anchor.x + mine.right));
    }
    if (Math.abs(shape.anchor.x - anchor.x) < EXACT) {
      if (anchor.y >= shape.anchor.y) add("below", anchor.y - mine.top - (shape.anchor.y + other.bottom));
      else add("above", shape.anchor.y - other.top - (anchor.y + mine.bottom));
    }
  }
  spaced.sort((a, b) => a.gap - b.gap);
  return [...exact, ...spaced.map(({ placement }) => placement)];
}

// 基準の向きの線の上だけを動かし、間(by)を求める。間は 0 より狭くしない
export function slide(dragged: PlacedShape, base: PlacedShape, direction: Direction, point: Point): Slot {
  const self = reach(dragged);
  const other = reach(base);
  const { x, y } = base.anchor;
  const round = (value: number) => Math.max(0, Math.round(value));
  switch (direction) {
    case "right": {
      const gap = round(point.x - self.left - (x + other.right));
      return { direction, of: base.id, gap, anchor: { x: x + other.right + gap + self.left, y } };
    }
    case "left": {
      const gap = round(x - other.left - (point.x + self.right));
      return { direction, of: base.id, gap, anchor: { x: x - other.left - gap - self.right, y } };
    }
    case "below": {
      const gap = round(point.y - self.top - (y + other.bottom));
      return { direction, of: base.id, gap, anchor: { x, y: y + other.bottom + gap + self.top } };
    }
    case "above": {
      const gap = round(y - other.top - (point.y + self.bottom));
      return { direction, of: base.id, gap, anchor: { x, y: y - other.top - gap - self.bottom } };
    }
  }
}
