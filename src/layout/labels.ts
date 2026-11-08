// 線のラベルの置き場所。図形、矢先、ほかの線、先に置いたラベルに重ならない場所を、線の中点の近くから探す
import { along, clip, grow, overlapArea, pointAt, polyline, tangentAt } from "./geometry.ts";
import type { Box, Path, Point } from "./geometry.ts";
import { measureText } from "./measure.ts";

// ラベルの下地の余白、ラベルを線の脇に置くときの線からの離れ、さらに外に置くときの一段の幅
export const LABEL = { padX: 6, padY: 2, aside: 3, step: 16 };

// 中点から少しずらして試す位置(通り道の t。線分なら長さに対する割合)
const ALONG = [0.5, 0.4, 0.6, 0.3, 0.7];
// 線を横切るラベルの重さ。重なりの面積と比べる
const CROSSING = 1000;

export function labelSize(label: string) {
  const text = measureText(label);
  return { width: text.width + LABEL.padX * 2, height: text.height + LABEL.padY * 2 };
}

// path は線の通り道。side はラベルを線の脇に置くとき先に試す向き((-u.y, u.x) の側が 1、逆が -1)
export type LabelRequest = { path: Path; label: string | null; side: number };

// 書いた順に決める。どこも重なるなら、重なりのいちばん少ない場所にする。
// lines は先に置いた線の通り道(requests の線とは別に、横切らないよう避ける)
export function placeLabels(requests: LabelRequest[], obstacles: Box[], lines: Path[] = []): (Box | null)[] {
  const placed: Box[] = [];
  return requests.map((request, index) => {
    if (request.label === null) return null;
    const cost = (box: Box) => {
      let total = 0;
      for (const other of [...placed, ...obstacles]) total += overlapArea(box, other);
      const near = grow(box, LABEL.aside + 1);
      requests.forEach((other, otherIndex) => {
        if (otherIndex !== index && crosses(other.path, near)) total += CROSSING;
      });
      for (const other of lines) if (crosses(other, near)) total += CROSSING;
      return total;
    };
    let best: Box | null = null;
    let bestCost = Infinity;
    for (const candidate of candidates(request, labelSize(request.label))) {
      const value = cost(candidate);
      if (value < bestCost) {
        best = candidate;
        bestCost = value;
      }
      if (bestCost === 0) break;
    }
    placed.push(best!);
    return best;
  });
}

// 試す場所の順: 線の上(中点。弧なら頂点)、線の脇(side の側から)、もう一段外。これを中点から少しずらした点でも
function candidates({ path, side }: LabelRequest, size: { width: number; height: number }) {
  const result: Box[] = [];
  for (const t of ALONG) {
    const at = pointAt(path, t);
    const u = tangentAt(path, t);
    const n = { x: -u.y, y: u.x };
    // 線から脇へずらす距離。ラベルの外枠の、線に直交する向きの半分の幅
    const reach = Math.abs(n.x) * (size.width / 2) + Math.abs(n.y) * (size.height / 2) + LABEL.aside;
    const far = reach + LABEL.step;
    for (const shift of [0, side * reach, -side * reach, side * far, -side * far]) {
      const center = along(at, n, shift);
      result.push({ x: center.x - size.width / 2, y: center.y - size.height / 2, ...size });
    }
  }
  return result;
}

// 通り道が box を通るか
export function crosses(path: Path, box: Box) {
  const points = polyline(path);
  return points.slice(1).some((q, index) => segmentCrosses(points[index]!, q, box));
}

const segmentCrosses = (p: Point, q: Point, box: Box) => clip(p, { x: q.x - p.x, y: q.y - p.y }, box, 0, 1) !== null;
