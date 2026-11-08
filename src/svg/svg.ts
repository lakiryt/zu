import type { PlacedCaption, PlacedLine, PlacedShape, Scene } from "../layout/layout.ts";
import { HEAD } from "../layout/lines.ts";
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

// 図の下の文。行を外枠の左、中央、右に揃えて書く
function drawCaption({ text, align, fontSize, box }: PlacedCaption) {
  const anchor = { left: "start", center: "middle", right: "end" }[align];
  const x = align === "left" ? box.x : align === "right" ? box.x + box.width : box.x + box.width / 2;
  const step = fontSize * LINE_HEIGHT;
  const spans = labelLines(text)
    .map((line, index) => `<tspan x="${round(x)}" y="${round(box.y + step * index + step / 2)}">${escape(line)}</tspan>`)
    .join("");
  const size = fontSize === FONT_SIZE ? "" : ` font-size="${fontSize}"`;
  return `<text text-anchor="${anchor}" dominant-baseline="central"${size}>${spans}</text>`;
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

// 線の太さ、点線の間隔、二重線の2本の中心どうしの間。矢先の大きさは配置の段(HEAD)が決める
const STROKE_WIDTH = { solid: 1.5, dotted: 1.5, double: 1.2 };
const DASH = "2 4";
const DOUBLE_GAP = 3.5;

type Vector = { x: number; y: number };

// tip に向かう向き u の矢先。線をどれだけ手前で止めるか(back)も返す。
// spread は線の中心から外側の線までの距離(二重線なら半分の間、それ以外は 0)
function head(kind: Head, tip: Vector, u: Vector, scale: number, spread: number) {
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
  if (kind === "open") {
    // V 字。中が空いているので線は先端まで伸ばす。二重線は、2本が V の腕に当たる所で止める
    const arms: [number, number][] = [corners[1]!, corners[0]!, corners[2]!];
    return {
      svg: `<polyline points="${points(arms)}" fill="none" stroke="${STROKE}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
      back: (spread * length) / half,
    };
  }
  const fill = STROKE;
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
    const scale = arrow.style === "double" ? HEAD.doubleScale : 1;
    const spread = arrow.style === "double" ? DOUBLE_GAP / 2 : 0;
    const atEnd = head(arrow.end, end, u, scale, spread);
    const atStart = head(arrow.start, start, { x: -u.x, y: -u.y }, scale, spread);
    // 矢先の中に線が見えないよう、線は矢先の根元で止める
    const from = { x: start.x + u.x * atStart.back, y: start.y + u.y * atStart.back };
    const to = { x: end.x - u.x * atEnd.back, y: end.y - u.y * atEnd.back };
    const dash = arrow.style === "dotted" ? ` stroke-dasharray="${DASH}"` : "";
    // 二重線は、線の向きに直交する向きへ半分ずつずらした2本で描く。端が丸まって2本がつながらないよう、端は切りっぱなし
    const n = { x: -u.y, y: u.x };
    const offsets = arrow.style === "double" ? [DOUBLE_GAP / 2, -DOUBLE_GAP / 2] : [0];
    const cap = arrow.style === "double" ? "butt" : "round";
    for (const offset of offsets) {
      const dx = n.x * offset;
      const dy = n.y * offset;
      parts.push(
        `<line x1="${round(from.x + dx)}" y1="${round(from.y + dy)}" x2="${round(to.x + dx)}" y2="${round(to.y + dy)}" stroke="${STROKE}" stroke-width="${STROKE_WIDTH[arrow.style]}"${dash} stroke-linecap="${cap}"/>`,
      );
    }
    parts.push(atStart.svg, atEnd.svg);
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

// 置き終えた図形を SVG の文字列にする。線は図形の下に描く。中まで伸ばした線(over)だけは図形の上に重ねる
export function toSvg(scene: Scene) {
  const width = round(scene.width);
  const height = round(scene.height);
  const lines = (over: boolean) =>
    scene.lines.flatMap((line, index) => (line.over === over ? [`<g data-line="${index}">${drawLine(line)}</g>`] : []));
  const body = [
    ...lines(false),
    ...scene.shapes.map((shape) => `<g data-id="${escape(shape.id)}">${draw(shape)}</g>`),
    ...lines(true),
    ...scene.captions.map((caption, index) => `<g data-caption="${index}">${drawCaption(caption)}</g>`),
  ].join("\n  ");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family='${FONT_FAMILY}' font-size="${FONT_SIZE}" fill="${STROKE}">`,
    `  <rect width="100%" height="100%" fill="#ffffff"/>`,
    `  ${body}`,
    `</svg>`,
    "",
  ].join("\n");
}
