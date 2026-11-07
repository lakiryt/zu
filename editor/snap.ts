// ドラッグしたときの吸着先を、配置済みの図(Scene)から求める。DOM を知らない
import { DEFAULT_GAP } from "../src/layout/layout.ts";
import type { PlacedShape, Point } from "../src/layout/layout.ts";
import type { Direction } from "../src/syntax/ast.ts";

// 本体の中心から外枠の四辺まで
function reach({ box, anchor }: PlacedShape) {
  return {
    left: anchor.x - box.x,
    right: box.x + box.width - anchor.x,
    top: anchor.y - box.y,
    bottom: box.y + box.height - anchor.y,
  };
}

// 吸着先。dragged をそこへ置いたときの本体の中心(anchor)を持つ
export type Slot = { direction: Direction; of: string; anchor: Point; gap: number | null };

// 既定の間で、ほかの図形の上下左右に置いたときの位置
export function slots(shapes: PlacedShape[], dragged: PlacedShape, excluded: Set<string>): Slot[] {
  const self = reach(dragged);
  const result: Slot[] = [];
  for (const shape of shapes) {
    if (shape.id === dragged.id || excluded.has(shape.id)) continue;
    const other = reach(shape);
    const { x, y } = shape.anchor;
    const of = shape.id;
    result.push(
      { direction: "right", of, gap: null, anchor: { x: x + other.right + DEFAULT_GAP + self.left, y } },
      { direction: "left", of, gap: null, anchor: { x: x - other.left - DEFAULT_GAP - self.right, y } },
      { direction: "below", of, gap: null, anchor: { x, y: y + other.bottom + DEFAULT_GAP + self.top } },
      { direction: "above", of, gap: null, anchor: { x, y: y - other.top - DEFAULT_GAP - self.bottom } },
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
