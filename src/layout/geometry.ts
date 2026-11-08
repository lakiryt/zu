// 配置の段で使う点と枠と、その計算。座標は左上が原点で、右と下が正
export type Point = { x: number; y: number };

// 左上の座標と大きさ
export type Box = { x: number; y: number; width: number; height: number };

export const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

export const distance = (p: Point, q: Point) => Math.hypot(q.x - p.x, q.y - p.y);

// p から q へ向かう長さ 1 の向き。p と q が同じ点なら (0, 0)
export function direction(p: Point, q: Point): Point {
  const length = distance(p, q);
  return length === 0 ? { x: 0, y: 0 } : { x: (q.x - p.x) / length, y: (q.y - p.y) / length };
}

// p から d の向きへ t 進んだ点
export const along = (p: Point, d: Point, t: number): Point => ({ x: p.x + d.x * t, y: p.y + d.y * t });

// 四辺を by だけ外へ広げた枠(負なら内へ縮める)
export const grow = (box: Box, by: number): Box => ({
  x: box.x - by,
  y: box.y - by,
  width: box.width + by * 2,
  height: box.height + by * 2,
});

// 枠をすべて含む最小の枠。枠がなければ null
export function union(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export const overlapArea = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

// p + d·t(t は low から high)のうち box の中にある範囲 [入る t, 出る t]。通らなければ null
export function clip(p: Point, d: Point, box: Box, low = 0, high = Infinity): [number, number] | null {
  for (const [step, from, min, max] of [
    [d.x, p.x, box.x, box.x + box.width],
    [d.y, p.y, box.y, box.y + box.height],
  ] as const) {
    if (step === 0) {
      if (from < min || from > max) return null;
      continue;
    }
    const t0 = (min - from) / step;
    const t1 = (max - from) / step;
    low = Math.max(low, Math.min(t0, t1));
    high = Math.min(high, Math.max(t0, t1));
    if (low > high) return null;
  }
  return [low, high];
}
