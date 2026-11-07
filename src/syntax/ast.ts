// 構文解析の結果。描き方(大きさや座標の計算)は知らない

export type SourcePosition = { line: number; column: number };

export const SHAPES = ["text", "parallelogram", "cube"] as const;
export type Shape = (typeof SHAPES)[number];

export const DIRECTIONS = ["left", "right", "above", "below"] as const;
export type Direction = (typeof DIRECTIONS)[number];

export type Placement =
  | { kind: "at"; x: number; y: number }
  // gap が null なら既定の間を使う
  | { kind: "beside"; direction: Direction; of: string; gap: number | null; at: SourcePosition };

export type ShapeStatement = {
  kind: "shape";
  shape: Shape;
  id: string;
  // null なら id をラベルにする
  label: string | null;
  placement: Placement | null;
  size: { width: number; height: number | null } | null;
  at: SourcePosition;
};

export type Statement = ShapeStatement;

export type Document = { statements: Statement[] };
