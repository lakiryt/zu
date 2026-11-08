// 線の端の位置とラベルの場所を決める。図形の位置には、ラベルの入る間(roomFor)を通してだけ影響する
import { ZuError } from "../errors.ts";
import type { Arrow, Head, LineStatement } from "../syntax/ast.ts";
import type { Box, Point } from "./geometry.ts";
import { measureText } from "./measure.ts";

// start は from の側の端、end は to の側の端。線は図形の本体の手前で切ってある
export type PlacedLine = {
  from: string;
  to: string;
  start: Point;
  end: Point;
  arrow: Arrow;
  label: string | null;
  // ラベルの下地の外枠
  labelBox: Box | null;
  // 端を図形の中まで伸ばした線(into)。図形に隠れないよう、図形の上に重ねる
  over: boolean;
};

// 線の端と図形の本体の間、同じ2つの図形を結ぶ線どうしの間隔、ラベルの下地の余白、
// ラベルを線の脇に置くときの線からの離れ、ラベルと矢先の間
const LINE = { margin: 6, spacing: 16, labelPadX: 6, labelPadY: 2, aside: 3, clearance: 10 };

// 矢先の大きさ。二重線は2本を覆うよう大きくする。描く段(svg)もこれを使う
export const HEAD = { length: 12, width: 10, radius: 4, doubleScale: 1.35 };

export function headLength(head: Head, arrow: Arrow) {
  const scale = arrow.style === "double" ? HEAD.doubleScale : 1;
  if (head === "none") return 0;
  return (head === "dot" ? HEAD.radius * 2 : HEAD.length) * scale;
}

export function labelSize(label: string) {
  const text = measureText(label);
  return { width: text.width + LINE.labelPadX * 2, height: text.height + LINE.labelPadY * 2 };
}

// 2つの図形 a、b を coord の向きに並べるとき、ラベルが収まるのに要る間。ラベル付きの線がなければ 0。
// 1. a と b を結ぶ線のラベルと矢先
// 2. a と b の両方と線で結ばれた図形 t があれば(三角形)、t へ向かう2辺のラベルを a と b の間に積める分。
//    三角形の辺のラベルは、a と b の間の幅に並ぶので
export function roomFor(statements: LineStatement[], a: string, b: string, coord: "x" | "y") {
  const between = (p: string, q: string) =>
    statements.filter(({ from, to }) => (from.id === p && to.id === q) || (from.id === q && to.id === p));
  const extent = (label: string) => (coord === "x" ? labelSize(label).width : labelSize(label).height);

  let room = 0;
  for (const statement of between(a, b)) {
    if (statement.label === null) continue;
    const { arrow } = statement;
    const heads = headLength(arrow.start, arrow) + headLength(arrow.end, arrow);
    room = Math.max(room, extent(statement.label) + heads + 2 * (LINE.margin + LINE.clearance));
  }

  const others = new Set(statements.flatMap(({ from, to }) => [from.id, to.id]));
  for (const t of others) {
    if (t === a || t === b) continue;
    const sides = [...between(a, t), ...between(b, t)];
    if (between(a, t).length === 0 || between(b, t).length === 0) continue;
    const stacked = sides.reduce((sum, { label }) => sum + (label === null ? 0 : extent(label) + LINE.aside * 2), 0);
    if (stacked > 0) room = Math.max(room, stacked + 2 * LINE.clearance);
  }
  return room;
}

// 線を中まで伸ばすとき(into): 端を図形の内側の枠(inner)の縁からどれだけ入れるか、同じ図形に刺さる端どうしの最小の間、
// 端を寄せるとき inner の縁から空ける幅
const INTO = { depth: 10, spacing: 12, inset: 6 };

// inner は線を中まで伸ばすとき(into)に端を置いてよい枠
export type LineEnd = { id: string; anchor: Point; body: Box; inner: Box; box: Box };

// p から d の向きへ進んで、box に入るまでの長さ。入らなければ null
function enter(p: Point, d: Point, box: Box) {
  let low = 0;
  let high = Infinity;
  for (const [step, from, min, max] of [
    [d.x, p.x, box.x, box.x + box.width],
    [d.y, p.y, box.y, box.y + box.height],
  ] as const) {
    if (step === 0) {
      if (from < min || from > max) return null;
      continue;
    }
    let t0 = (min - from) / step;
    let t1 = (max - from) / step;
    if (t0 > t1) [t0, t1] = [t1, t0];
    low = Math.max(low, t0);
    high = Math.min(high, t1);
    if (low > high) return null;
  }
  return low;
}

// 中まで伸ばす端を置く枠。内側の枠の縁から depth 入る。狭い図形では、縁から入る量を減らす
function deepOf(inner: Box) {
  const depth = Math.max(0, Math.min(INTO.depth, Math.min(inner.width, inner.height) / 2 - INTO.inset / 2));
  return { x: inner.x + depth, y: inner.y + depth, width: inner.width - depth * 2, height: inner.height - depth * 2 };
}

// 枠の縁を左上から時計回りにたどった長さと、縁の上の点との行き来
function aroundOf(box: Box, point: Point) {
  const { x, y, width: w, height: h } = box;
  const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);
  const px = clamp(point.x, x, x + w);
  const py = clamp(point.y, y, y + h);
  const distances = [py - y, x + w - px, y + h - py, px - x];
  const edge = distances.indexOf(Math.min(...distances));
  return [px - x, w + (py - y), w + h + (x + w - px), 2 * w + h + (y + h - py)][edge]!;
}

function pointAround(box: Box, length: number) {
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
  if (values.length * spacing > total) {
    // 収まらなければ、等しく並べる(並びの順は保つ)
    const order = values.map((value, index) => ({ value, index })).sort((p, q) => p.value - q.value);
    const result: number[] = [];
    order.forEach(({ index }, rank) => (result[index] = order[0]!.value + (total / values.length) * rank));
    return result;
  }
  const sorted = [...values].sort((p, q) => p - q);
  let cut = sorted[0]!;
  let widest = sorted[0]! + total - sorted[sorted.length - 1]!;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]! - sorted[i - 1]! > widest) {
      widest = sorted[i]! - sorted[i - 1]!;
      cut = sorted[i]!;
    }
  }
  const unrolled = values.map((value) => (value < cut ? value + total : value));
  return spread(unrolled, spacing, -Infinity, Infinity);
}

// 一列に並ぶ値を、互いに spacing 以上離し、low から high に収める。動かす量が少ないよう、
// 近すぎる値はまとめて元の平均の周りに並べる。収まりきらなければ low から high に等しく並べる
function spread(values: number[], spacing: number, low: number, high: number) {
  const order = values.map((value, index) => ({ value, index })).sort((p, q) => p.value - q.value);
  if (order.length > 1 && (order.length - 1) * spacing > high - low) {
    const step = (high - low) / (order.length - 1);
    const result: number[] = [];
    order.forEach(({ index }, rank) => (result[index] = low + step * rank));
    return result;
  }
  // まとまり。start は先頭の位置、count は数、sum は「元の値 - 先頭からの距離」の和
  type Cluster = { start: number; count: number; sum: number };
  const fit = (cluster: Cluster) =>
    (cluster.start = Math.min(Math.max(cluster.sum / cluster.count, low), high - (cluster.count - 1) * spacing));
  const clusters: Cluster[] = [];
  for (const { value } of order) {
    const cluster = { start: value, count: 1, sum: value };
    fit(cluster);
    clusters.push(cluster);
    while (clusters.length > 1) {
      const last = clusters[clusters.length - 1]!;
      const before = clusters[clusters.length - 2]!;
      if (before.start + before.count * spacing <= last.start) break;
      before.sum += last.sum - last.count * before.count * spacing;
      before.count += last.count;
      fit(before);
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

// 点を box の内側(縁から inset 空けた所)に収める。box が狭ければ中心にする
function clampInto(point: Point, box: Box, inset: number) {
  const clamp = (value: number, low: number, high: number) =>
    low > high ? (low + high) / 2 : Math.min(Math.max(value, low), high);
  return {
    x: clamp(point.x, box.x + inset, box.x + box.width - inset),
    y: clamp(point.y, box.y + inset, box.y + box.height - inset),
  };
}

// p から d の向きへ進んで、box(余白を足したもの)の外へ出るまでの長さ
function exit(p: Point, d: Point, box: Box) {
  const left = box.x - LINE.margin;
  const right = box.x + box.width + LINE.margin;
  const top = box.y - LINE.margin;
  const bottom = box.y + box.height + LINE.margin;
  const along = (from: number, step: number, low: number, high: number) =>
    step > 0 ? (high - from) / step : step < 0 ? (low - from) / step : Infinity;
  return Math.max(0, Math.min(along(p.x, d.x, left, right), along(p.y, d.y, top, bottom)));
}

const overlapArea = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

// 線分 p-q が box を通るか。room だけ box を広げて確かめる(線のすぐ脇のラベルも重なりとみなす)
function crosses(p: Point, q: Point, box: Box, room: number) {
  const x0 = box.x - room;
  const x1 = box.x + box.width + room;
  const y0 = box.y - room;
  const y1 = box.y + box.height + room;
  let low = 0;
  let high = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  for (const [step, from, min, max] of [
    [dx, p.x, x0, x1],
    [dy, p.y, y0, y1],
  ] as const) {
    if (step === 0) {
      if (from < min || from > max) return false;
      continue;
    }
    let t0 = (min - from) / step;
    let t1 = (max - from) / step;
    if (t0 > t1) [t0, t1] = [t1, t0];
    low = Math.max(low, t0);
    high = Math.min(high, t1);
    if (low > high) return false;
  }
  return true;
}

type Segment = { start: Point; end: Point; arrow: Arrow; statement: LineStatement; side: number };

export function placeLines(statements: LineStatement[], ends: Map<string, LineEnd>): PlacedLine[] {
  for (const statement of statements) {
    for (const end of [statement.from, statement.to]) {
      if (!ends.has(end.id)) throw new ZuError(`「${end.id}」という図形はありません`, end.at);
    }
    if (statement.from.id === statement.to.id) {
      throw new ZuError("同じ図形どうしは線で結べません", statement.to.at);
    }
  }

  // 同じ2つの図形を結ぶ線は、平行にずらして重ならないようにする
  const pairKey = ({ from, to }: LineStatement) => [from.id, to.id].sort().join("\u0000");
  const pairs = new Map<string, number>();
  for (const statement of statements) pairs.set(pairKey(statement), (pairs.get(pairKey(statement)) ?? 0) + 1);
  const seen = new Map<string, number>();

  // 1. 線を引く。まず図形の本体の中心(同じ組の線はずらした点)どうしを結ぶ
  const drafts = statements.map((statement) => {
    const a = ends.get(statement.from.id)!;
    const b = ends.get(statement.to.id)!;
    const key = pairKey(statement);
    const count = pairs.get(key)!;
    const order = seen.get(key) ?? 0;
    seen.set(key, order + 1);

    // ずらす向きは、結ぶ向きによらず名前の順で決める
    const [first, second] = a.id < b.id ? [a, b] : [b, a];
    const length = Math.hypot(second.anchor.x - first.anchor.x, second.anchor.y - first.anchor.y) || 1;
    const normal = { x: -(second.anchor.y - first.anchor.y) / length, y: (second.anchor.x - first.anchor.x) / length };
    const offset = (order - (count - 1) / 2) * LINE.spacing;
    // 線が向かう点。中まで伸ばす端は、図形の内側の枠に収める
    const aim = (end: LineEnd, into: boolean) => {
      const point = { x: end.anchor.x + normal.x * offset, y: end.anchor.y + normal.y * offset };
      return into ? clampInto(point, end.inner, INTO.inset) : point;
    };
    const p = aim(a, statement.from.into);
    const q = aim(b, statement.to.into);
    // 中まで伸ばす端は、内側の枠の縁から depth 入った枠(deep)の縁に置く。斜めに入っても浅くならない
    const tip = (end: LineEnd, own: Point, other: Point) => {
      const span = Math.hypot(own.x - other.x, own.y - other.y) || 1;
      const d = { x: (own.x - other.x) / span, y: (own.y - other.y) / span };
      const reach = Math.min(span, enter(other, d, deepOf(end.inner)) ?? span);
      return { x: other.x + d.x * reach, y: other.y + d.y * reach };
    };
    return {
      statement,
      a,
      b,
      normal,
      offset,
      p,
      q,
      fromTip: statement.from.into ? tip(a, p, q) : null,
      toTip: statement.to.into ? tip(b, q, p) : null,
    };
  });

  // 2. 同じ図形に刺さる端(into)が近すぎれば、deep の縁に沿って離す
  const stuck = new Map<string, { draft: (typeof drafts)[number]; side: "fromTip" | "toTip" }[]>();
  for (const draft of drafts) {
    for (const [side, end] of [
      ["fromTip", draft.a],
      ["toTip", draft.b],
    ] as const) {
      if (draft[side]) stuck.set(end.id, [...(stuck.get(end.id) ?? []), { draft, side }]);
    }
  }
  for (const [id, group] of stuck) {
    if (group.length < 2) continue;
    const ring = deepOf(ends.get(id)!.inner);
    const wanted = spreadAround(
      group.map(({ draft, side }) => aroundOf(ring, draft[side]!)),
      // 角をまたぐと縁をたどる長さより実際の間が狭まる(最も狭くて 1/√2)ので、その分広く取る
      INTO.spacing * Math.SQRT2,
      2 * (ring.width + ring.height),
    );
    group.forEach(({ draft, side }, index) => (draft[side] = pointAround(ring, wanted[index]!)));
  }

  // 3. 線の両端を決める。中まで伸ばす端はその点、ほかの端は本体の手前で切る
  const segments: Segment[] = drafts.map(({ statement, a, b, normal, offset, p, q, fromTip, toTip }) => {
    const from = fromTip ?? p;
    const to = toTip ?? q;
    const span = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const d = { x: (to.x - from.x) / span, y: (to.y - from.y) / span };
    const fromA = fromTip ? 0 : exit(from, d, a.body);
    const fromB = toTip ? 0 : exit(to, { x: -d.x, y: -d.y }, b.body);
    // 図形が重なっていて切ると線が残らないときは、向かう点どうしを結ぶ
    const [start, end] =
      fromA + fromB < span
        ? [
            { x: from.x + d.x * fromA, y: from.y + d.y * fromA },
            { x: to.x - d.x * fromB, y: to.y - d.y * fromB },
          ]
        : [from, to];

    // ラベルを脇に置くなら、組の外側(ずらした向き)を先に試す。この線から見た向きに直す
    const towards = Math.sign(offset) || 1;
    const own = { x: -d.y, y: d.x };
    const side = towards * Math.sign(own.x * normal.x + own.y * normal.y || 1);
    return { start, end, arrow: statement.arrow, statement, side };
  });

  // 2. ラベルを置く。図形、矢先、ほかの線、先に置いたラベルに重ならない場所を、線の中点の近くから探す
  const shapeBoxes = [...ends.values()].map(({ box }) => box);
  const headBoxes = segments.flatMap(({ start, end, arrow }) =>
    (
      [
        [start, arrow.start],
        [end, arrow.end],
      ] as const
    )
      .filter(([, head]) => head !== "none")
      .map(([point, head]) => {
        const r = headLength(head, arrow);
        return { x: point.x - r, y: point.y - r, width: r * 2, height: r * 2 };
      }),
  );
  const placedLabels: Box[] = [];

  return segments.map((segment, index) => {
    const { start, end, statement } = segment;
    let labelBox: Box | null = null;
    if (statement.label !== null) {
      const size = labelSize(statement.label);
      const span = Math.hypot(end.x - start.x, end.y - start.y) || 1;
      const u = { x: (end.x - start.x) / span, y: (end.y - start.y) / span };
      const n = { x: -u.y, y: u.x };
      // 線から脇へずらす距離。ラベルの外枠の、線に直交する向きの半分の幅
      const reach = Math.abs(n.x) * (size.width / 2) + Math.abs(n.y) * (size.height / 2) + LINE.aside;

      const candidates: Box[] = [];
      for (const t of [0.5, 0.4, 0.6, 0.3, 0.7]) {
        const at = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
        const far = reach + LINE.spacing;
        for (const shift of [0, segment.side * reach, -segment.side * reach, segment.side * far, -segment.side * far]) {
          const x = at.x + n.x * shift;
          const y = at.y + n.y * shift;
          candidates.push({ x: x - size.width / 2, y: y - size.height / 2, ...size });
        }
      }

      const cost = (box: Box) => {
        let total = 0;
        for (const other of [...placedLabels, ...shapeBoxes, ...headBoxes]) total += overlapArea(box, other);
        segments.forEach((other, otherIndex) => {
          if (otherIndex !== index && crosses(other.start, other.end, box, LINE.aside + 1)) total += 1000;
        });
        return total;
      };
      let best = candidates[0]!;
      let bestCost = cost(best);
      for (const candidate of candidates.slice(1)) {
        if (bestCost === 0) break;
        const value = cost(candidate);
        if (value < bestCost) {
          best = candidate;
          bestCost = value;
        }
      }
      labelBox = best;
      placedLabels.push(best);
    }

    return {
      from: statement.from.id,
      to: statement.to.id,
      start,
      end,
      arrow: statement.arrow,
      label: statement.label,
      labelBox,
      over: statement.from.into || statement.to.into,
    };
  });
}
