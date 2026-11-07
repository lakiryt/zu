import type { PlacedShape, Scene } from "../layout/layout.ts";
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

// 置き終えた図形を SVG の文字列にする
export function toSvg(scene: Scene) {
  const width = round(scene.width);
  const height = round(scene.height);
  const body = scene.shapes
    .map((shape) => `<g data-id="${escape(shape.id)}">${draw(shape)}</g>`)
    .join("\n  ");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family='${FONT_FAMILY}' font-size="${FONT_SIZE}" fill="${STROKE}">`,
    `  <rect width="100%" height="100%" fill="#ffffff"/>`,
    `  ${body}`,
    `</svg>`,
    "",
  ].join("\n");
}
