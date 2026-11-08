// 図形の大きさと、描くのに要る寸法を決める。位置は知らない
import type { Scale, Shape, ShapeStatement } from "../syntax/ast.ts";
import type { Box, Point } from "./geometry.ts";
import { measureText } from "./measure.ts";

// 図形ごとの描き方に要る寸法。外枠の中のどこに何を描くかは svg 側で決める
export type Geometry =
  | { shape: "text" }
  | { shape: "parallelogram"; skew: number }
  // 立方体は外枠の上部に描き、ラベルはその下に置く。labelTop は外枠の上端からラベルの上端まで
  | { shape: "cube"; edge: number; depth: number; labelTop: number };

// 大きさの語ごとの寸法。書かなければ medium。平行四辺形は高さと最小の幅、立方体は正面の一辺
const PARALLELOGRAM_SCALES: Record<Scale, { height: number; minWidth: number }> = {
  small: { height: 36, minWidth: 72 },
  medium: { height: 48, minWidth: 96 },
  large: { height: 60, minWidth: 120 },
};
const CUBE_SCALES: Record<Scale, number> = { small: 28, medium: 40, large: 60 };
const PARALLELOGRAM = { padding: 24, skewRatio: 0.5 };
const CUBE = { depthRatio: 0.3, labelGap: 6 };

// 外枠の大きさ。anchorTop は外枠の上端から本体(ラベルを除いた図形)の中心まで
export type Sized = { width: number; height: number; anchorTop: number; geometry: Geometry };

export function sizeOf(statement: ShapeStatement): Sized {
  const text = measureText(statement.label ?? statement.id);
  const shape: Shape = statement.shape;
  if (shape === "text") return { ...text, anchorTop: text.height / 2, geometry: { shape } };

  const scale = typeof statement.size === "string" ? statement.size : "medium";
  const numbers = typeof statement.size === "string" ? null : statement.size;

  if (shape === "parallelogram") {
    const preset = PARALLELOGRAM_SCALES[scale];
    const height = numbers?.height ?? preset.height;
    const skew = height * PARALLELOGRAM.skewRatio;
    const fitted = Math.max(preset.minWidth, text.width + PARALLELOGRAM.padding * 2 + skew);
    return { width: numbers?.width ?? fitted, height, anchorTop: height / 2, geometry: { shape, skew } };
  }

  const edge = numbers?.width ?? CUBE_SCALES[scale];
  const depth = edge * CUBE.depthRatio;
  return {
    width: Math.max(edge + depth, text.width),
    height: edge + depth + CUBE.labelGap + text.height,
    anchorTop: (edge + depth) / 2,
    geometry: { shape, edge, depth, labelTop: edge + depth + CUBE.labelGap },
  };
}

// 本体の中心を anchor に置いたときの外枠
export function boxAt(size: Sized, anchor: Point): Box {
  return { x: anchor.x - size.width / 2, y: anchor.y - size.anchorTop, width: size.width, height: size.height };
}

// 本体の枠(線を切る枠)。立方体はラベルを除いた立方体の部分
export function bodyOf(size: Sized, anchor: Point, box: Box): Box {
  const { geometry } = size;
  if (geometry.shape !== "cube") return box;
  const side = geometry.edge + geometry.depth;
  return { x: anchor.x - side / 2, y: box.y, width: side, height: side };
}

// 線を中まで伸ばすとき(into)に、線の端を置いてよい枠。図形の内側に収まる長方形にする。
// 立方体は正面、平行四辺形は斜めの辺を除いた部分
export function innerOf(size: Sized, body: Box): Box {
  const { geometry } = size;
  if (geometry.shape === "cube") {
    return { x: body.x, y: body.y + geometry.depth, width: geometry.edge, height: geometry.edge };
  }
  if (geometry.shape === "parallelogram") {
    return { x: body.x + geometry.skew, y: body.y, width: Math.max(0, body.width - geometry.skew * 2), height: body.height };
  }
  return body;
}
