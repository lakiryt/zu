// 図形の大きさと、描くのに要る寸法を決める。位置は知らない
import type { Shape, ShapeStatement } from "../syntax/ast.ts";
import type { Box, Point } from "./geometry.ts";
import { measureText } from "./measure.ts";

// 図形ごとの描き方に要る寸法。外枠の中のどこに何を描くかは svg 側で決める
export type Geometry =
  | { shape: "text" }
  | { shape: "parallelogram"; skew: number }
  // 立方体は外枠の上部に描き、ラベルはその下に置く。labelTop は外枠の上端からラベルの上端まで
  | { shape: "cube"; edge: number; depth: number; labelTop: number };

const PARALLELOGRAM = { minWidth: 120, height: 60, padding: 24, skewRatio: 0.5 };
const CUBE = { edge: 60, depthRatio: 0.3, labelGap: 6 };

// 外枠の大きさ。anchorTop は外枠の上端から本体(ラベルを除いた図形)の中心まで
export type Sized = { width: number; height: number; anchorTop: number; geometry: Geometry };

export function sizeOf(statement: ShapeStatement): Sized {
  const text = measureText(statement.label ?? statement.id);
  const shape: Shape = statement.shape;
  if (shape === "text") return { ...text, anchorTop: text.height / 2, geometry: { shape } };

  if (shape === "parallelogram") {
    const height = statement.size?.height ?? PARALLELOGRAM.height;
    const skew = height * PARALLELOGRAM.skewRatio;
    const fitted = Math.max(PARALLELOGRAM.minWidth, text.width + PARALLELOGRAM.padding * 2 + skew);
    return { width: statement.size?.width ?? fitted, height, anchorTop: height / 2, geometry: { shape, skew } };
  }

  const edge = statement.size?.width ?? CUBE.edge;
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
