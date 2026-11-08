// 図形の中まで伸ばす線の端(into)の置き場所。端は図形の内側の枠の縁から少し入った所に置き、
// 同じ図形に刺さる端どうしが近すぎれば、その縁に沿って離す
import { clamp, clip, direction, distance, along } from "./geometry.ts";
import type { Box, Point } from "./geometry.ts";

// 端を内側の枠(inner)の縁からどれだけ入れるか、同じ図形に刺さる端どうしの最小の間、
// 端を寄せるとき inner の縁から空ける幅
const INTO = { depth: 10, spacing: 12, inset: 6 };

// 線が向かう点を、inner の内側(縁から inset 空けた所)に収める。inner が狭ければ中心にする
export function aimInside(point: Point, inner: Box): Point {
  const fit = (value: number, low: number, high: number) => (low > high ? (low + high) / 2 : clamp(value, low, high));
  return {
    x: fit(point.x, inner.x + INTO.inset, inner.x + inner.width - INTO.inset),
    y: fit(point.y, inner.y + INTO.inset, inner.y + inner.height - INTO.inset),
  };
}

// 端を置く枠。inner の縁から depth 入る。狭い図形では入る量を減らす
function deepOf(inner: Box): Box {
  const depth = Math.max(0, Math.min(INTO.depth, Math.min(inner.width, inner.height) / 2 - INTO.inset / 2));
  return { x: inner.x + depth, y: inner.y + depth, width: inner.width - depth * 2, height: inner.height - depth * 2 };
}

// other から aim(inner の中の点)へ向かう線の端。deep の縁で止める(斜めに入っても浅くならない)。aim を越えない
export function tipInside(inner: Box, aim: Point, other: Point): Point {
  const span = distance(other, aim);
  const d = direction(other, aim);
  const entered = clip(other, d, deepOf(inner))?.[0] ?? span;
  return along(other, d, Math.min(span, entered));
}

// 同じ図形に刺さる端を、互いに spacing 以上離す。deep の縁をたどって並べ直す。
// 角をまたぐと縁をたどる長さより実際の間が狭まる(最も狭くて 1/√2)ので、その分広く取る
export function spreadTips(inner: Box, tips: Point[]): Point[] {
  return spreadOnRing(deepOf(inner), tips, INTO.spacing * Math.SQRT2);
}

// 枠(ring)の縁の上の点を、縁をたどる長さで互いに spacing 以上離す。近すぎないものは動かさない
export function spreadOnRing(ring: Box, points: Point[], spacing: number): Point[] {
  if (points.length < 2) return points;
  const lengths = spreadAround(
    points.map((point) => lengthAround(ring, point)),
    spacing,
    2 * (ring.width + ring.height),
  );
  return lengths.map((length) => pointAround(ring, length));
}

// 動かさない点(fixed)は置いたままにし、動かす点(movable)を、ほかの点から縁をたどる長さで spacing 以上離れた、
// 元の位置にいちばん近い所へ順に置く。どこも空いていなければ、ほかの点からいちばん離れた所に置く
export function avoidOnRing(ring: Box, fixed: Point[], movable: Point[], spacing: number): Point[] {
  const total = 2 * (ring.width + ring.height);
  if (total <= 0) return movable;
  const taken = fixed.map((point) => lengthAround(ring, point));
  const apart = (s: number) =>
    Math.min(Infinity, ...taken.map((t) => {
      const d = Math.abs((((s - t) % total) + total) % total);
      return Math.min(d, total - d);
    }));
  const step = 0.5;
  return movable.map((point) => {
    const origin = lengthAround(ring, point);
    let best = origin;
    let bestApart = apart(origin);
    for (let d = 0; d <= total / 2 && bestApart < spacing; d += step) {
      for (const s of [origin + d, origin - d]) {
        const value = apart(s);
        if (value >= spacing) {
          best = s;
          bestApart = value;
          break;
        }
        if (value > bestApart) {
          best = s;
          bestApart = value;
        }
      }
    }
    taken.push(best);
    return pointAround(ring, best);
  });
}

// 枠の縁を左上から時計回りにたどった長さと、縁の上の点との行き来
function lengthAround(box: Box, point: Point) {
  const { x, y, width: w, height: h } = box;
  const px = clamp(point.x, x, x + w);
  const py = clamp(point.y, y, y + h);
  const distances = [py - y, x + w - px, y + h - py, px - x];
  const edge = distances.indexOf(Math.min(...distances));
  return [px - x, w + (py - y), w + h + (x + w - px), 2 * w + h + (y + h - py)][edge]!;
}

function pointAround(box: Box, length: number): Point {
  const { x, y, width: w, height: h } = box;
  const total = 2 * (w + h);
  const s = ((length % total) + total) % total;
  if (s <= w) return { x: x + s, y };
  if (s <= w + h) return { x: x + w, y: y + (s - w) };
  if (s <= 2 * w + h) return { x: x + w - (s - w - h), y: y + h };
  return { x, y: y + h - (s - 2 * w - h) };
}

// 輪の上の値(0 から total)を、互いに spacing 以上離す。いちばん広い隙間で輪を切り、一列にして離す
function spreadAround(values: number[], spacing: number, total: number) {
  if (total <= 0) return values;
  const sorted = [...values].sort((p, q) => p - q);
  if (values.length * spacing > total) {
    // 収まらなければ、等しく並べる(並びの順は保つ)
    const ranked = values.map((_, index) => index).sort((p, q) => values[p]! - values[q]!);
    const result: number[] = [];
    ranked.forEach((index, rank) => (result[index] = sorted[0]! + (total / values.length) * rank));
    return result;
  }
  let cut = sorted[0]!;
  let widest = sorted[0]! + total - sorted[sorted.length - 1]!;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]! - sorted[i - 1]! > widest) {
      widest = sorted[i]! - sorted[i - 1]!;
      cut = sorted[i]!;
    }
  }
  return spread(
    values.map((value) => (value < cut ? value + total : value)),
    spacing,
  );
}

// 一列に並ぶ値を、互いに spacing 以上離す。動かす量が少ないよう、近すぎる値はまとめて元の平均の周りに並べる
function spread(values: number[], spacing: number) {
  const order = values.map((value, index) => ({ value, index })).sort((p, q) => p.value - q.value);
  // まとまり。start は先頭の位置、count は数、sum は「元の値 - 先頭からの距離」の和
  type Cluster = { start: number; count: number; sum: number };
  const clusters: Cluster[] = [];
  for (const { value } of order) {
    clusters.push({ start: value, count: 1, sum: value });
    while (clusters.length > 1) {
      const last = clusters[clusters.length - 1]!;
      const before = clusters[clusters.length - 2]!;
      if (before.start + before.count * spacing <= last.start) break;
      before.sum += last.sum - last.count * before.count * spacing;
      before.count += last.count;
      before.start = before.sum / before.count;
      clusters.pop();
    }
  }
  const result: number[] = [];
  let rank = 0;
  for (const cluster of clusters) {
    for (let i = 0; i < cluster.count; i++) result[order[rank++]!.index] = cluster.start + i * spacing;
  }
  return result;
}
