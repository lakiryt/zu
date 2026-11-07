import { layout } from "./layout/layout.ts";
import { toSvg } from "./svg/svg.ts";
import { parse } from "./syntax/parser.ts";

export { ZuError } from "./errors.ts";
export { layout } from "./layout/layout.ts";
export type { PlacedShape, Point, Scene } from "./layout/layout.ts";
export { print } from "./syntax/print.ts";
export { toSvg } from "./svg/svg.ts";
export type { Document, Placement, ShapeStatement, Statement } from "./syntax/ast.ts";
export { tokenize } from "./syntax/lexer.ts";
export { parse } from "./syntax/parser.ts";

// 文字列 → 構文(parse)→ 配置(layout)→ SVG(toSvg)。各段は前の段の結果だけを受け取る
export function render(source: string) {
  return toSvg(layout(parse(source)));
}
