// 置き終えた図(Scene)を SVG の文字列にする。大きさや位置は計算し直さない
import { along, direction, distance } from "../layout/geometry.ts";
import type { Point } from "../layout/geometry.ts";
import type { PlacedCaption, PlacedLine, PlacedShape, Scene } from "../layout/layout.ts";
import { HEAD, headScale } from "../layout/lines.ts";
import { FONT_SIZE, LINE_HEIGHT, labelLines } from "../layout/measure.ts";
import type { Head, Justify } from "../syntax/ast.ts";

const STROKE = "#333333";
const FACES = { front: "#ffffff", top: "#ececec", side: "#d6d6d6" };
const FONT_FAMILY = `"Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif`;
// 線の太さ、点線の間隔、二重線の2本の中心どうしの間。矢先の大きさは配置の段(HEAD)が決める
const STROKE_WIDTH = { solid: 1.5, dotted: 1.5, double: 1.2 };
const HEAD_STROKE_WIDTH = 1.5;
const DASH = "2 4";
const DOUBLE_GAP = 3.5;

const round = (value: number) => Math.round(value * 100) / 100;

function escape(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const points = (list: Point[]) => list.map(({ x, y }) => `${round(x)},${round(y)}`).join(" ");

const polygon = (list: Point[], fill: string) =>
  `<polygon points="${points(list)}" fill="${fill}" stroke="${STROKE}" stroke-linejoin="round"/>`;

const TEXT_ANCHOR: Record<Justify, string> = { left: "start", center: "middle", right: "end" };

// 文字を書く。複数行は、行の並び全体の上下の中心が y に来るよう積む。x は justify に応じて行の左端、中央、右端
function text(content: string, x: number, y: number, justify: Justify = "center", fontSize = FONT_SIZE) {
  const lines = labelLines(content);
  const step = fontSize * LINE_HEIGHT;
  const top = y - (lines.length * step) / 2;
  const spans = lines
    .map((line, index) => `<tspan x="${round(x)}" y="${round(top + step * (index + 0.5))}">${escape(line)}</tspan>`)
    .join("");
  const size = fontSize === FONT_SIZE ? "" : ` font-size="${fontSize}"`;
  return `<text text-anchor="${TEXT_ANCHOR[justify]}" dominant-baseline="central"${size}>${spans}</text>`;
}

function drawShape({ label: content, box, geometry }: PlacedShape) {
  const { x, y, width, height } = box;
  const centerX = x + width / 2;
  const label = (cy: number) => (content === null ? "" : text(content, centerX, cy));

  switch (geometry.shape) {
    case "text":
      return label(y + height / 2);

    case "parallelogram": {
      const { skew } = geometry;
      const outline = [
        { x: x + skew, y },
        { x: x + width, y },
        { x: x + width - skew, y: y + height },
        { x, y: y + height },
      ];
      return polygon(outline, FACES.front) + label(y + height / 2);
    }

    case "cube": {
      const { edge, depth, labelTop } = geometry;
      // ラベルが立方体より広いときは、立方体を外枠の中央に寄せる
      const left = centerX - (edge + depth) / 2;
      const front = y + depth;
      const top = [
        { x: left, y: front },
        { x: left + depth, y },
        { x: left + depth + edge, y },
        { x: left + edge, y: front },
      ];
      const side = [
        { x: left + edge, y: front },
        { x: left + edge + depth, y },
        { x: left + edge + depth, y: y + edge },
        { x: left + edge, y: front + edge },
      ];
      const face = [
        { x: left, y: front },
        { x: left + edge, y: front },
        { x: left + edge, y: front + edge },
        { x: left, y: front + edge },
      ];
      return [
        polygon(top, FACES.top),
        polygon(side, FACES.side),
        polygon(face, FACES.front),
        label((y + labelTop + y + height) / 2),
      ].join("");
    }
  }
}

// tip に向かう向き u の矢先。線をどれだけ手前で止めるか(back)も返す。
// spread は線の中心から外側の線までの距離(二重線なら半分の間、それ以外は 0)
function drawHead(kind: Head, tip: Point, u: Point, scale: number, spread: number) {
  if (kind === "none") return { svg: "", back: 0 };
  if (kind === "dot") {
    const r = HEAD.radius * scale;
    const c = along(tip, u, -r);
    return { svg: `<circle cx="${round(c.x)}" cy="${round(c.y)}" r="${round(r)}" fill="${STROKE}"/>`, back: r };
  }
  const length = HEAD.length * scale;
  const half = (HEAD.width * scale) / 2;
  const base = along(tip, u, -length);
  const n = { x: -u.y, y: u.x };
  const wings = [along(base, n, half), along(base, n, -half)] as const;
  if (kind === "open") {
    // V 字。中が空いているので線は先端まで伸ばす。二重線は、2本が V の腕に当たる所で止める
    return {
      svg: `<polyline points="${points([wings[0], tip, wings[1]])}" fill="none" stroke="${STROKE}" stroke-width="${HEAD_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>`,
      back: (spread * length) / half,
    };
  }
  return {
    svg: `<polygon points="${points([tip, ...wings])}" fill="${STROKE}" stroke="${STROKE}" stroke-width="${HEAD_STROKE_WIDTH}" stroke-linejoin="round"/>`,
    back: length,
  };
}

function drawLine({ style, from, to, label, labelBox }: PlacedLine) {
  const parts: string[] = [];
  const start = from.point;
  const end = to.point;
  if (distance(start, end) > 0) {
    const u = direction(start, end);
    const scale = headScale(style);
    const spread = style === "double" ? DOUBLE_GAP / 2 : 0;
    const atStart = drawHead(from.head, start, { x: -u.x, y: -u.y }, scale, spread);
    const atEnd = drawHead(to.head, end, u, scale, spread);
    // 矢先の中に線が見えないよう、線は矢先の根元で止める
    const p = along(start, u, atStart.back);
    const q = along(end, u, -atEnd.back);
    const dash = style === "dotted" ? ` stroke-dasharray="${DASH}"` : "";
    // 二重線は、線の向きに直交する向きへ半分ずつずらした2本で描く。端が丸まって2本がつながらないよう、端は切りっぱなし
    const n = { x: -u.y, y: u.x };
    const offsets = style === "double" ? [DOUBLE_GAP / 2, -DOUBLE_GAP / 2] : [0];
    const cap = style === "double" ? "butt" : "round";
    for (const offset of offsets) {
      const a = along(p, n, offset);
      const b = along(q, n, offset);
      parts.push(
        `<line x1="${round(a.x)}" y1="${round(a.y)}" x2="${round(b.x)}" y2="${round(b.y)}" stroke="${STROKE}" stroke-width="${STROKE_WIDTH[style]}"${dash} stroke-linecap="${cap}"/>`,
      );
    }
    parts.push(atStart.svg, atEnd.svg);
  }
  if (label !== null && labelBox) {
    const { x, y, width, height } = labelBox;
    parts.push(
      `<rect x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}" rx="3" fill="${FACES.front}"/>`,
      text(label, x + width / 2, y + height / 2),
    );
  }
  return parts.join("");
}

// 図の下の文。行を外枠の左、中央、右に揃えて書く
function drawCaption({ text: content, justify, fontSize, box }: PlacedCaption) {
  const x = box.x + (justify === "left" ? 0 : justify === "right" ? box.width : box.width / 2);
  return text(content, x, box.y + box.height / 2, justify, fontSize);
}

// 線は図形の下に描く。中まで伸ばした線(over)だけは図形の上に重ねる。図の下の文は最後
export function toSvg(scene: Scene) {
  const width = round(scene.width);
  const height = round(scene.height);
  const lines = (over: boolean) =>
    scene.lines.flatMap((line, index) => (line.over === over ? [`<g data-line="${index}">${drawLine(line)}</g>`] : []));
  const body = [
    ...lines(false),
    ...scene.shapes.map((shape) => `<g data-id="${escape(shape.id)}">${drawShape(shape)}</g>`),
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
