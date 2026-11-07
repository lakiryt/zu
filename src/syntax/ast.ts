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
  // 文の最後の字句の直後(行末のコメントは含まない)
  end: SourcePosition;
};

export const AXES = ["row", "column"] as const;
// row は同じ段(上下の中心を揃える)、column は同じ列(左右の中心を揃える)
export type Axis = (typeof AXES)[number];

export type AlignStatement = {
  kind: "align";
  axis: Axis;
  members: { id: string; at: SourcePosition }[];
  at: SourcePosition;
  end: SourcePosition;
};

// 線の種類。solid は ---、dotted は -.-、thick は ===
export const LINE_STYLES = ["solid", "dotted", "thick"] as const;
export type LineStyle = (typeof LINE_STYLES)[number];

// 線の端。open は塗りつぶさない三角(>)、filled は塗りつぶした三角(>>)、dot は塗りつぶした丸(o)
export const HEADS = ["none", "open", "filled", "dot"] as const;
export type Head = (typeof HEADS)[number];

export type Arrow = { style: LineStyle; start: Head; end: Head };

// a ---> b "ラベル"。start は from の側、end は to の側の端
export type LineStatement = {
  kind: "line";
  from: { id: string; at: SourcePosition };
  to: { id: string; at: SourcePosition };
  arrow: Arrow;
  label: string | null;
  at: SourcePosition;
  end: SourcePosition;
};

export type Statement = ShapeStatement | AlignStatement | LineStatement;

export type Document = { statements: Statement[] };
