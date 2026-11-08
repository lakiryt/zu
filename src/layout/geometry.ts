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

// 線の通り道。controls があれば start から end への3次ベジェ曲線(controls は start の側、end の側の順)、なければ線分。
// 3次にしたのは、両端の向きを別々に決められるようにするため(端をずらした弧を、図形のほうへ向け直す)
export type Path = { start: Point; controls: [Point, Point] | null; end: Point };

// 2次ベジェ曲線(制御点 control)と同じ形の3次ベジェ曲線
export function fromQuadratic(start: Point, control: Point, end: Point): Path {
  const toward = (from: Point) => ({ x: from.x + ((control.x - from.x) * 2) / 3, y: from.y + ((control.y - from.y) * 2) / 3 });
  return { start, controls: [toward(start), toward(end)], end };
}

const lerp = (p: Point, q: Point, t: number): Point => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });

// 通り道の t(0 が start、1 が end)の点
export function pointAt({ start, controls, end }: Path, t: number): Point {
  if (!controls) return lerp(start, end, t);
  const [c1, c2] = controls;
  const s = 1 - t;
  const [a, b, c, d] = [s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t];
  return {
    x: a * start.x + b * c1.x + c * c2.x + d * end.x,
    y: a * start.y + b * c1.y + c * c2.y + d * end.y,
  };
}

// t での進む向き(長さ 1)。制御点が端に重なって向きが出ないときは、次の点へ向かう向き
export function tangentAt({ start, controls, end }: Path, t: number): Point {
  if (!controls) return direction(start, end);
  const [c1, c2] = controls;
  const s = 1 - t;
  const d = {
    x: 3 * (s * s * (c1.x - start.x) + 2 * s * t * (c2.x - c1.x) + t * t * (end.x - c2.x)),
    y: 3 * (s * s * (c1.y - start.y) + 2 * s * t * (c2.y - c1.y) + t * t * (end.y - c2.y)),
  };
  const length = Math.hypot(d.x, d.y);
  if (length > 1e-9) return { x: d.x / length, y: d.y / length };
  return t < 0.5 ? direction(start, distance(start, c2) > 0 ? c2 : end) : direction(distance(c1, end) > 0 ? c1 : start, end);
}

// t で二つに分ける(de Casteljau)
function split(path: Path, t: number): [Path, Path] {
  const { start, controls, end } = path;
  const middle = pointAt(path, t);
  if (!controls) return [{ start, controls: null, end: middle }, { start: middle, controls: null, end }];
  const [c1, c2] = controls;
  const a = lerp(start, c1, t);
  const b = lerp(c1, c2, t);
  const c = lerp(c2, end, t);
  const ab = lerp(a, b, t);
  const bc = lerp(b, c, t);
  return [
    { start, controls: [a, ab], end: middle },
    { start: middle, controls: [bc, c], end },
  ];
}

// t0 から t1 までの部分。3次ベジェ曲線の一部は3次ベジェ曲線
export function subPath(path: Path, t0: number, t1: number): Path {
  if (t1 <= 0) return { start: path.start, controls: path.controls && [path.start, path.start], end: path.start };
  const [head] = split(path, t1);
  return split(head, t0 / t1)[1];
}

// 折れ線で近づけた通り道。線分なら両端だけ
export function polyline(path: Path, segments = 32): Point[] {
  if (!path.controls) return [path.start, path.end];
  return Array.from({ length: segments + 1 }, (_, index) => pointAt(path, index / segments));
}

// 2本の直線(p + d·s、q + e·t)の交点。平行なら null
function intersect(p: Point, d: Point, q: Point, e: Point): Point | null {
  const cross = d.x * e.y - d.y * e.x;
  if (Math.abs(cross) < 1e-9) return null;
  const s = ((q.x - p.x) * e.y - (q.y - p.y) * e.x) / cross;
  return along(p, d, s);
}

// 通り道を、進む向きの左(SVG の座標で (-u.y, u.x) の向き)へ by ずらした通り道。
// 曲線は、制御点を結ぶ3本の線分をそれぞれずらし、隣どうしの交点を新しい制御点にする(Tiller と Hanson の方法)。
// ゆるい弧ならほぼ平行な曲線になる
export function offsetPath(path: Path, by: number): Path {
  const normal = (u: Point) => ({ x: -u.y, y: u.x });
  const n0 = normal(tangentAt(path, 0));
  const n1 = normal(tangentAt(path, 1));
  const start = along(path.start, n0, by);
  const end = along(path.end, n1, by);
  if (!path.controls) return { start, controls: null, end };
  const [c1, c2] = path.controls;
  const middle = direction(c1, c2);
  const shifted = along(c1, normal(middle), by);
  const first =
    distance(c1, c2) > 1e-9 ? intersect(start, tangentAt(path, 0), shifted, middle) : null;
  const second =
    distance(c1, c2) > 1e-9 ? intersect(shifted, middle, end, tangentAt(path, 1)) : null;
  return {
    start,
    controls: [first ?? along(c1, n0, by), second ?? along(c2, n1, by)],
    end,
  };
}

// 両端をそれぞれ start、end の長さ(端からのまっすぐな距離)だけ縮めた通り道
export function trimPath(path: Path, start: number, end: number): Path {
  if (!path.controls) {
    const d = direction(path.start, path.end);
    return { start: along(path.start, d, start), controls: null, end: along(path.end, d, -end) };
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
