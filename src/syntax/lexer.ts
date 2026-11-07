import { ZuError } from "../errors.ts";
import type { SourcePosition } from "./ast.ts";

export type TokenType = "word" | "string" | "number" | "comma" | "newline" | "eof";

// end は字句の直後の位置。エディタが文の範囲を書き換えるのに使う
export type Token = { type: TokenType; value: string; at: SourcePosition; end: SourcePosition };

const WORD_START = /[\p{L}_]/u;
const WORD_PART = /[\p{L}\p{N}_-]/u;
const DIGIT = /[0-9]/;
const ESCAPES: Record<string, string> = { '"': '"', "\\": "\\", n: "\n" };

// 文字列を語、文字列、数、区切りに分ける。コメントと空白は捨て、改行は文の区切りとして残す
export function tokenize(source: string): Token[] {
  const chars = [...source.replace(/\r\n?/g, "\n")];
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;
  let column = 1;

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

  while (index < chars.length) {
    const char = peek()!;
    const at = here();

    if (char === " " || char === "\t") {
      advance();
    } else if (char === "\n") {
      advance();
      tokens.push({ type: "newline", value: "\n", at, end: here() });
    } else if (char === "%" && peek(1) === "%") {
      while (peek() !== undefined && peek() !== "\n") advance();
    } else if (char === ",") {
      advance();
      tokens.push({ type: "comma", value: ",", at, end: here() });
    } else if (char === '"') {
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
