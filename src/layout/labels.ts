// 線のラベルの置き場所。図形、矢先、ほかの線、先に置いたラベルに重ならない場所を、線の中点の近くから探す
import { along, clip, grow, overlapArea, pointAt, polyline, tangentAt } from "./geometry.ts";
import type { Box, Path, Point } from "./geometry.ts";
import { measureText } from "./measure.ts";

// ラベルの下地の余白、ラベルを線の脇に置くときの線からの離れ、さらに外に置くときの一段の幅
export const LABEL = { padX: 6, padY: 2, aside: 3, step: 16 };

// 中点から少しずらして試す位置(通り道の t。線分なら長さに対する割合)
const ALONG = [0.5, 0.4, 0.6, 0.3, 0.7];
// 線を横切るラベル(や注釈)の重さ。重なりの面積と比べる
export const CROSSING = 1000;
// ほかの線が近くを通るラベルの重さと、その近さ。矢先がラベルを指しているように見えないよう、少し離す
const CROWDED = 100;
const ROOM = 8;

export function labelSize(label: string) {
  const text = measureText(label);
  return { width: text.width + LABEL.padX * 2, height: text.height + LABEL.padY * 2 };
}

// path は線の通り道。side はラベルを線の脇に置くとき先に試す向き((-u.y, u.x) の側が 1、逆が -1)。
// on なら線の上(重ねる)を先に試す。そうでなければ脇だけに置く
export type LabelRequest = { path: Path; label: string | null; side: number; on: boolean };

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
      const around = grow(box, ROOM);
      const others = [...requests.filter((_, otherIndex) => otherIndex !== index).map(({ path }) => path), ...lines];
      for (const other of others) {
        if (crosses(other, near)) total += CROSSING;
        else if (crosses(other, around)) total += CROWDED;
      }
      return total;
    };
    const best = cheapest(candidates(request, labelSize(request.label)), cost);
    placed.push(best);
    return best;
  });
}

// 試す順に並べた候補のうち、重さ(cost)が 0 の最初のもの。どれも重ければ、いちばん軽いもの(同じなら先のもの)
export function cheapest<T>(candidates: T[], cost: (candidate: T) => number): T {
  let best: T = candidates[0]!;
  let bestCost = Infinity;
  for (const candidate of candidates) {
    const value = cost(candidate);
    if (value < bestCost) {
      best = candidate;
      bestCost = value;
    }
    if (bestCost === 0) break;
  }
  return best;
}

// 試す場所の順: 線の上(中点。弧なら頂点。on のときだけ)、線の脇(side の側から)、もう一段外。
// これを中点から少しずらした点でも
function candidates({ path, side, on }: LabelRequest, size: { width: number; height: number }) {
  const result: Box[] = [];
  for (const t of ALONG) {
    const at = pointAt(path, t);
    const u = tangentAt(path, t);
    const n = { x: -u.y, y: u.x };
    // 線から脇へずらす距離。ラベルの外枠の、線に直交する向きの半分の幅
    const reach = Math.abs(n.x) * (size.width / 2) + Math.abs(n.y) * (size.height / 2) + LABEL.aside;
    const far = reach + LABEL.step;
    for (const shift of [...(on ? [0] : []), side * reach, -side * reach, side * far, -side * far]) {
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
