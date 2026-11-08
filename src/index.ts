// zu の公開する入口。ほかのプロジェクトはここから読み込む(パッケージでは dist/index.js)
//
//   import { render } from "zu";
//   const svg = render('text a "本人"\ntext b "代理人" below a\na ---> b');
//
// 文字列 → 構文(parse)→ 配置(layout)→ SVG(toSvg)の3段。各段は前の段の結果だけを受け取るので、
// 途中の結果(構文木や配置)を使ってもよい
import { layout } from "./layout/layout.ts";
import { toSvg } from "./svg/svg.ts";
import { parse } from "./syntax/parser.ts";

// 3段をまとめて、zu の文字列を SVG の文字列にする。誤りは ZuError(行と列を持つ)で投げる
export function render(source: string) {
  return toSvg(layout(parse(source)));
}

export { ZuError } from "./errors.ts";

// 構文
export { parse } from "./syntax/parser.ts";
export { tokenize } from "./syntax/lexer.ts";
export type { Token, TokenType } from "./syntax/lexer.ts";
export { print } from "./syntax/print.ts";
export { AXES, DIRECTIONS, HEADS, JUSTIFICATIONS, LINE_STYLES, SCALES, SHAPES } from "./syntax/ast.ts";
export type {
  AlignStatement,
  Axis,
  CaptionStatement,
  Direction,
  Document,
  Head,
  Justify,
  LineEnd,
  LineStatement,
  LineStyle,
  Placement,
  Scale,
  Shape,
  ShapeStatement,
  Size,
  SourcePosition,
  Statement,
} from "./syntax/ast.ts";

// 配置
export { DEFAULT_GAP, PADDING, defaultGap, layout } from "./layout/layout.ts";
export type {
  Box,
  Geometry,
  PlacedCaption,
  PlacedEnd,
  PlacedLine,
  PlacedShape,
  Point,
  Scene,
} from "./layout/layout.ts";

// 描画
export { toSvg } from "./svg/svg.ts";
