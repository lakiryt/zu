// 線の端の位置とラベルの場所を決める。図形の配置には影響しない
import { ZuError } from "../errors.ts";
import type { Arrow, LineStatement } from "../syntax/ast.ts";
import { measureText } from "./measure.ts";

type Point = { x: number; y: number };
type Box = { x: number; y: number; width: number; height: number };

// start は from の側の端、end は to の側の端。線は図形の本体の手前で切ってある
export type PlacedLine = {
  from: string;
  to: string;
  start: Point;
  end: Point;
  arrow: Arrow;
  label: string | null;
  // ラベルの下地の外枠。線の中点に置く
  labelBox: Box | null;
};

// 線の端と図形の本体の間、同じ2つの図形を結ぶ線どうしの間隔、ラベルの下地の余白
const LINE = { margin: 6, spacing: 16, labelPadX: 6, labelPadY: 2 };

export type LineEnd = { id: string; anchor: Point; body: Box };

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

  return statements.map((statement) => {
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

    const p = { x: a.anchor.x + normal.x * offset, y: a.anchor.y + normal.y * offset };
    const q = { x: b.anchor.x + normal.x * offset, y: b.anchor.y + normal.y * offset };
    const span = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const d = { x: (q.x - p.x) / span, y: (q.y - p.y) / span };
    const fromA = exit(p, d, a.body);
    const fromB = exit(q, { x: -d.x, y: -d.y }, b.body);
    // 図形が重なっていて切ると線が残らないときは、中心どうしを結ぶ
    const [start, end] =
      fromA + fromB < span
        ? [
            { x: p.x + d.x * fromA, y: p.y + d.y * fromA },
            { x: q.x - d.x * fromB, y: q.y - d.y * fromB },
          ]
        : [p, q];

    let labelBox: Box | null = null;
    if (statement.label !== null) {
      const text = measureText(statement.label);
      const width = text.width + LINE.labelPadX * 2;
      const height = text.height + LINE.labelPadY * 2;
      const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      labelBox = { x: middle.x - width / 2, y: middle.y - height / 2, width, height };
    }

    return {
      from: statement.from.id,
      to: statement.to.id,
      start,
      end,
      arrow: statement.arrow,
      label: statement.label,
      labelBox,
    };
  });
}
