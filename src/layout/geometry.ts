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

// 線の通り道。control があれば start から end への2次ベジェ曲線、なければ線分
export type Path = { start: Point; control: Point | null; end: Point };

const mix = (weights: [number, number, number], { start, control, end }: Path): Point => ({
  x: weights[0] * start.x + weights[1] * control!.x + weights[2] * end.x,
  y: weights[0] * start.y + weights[1] * control!.y + weights[2] * end.y,
});

// 通り道の t(0 が start、1 が end)の点
export function pointAt(path: Path, t: number): Point {
  const { start, control, end } = path;
  if (!control) return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
  return mix([(1 - t) * (1 - t), 2 * (1 - t) * t, t * t], path);
}

// t での進む向き(長さ 1)
export function tangentAt({ start, control, end }: Path, t: number): Point {
  if (!control) return direction(start, end);
  const d = {
    x: 2 * (1 - t) * (control.x - start.x) + 2 * t * (end.x - control.x),
    y: 2 * (1 - t) * (control.y - start.y) + 2 * t * (end.y - control.y),
  };
  const length = Math.hypot(d.x, d.y);
  return length === 0 ? direction(start, end) : { x: d.x / length, y: d.y / length };
}

// t0 から t1 までの部分。2次ベジェ曲線の一部は2次ベジェ曲線で、制御点は両端の t から決まる
export function subPath(path: Path, t0: number, t1: number): Path {
  const start = pointAt(path, t0);
  const end = pointAt(path, t1);
  if (!path.control) return { start, control: null, end };
  return { start, control: mix([(1 - t0) * (1 - t1), (1 - t0) * t1 + t0 * (1 - t1), t0 * t1], path), end };
}

// 折れ線で近づけた通り道。線分なら両端だけ
export function polyline(path: Path, segments = 32): Point[] {
  if (!path.control) return [path.start, path.end];
  return Array.from({ length: segments + 1 }, (_, index) => pointAt(path, index / segments));
}

// 通り道を、進む向きの左(SVG の座標で (-u.y, u.x) の向き)へ by ずらした通り道。
// 曲線は、両端の接線をずらした2本が交わる点を制御点にする(ゆるい弧ならほぼ平行な曲線になる)
export function offsetPath(path: Path, by: number): Path {
  const normal = (u: Point) => ({ x: -u.y, y: u.x });
  const n0 = normal(tangentAt(path, 0));
  const n1 = normal(tangentAt(path, 1));
  const start = along(path.start, n0, by);
  const end = along(path.end, n1, by);
  if (!path.control) return { start, control: null, end };
  const scale = by / (1 + n0.x * n1.x + n0.y * n1.y);
  return { start, control: { x: path.control.x + (n0.x + n1.x) * scale, y: path.control.y + (n0.y + n1.y) * scale }, end };
}

// 両端をそれぞれ start、end の長さ(端からのまっすぐな距離)だけ縮めた通り道
export function trimPath(path: Path, start: number, end: number): Path {
  if (!path.control) {
    const d = direction(path.start, path.end);
    return { start: along(path.start, d, start), control: null, end: along(path.end, d, -end) };
  }
  // 端からの距離は、端の近くでは t とともに増えるので、二分法で t を探す
  const reach = (from: Point, length: number, toward: (t: number) => Point) => {
    if (length <= 0) return 0;
    let low = 0;
    let high = 0.5;
    for (let step = 0; step < 40; step++) {
      const middle = (low + high) / 2;
      if (distance(from, toward(middle)) < length) low = middle;
      else high = middle;
    }
    return high;
  };
  const t0 = reach(path.start, start, (t) => pointAt(path, t));
  const t1 = 1 - reach(path.end, end, (t) => pointAt(path, 1 - t));
  return subPath(path, t0, t1);
}

export const contains = (box: Box, { x, y }: Point) =>
  x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
