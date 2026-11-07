import type { PlacedLine, PlacedShape, Scene } from "../layout/layout.ts";
import type { Head } from "../syntax/ast.ts";
import { FONT_SIZE, LINE_HEIGHT, labelLines } from "../layout/measure.ts";

const STROKE = "#333333";
const FACES = { front: "#ffffff", top: "#ececec", side: "#d6d6d6" };
const FONT_FAMILY = `"Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif`;

const round = (value: number) => Math.round(value * 100) / 100;

function escape(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const points = (list: [number, number][]) => list.map(([x, y]) => `${round(x)},${round(y)}`).join(" ");

const polygon = (list: [number, number][], fill: string) =>
  `<polygon points="${points(list)}" fill="${fill}" stroke="${STROKE}" stroke-linejoin="round"/>`;

// 複数行のラベルは、行の並び全体の中心が (x, y) に来るよう書く
function label(text: string, x: number, y: number) {
  const lines = labelLines(text);
  const step = FONT_SIZE * LINE_HEIGHT;
  const first = -((lines.length - 1) * step) / 2;
  const spans = lines
    .map((line, index) => `<tspan x="${round(x)}" dy="${round(index === 0 ? first : step)}">${escape(line)}</tspan>`)
    .join("");
  return `<text x="${round(x)}" y="${round(y)}" text-anchor="middle" dominant-baseline="central">${spans}</text>`;
}

function draw({ label: text, box, geometry }: PlacedShape) {
  const { x, y, width, height } = box;
  const centerX = x + width / 2;

  switch (geometry.shape) {
    case "text":
      return label(text, centerX, y + height / 2);

    case "parallelogram": {
      const { skew } = geometry;
      return [
        polygon(
          [
            [x + skew, y],
            [x + width, y],
            [x + width - skew, y + height],
            [x, y + height],
          ],
          FACES.front,
        ),
        label(text, centerX, y + height / 2),
      ].join("");
    }

    case "cube": {
      const { edge, depth, labelTop } = geometry;
      // ラベルが立方体より広いときは、立方体を外枠の中央に寄せる
      const left = centerX - (edge + depth) / 2;
      const front = y + depth;
      return [
        polygon(
          [
            [left, front],
            [left + depth, y],
            [left + depth + edge, y],
            [left + edge, front],
          ],
          FACES.top,
        ),
        polygon(
          [
            [left + edge, front],
            [left + edge + depth, y],
            [left + edge + depth, y + edge],
            [left + edge, front + edge],
          ],
          FACES.side,
        ),
        polygon(
          [
            [left, front],
            [left + edge, front],
            [left + edge, front + edge],
            [left, front + edge],
          ],
          FACES.front,
        ),
        label(text, centerX, (y + labelTop + y + height) / 2),
      ].join("");
    }
  }
}

// 線の太さ、点線の間隔、矢先の大きさ。太線は矢先も大きくする
const STROKE_WIDTH = { solid: 1.5, dotted: 1.5, thick: 3 };
const DASH = "2 4";
const HEAD = { length: 12, width: 10, radius: 4, thickScale: 1.35 };

type Vector = { x: number; y: number };

// tip に向かう向き u の矢先。線をどれだけ手前で止めるか(back)も返す
function head(kind: Head, tip: Vector, u: Vector, scale: number) {
  if (kind === "none") return { svg: "", back: 0 };
  if (kind === "dot") {
    const r = HEAD.radius * scale;
    const c = { x: tip.x - u.x * r, y: tip.y - u.y * r };
    return { svg: `<circle cx="${round(c.x)}" cy="${round(c.y)}" r="${round(r)}" fill="${STROKE}"/>`, back: r };
  }
  const length = HEAD.length * scale;
  const half = (HEAD.width * scale) / 2;
  const base = { x: tip.x - u.x * length, y: tip.y - u.y * length };
  const n = { x: -u.y, y: u.x };
  const corners: [number, number][] = [
    [tip.x, tip.y],
    [base.x + n.x * half, base.y + n.y * half],
    [base.x - n.x * half, base.y - n.y * half],
  ];
  const fill = kind === "filled" ? STROKE : FACES.front;
  return {
    svg: `<polygon points="${points(corners)}" fill="${fill}" stroke="${STROKE}" stroke-width="1.5" stroke-linejoin="round"/>`,
    back: length,
  };
}

function drawLine({ start, end, arrow, label: text, labelBox }: PlacedLine) {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const parts: string[] = [];
  if (length > 0) {
    const u = { x: (end.x - start.x) / length, y: (end.y - start.y) / length };
    const scale = arrow.style === "thick" ? HEAD.thickScale : 1;
    const atEnd = head(arrow.end, end, u, scale);
    const atStart = head(arrow.start, start, { x: -u.x, y: -u.y }, scale);
    // 矢先の中に線が見えないよう、線は矢先の根元で止める
    const from = { x: start.x + u.x * atStart.back, y: start.y + u.y * atStart.back };
    const to = { x: end.x - u.x * atEnd.back, y: end.y - u.y * atEnd.back };
    const dash = arrow.style === "dotted" ? ` stroke-dasharray="${DASH}"` : "";
    parts.push(
      `<line x1="${round(from.x)}" y1="${round(from.y)}" x2="${round(to.x)}" y2="${round(to.y)}" stroke="${STROKE}" stroke-width="${STROKE_WIDTH[arrow.style]}"${dash} stroke-linecap="round"/>`,
      atStart.svg,
      atEnd.svg,
    );
  }
  if (text !== null && labelBox) {
    const { x, y, width, height } = labelBox;
    parts.push(
      `<rect x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}" rx="3" fill="${FACES.front}"/>`,
      label(text, x + width / 2, y + height / 2),
    );
  }
  return parts.join("");
}

// 置き終えた図形を SVG の文字列にする。線は図形の下に描く
export function toSvg(scene: Scene) {
  const width = round(scene.width);
  const height = round(scene.height);
  const body = [
    ...scene.lines.map((line, index) => `<g data-line="${index}">${drawLine(line)}</g>`),
    ...scene.shapes.map((shape) => `<g data-id="${escape(shape.id)}">${draw(shape)}</g>`),
  ].join("\n  ");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family='${FONT_FAMILY}' font-size="${FONT_SIZE}" fill="${STROKE}">`,
    `  <rect width="100%" height="100%" fill="#ffffff"/>`,
    `  ${body}`,
    `</svg>`,
    "",
  ].join("\n");
}
