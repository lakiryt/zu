import { ZuError } from "../errors.ts";
import { DIRECTIONS, SHAPES } from "./ast.ts";
import type { Direction, Document, Placement, Shape, ShapeStatement } from "./ast.ts";
import { tokenize } from "./lexer.ts";
import type { Token, TokenType } from "./lexer.ts";

const NAMES: Record<TokenType, string> = {
  word: "語",
  string: "文字列",
  number: "数",
  comma: "「,」",
  newline: "改行",
  eof: "ファイルの終わり",
};

const describe = (token: Token) =>
  token.type === "word" || token.type === "number" ? `「${token.value}」` : NAMES[token.type];

const isShape = (value: string): value is Shape => (SHAPES as readonly string[]).includes(value);
const isDirection = (value: string): value is Direction =>
  (DIRECTIONS as readonly string[]).includes(value);

// 字句の列を文の列にする。1行に1文で、行の途中で誤りがあればその位置を報告する
export function parse(source: string): Document {
  const tokens = tokenize(source);
  let index = 0;

  const peek = () => tokens[index]!;
  const next = () => tokens[index++]!;
  const atLineEnd = () => peek().type === "newline" || peek().type === "eof";

  function expect(type: TokenType, what: string) {
    const token = peek();
    if (token.type !== type) throw new ZuError(`${what}が必要です(${describe(token)}がありました)`, token.at);
    return next();
  }

  function number(what: string) {
    return Number(expect("number", what).value);
  }

  // 数と数の間の「,」は書いても書かなくてもよい
  function skipComma() {
    if (peek().type === "comma") next();
  }

  function statement(): ShapeStatement {
    const head = expect("word", "図形の種類");
    if (!isShape(head.value)) {
      throw new ZuError(`「${head.value}」という図形はありません(${SHAPES.join("、")})`, head.at);
    }
    const id = expect("word", "図形の名前").value;
    const label = peek().type === "string" ? next().value : null;
    let placement: Placement | null = null;
    let size: ShapeStatement["size"] = null;

    while (!atLineEnd()) {
      const option = peek();
      if (option.type !== "word") throw new ZuError(`${describe(option)}は置けません`, option.at);
      next();

      if (option.value === "at" || isDirection(option.value)) {
        if (placement) throw new ZuError("置き方は1つの図形に1つまでです", option.at);
        if (option.value === "at") {
          const x = number("x 座標");
          skipComma();
          placement = { kind: "at", x, y: number("y 座標") };
        } else {
          // 「right of a」とも「below a」とも書ける。of という名前の図形は「below of of」と書く
          const after = tokens[index + 1];
          if (peek().type === "word" && peek().value === "of" && after?.type === "word") next();
          const of = expect("word", "基準にする図形の名前").value;
          let gap: number | null = null;
          if (peek().type === "word" && peek().value === "by") {
            next();
            gap = number("間の大きさ");
          }
          placement = { kind: "beside", direction: option.value as Direction, of, gap, at: option.at };
        }
      } else if (option.value === "size") {
        if (size) throw new ZuError("size は1つの図形に1つまでです", option.at);
        const width = number("大きさ");
        skipComma();
        const height = peek().type === "number" ? number("高さ") : null;
        size = { width, height };
      } else {
        throw new ZuError(`「${option.value}」は使えません(at、left、right、above、below、size)`, option.at);
      }
    }

    return { kind: "shape", shape: head.value, id, label, placement, size, at: head.at };
  }

  const statements: ShapeStatement[] = [];
  while (peek().type !== "eof") {
    if (peek().type === "newline") {
      next();
      continue;
    }
    statements.push(statement());
    if (peek().type === "newline") next();
  }
  return { statements };
}
