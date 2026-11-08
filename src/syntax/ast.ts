// 構文解析の結果。描き方(大きさや座標の計算)は知らない

export type SourcePosition = { line: number; column: number };

export const SHAPES = ["text", "parallelogram", "cube"] as const;
export type Shape = (typeof SHAPES)[number];

export const DIRECTIONS = ["left", "right", "above", "below"] as const;
export type Direction = (typeof DIRECTIONS)[number];

// 大きさを数を書かずに選ぶ語。medium が既定の大きさ
export const SCALES = ["small", "medium", "large"] as const;
export type Scale = (typeof SCALES)[number];

// size の書き方。大きさの語か、数(幅と高さ。立方体は一辺だけ使う)
export type Size = { kind: "scale"; scale: Scale } | { kind: "numbers"; width: number; height: number | null };

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
  size: Size | null;
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

// 線の端の印。open は V 字の矢印(>)、filled は塗りつぶした三角の矢印(>>)、dot は塗りつぶした丸(o)
export const HEADS = ["none", "open", "filled", "dot"] as const;
export type Head = (typeof HEADS)[number];

// 線の端。id の図形か線につなぎ、head の印を付ける。
// into なら線を図形の本体の中まで伸ばす(印が図形に刺さった形。線には使えない)
export type LineEnd = { id: string; at: SourcePosition; head: Head; into: boolean };

// 線を曲げる向き。from から to へ進むときの左右(TikZ の bend left、bend right と同じ)
export const BEND_SIDES = ["left", "right"] as const;
export type BendSide = (typeof BEND_SIDES)[number];

// bend left large。side の側へふくらむ弧にする。scale はふくらみの大きさ(null は既定の medium)
export type Bend = { side: BendSide; scale: Scale | null };

// a ---> b "ラベル" as f bend left into b。from は記号の左、to は右の図形(か線)。
// id は線の名前(as で付ける。なければ null)。名前を付けた線には、ほかの線を向けられる。
// bend は曲げ方(null ならまっすぐ)。labelOn はラベルを線に重ねるか(on。既定は線の脇)
export type LineStatement = {
  kind: "line";
  style: LineStyle;
  from: LineEnd;
  to: LineEnd;
  label: string | null;
  labelOn: boolean;
  id: string | null;
  bend: Bend | null;
  at: SourcePosition;
  end: SourcePosition;
};

// 図の下の文の揃え
export const JUSTIFICATIONS = ["left", "center", "right"] as const;
export type Justify = (typeof JUSTIFICATIONS)[number];

// caption "文" right size small。図全体の下に置く文。null は既定(左詰め、中の大きさ)
export type CaptionStatement = {
  kind: "caption";
  text: string;
  justify: Justify | null;
  size: Scale | null;
  at: SourcePosition;
  end: SourcePosition;
};

// 注釈の種類。says は発言(吹き出し)、note は図形についての注記(小さな字)
export const ANNOTATION_KINDS = ["says", "note"] as const;
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];

// 注釈を置く場所。上下と左右の組で、どちらか一方は null でもよい(above right は右上、left は左)
export type Spot = { vertical: "above" | "below" | null; horizontal: "left" | "right" | null };

// a says "売ります" above right。target の図形に紐づける注釈。spot が null なら置き場所を自動で決める
export type AnnotationStatement = {
  kind: "annotation";
  annotation: AnnotationKind;
  target: string;
  targetAt: SourcePosition;
  text: string;
  spot: Spot | null;
  at: SourcePosition;
  end: SourcePosition;
};

export type Statement = ShapeStatement | AlignStatement | LineStatement | CaptionStatement | AnnotationStatement;

export type Document = { statements: Statement[] };
