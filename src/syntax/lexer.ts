import { ZuError } from "../errors.ts";
import { isArrow } from "./arrow.ts";
import type { SourcePosition } from "./ast.ts";

export type TokenType = "word" | "string" | "number" | "comma" | "arrow" | "item" | "open" | "close" | "newline" | "eof";

// end は字句の直後の位置。エディタが文の範囲を書き換えるのに使う。
// item は木の項目の印(行の頭の「- 」)。value は印の後に引用符なしで書いた文字で、
// 引用符で書けば空にして、文字列の字句を続ける。字下げの深さは at の列で分かる。
// open と close は木の項目を括る括弧(行の頭の「{」と「}」)。close の value は、item と同じく括弧に添える文字
export type Token = { type: TokenType; value: string; at: SourcePosition; end: SourcePosition };

const WORD_START = /[\p{L}_]/u;
const WORD_PART = /[\p{L}\p{N}_-]/u;
const DIGIT = /[0-9]/;
// 線の記号は空白、引用符、「,」、コメントで区切る
const ARROW_PART = /[^\s",%]/u;
const ESCAPES: Record<string, string> = { '"': '"', "\\": "\\", n: "\n" };

const blank = (char: string | undefined) => char === " " || char === "\t";

// 文字列を語、文字列、数、区切りに分ける。コメントと空白は捨て、改行は文の区切りとして残す
export function tokenize(source: string): Token[] {
  const chars = [...source.replace(/\r\n?/g, "\n")];
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;
  let column = 1;
  // 行の頭から空白しか読んでいないか。「- 」はそのときだけ項目の印にする
  let lineStart = true;

  const peek = (offset = 0) => chars[index + offset];
  const here = (): SourcePosition => ({ line, column });
  function advance() {
    const char = chars[index++]!;
    if (char === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
    return char;
  }
  const take = (pattern: RegExp) => {
    let text = "";
    while (peek() !== undefined && pattern.test(peek()!)) text += advance();
    return text;
  };
  const atComment = () => peek() === "%" && peek(1) === "%";

  // 今の位置から区切りまでが線の記号なら、その長さ
  const arrowLength = () => {
    let length = 0;
    while (peek(length) !== undefined && ARROW_PART.test(peek(length)!)) length += 1;
    return length > 0 && isArrow(chars.slice(index, index + length).join("")) ? length : 0;
  };

  function string(at: SourcePosition) {
    advance();
    let value = "";
    for (;;) {
      const next = peek();
      if (next === undefined || next === "\n") throw new ZuError("文字列が閉じていません", at);
      advance();
      if (next === '"') break;
      if (next === "\\") {
        const escaped = peek();
        const replaced = escaped === undefined ? undefined : ESCAPES[escaped];
        if (replaced === undefined) {
          throw new ZuError(`「\\${escaped ?? ""}」は文字列の中で使えません`, here());
        }
        advance();
        value += replaced;
      } else {
        value += next;
      }
    }
    tokens.push({ type: "string", value, at, end: here() });
  }

  // 「- 」と「}」の後の文字。引用符で始まれば、印だけを字句にして、文字列は普段どおり読む。
  // そうでなければ、行末かコメントまでをそのまま項目の文字にする(後ろの空白は除く)
  function item(at: SourcePosition, type: "item" | "close") {
    advance();
    while (blank(peek())) advance();
    if (peek() === '"') {
      tokens.push({ type, value: "", at, end: here() });
      return;
    }
    let value = "";
    let end = here();
    while (peek() !== undefined && peek() !== "\n" && !atComment()) {
      const char = advance();
      value += char;
      if (!blank(char)) end = here();
    }
    tokens.push({ type, value: value.trimEnd(), at, end });
  }

  while (index < chars.length) {
    const char = peek()!;
    const at = here();
    const arrow = "-=<o".includes(char) ? arrowLength() : 0;
    const starting: boolean = lineStart;
    lineStart = char === "\n" || (starting && blank(char));

    if (blank(char)) {
      advance();
    } else if (char === "\n") {
      advance();
      tokens.push({ type: "newline", value: "\n", at, end: here() });
    } else if (starting && char === "-" && (peek(1) === undefined || peek(1) === "\n" || blank(peek(1)))) {
      item(at, "item");
    } else if (starting && char === "{") {
      advance();
      tokens.push({ type: "open", value: "{", at, end: here() });
    } else if (starting && char === "}") {
      item(at, "close");
    } else if (arrow > 0) {
      let value = "";
      for (let n = 0; n < arrow; n++) value += advance();
      tokens.push({ type: "arrow", value, at, end: here() });
    } else if (atComment()) {
      while (peek() !== undefined && peek() !== "\n") advance();
    } else if (char === ",") {
      advance();
      tokens.push({ type: "comma", value: ",", at, end: here() });
    } else if (char === '"') {
      string(at);
    } else if (DIGIT.test(char) || (char === "-" && DIGIT.test(peek(1) ?? ""))) {
      let value = char === "-" ? advance() : "";
      value += take(DIGIT);
      if (peek() === "." && DIGIT.test(peek(1) ?? "")) value += advance() + take(DIGIT);
      tokens.push({ type: "number", value, at, end: here() });
    } else if (WORD_START.test(char)) {
      const value = take(WORD_PART);
      tokens.push({ type: "word", value, at, end: here() });
    } else {
      throw new ZuError(`「${char}」は使えません`, at);
    }
  }

  tokens.push({ type: "eof", value: "", at: here(), end: here() });
  return tokens;
}
