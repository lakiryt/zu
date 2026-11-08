// 構文解析の結果。描き方(大きさや座標の計算)は知らない

export type SourcePosition = { line: number; column: number };

export const SHAPES = ["text", "parallelogram", "cube"] as const;
export type Shape = (typeof SHAPES)[number];

export const DIRECTIONS = ["left", "right", "above", "below"] as const;
export type Direction = (typeof DIRECTIONS)[number];

// 大きさを数を書かずに選ぶ語。medium が既定の大きさ
export const SCALES = ["small", "medium", "large"] as const;
export type Scale = (typeof SCALES)[number];

// size の書き方。数(幅と高さ。立方体は一辺)か、大きさの語
export type SizeOption = { width: number; height: number | null } | Scale;

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
  size: SizeOption | null;
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

// 線の種類。solid は ---、dotted は -.-、double は ===(二重線)
export const LINE_STYLES = ["solid", "dotted", "double"] as const;
export type LineStyle = (typeof LINE_STYLES)[number];

// 線の端。open は V 字の矢印(>)、filled は塗りつぶした三角の矢印(>>)、dot は塗りつぶした丸(o)
export const HEADS = ["none", "open", "filled", "dot"] as const;
export type Head = (typeof HEADS)[number];

export type Arrow = { style: LineStyle; start: Head; end: Head };

// 線の端の図形。into なら、線をその図形の本体の中まで伸ばす(端の印が図形に刺さった形)
export type LineEndpoint = { id: string; at: SourcePosition; into: boolean };

// a ---> b "ラベル" into b。start は from の側、end は to の側の端
export type LineStatement = {
  kind: "line";
  from: LineEndpoint;
  to: LineEndpoint;
  arrow: Arrow;
  label: string | null;
  at: SourcePosition;
  end: SourcePosition;
};

// 図全体の下に置く文の揃え
export const CAPTION_ALIGNS = ["left", "center", "right"] as const;
export type CaptionAlign = (typeof CAPTION_ALIGNS)[number];

// caption "文" right size small。図全体の下に置く文。null は既定(左詰め、中の大きさ)
export type CaptionStatement = {
  kind: "caption";
  text: string;
  align: CaptionAlign | null;
  size: Scale | null;
  at: SourcePosition;
  end: SourcePosition;
};

export type Statement = ShapeStatement | AlignStatement | LineStatement | CaptionStatement;

export type Document = { statements: Statement[] };
