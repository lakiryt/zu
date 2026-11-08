// 線の記号(o--->> など)と、線の種類・両端の印との行き来
import type { Head, LineStyle } from "./ast.ts";

// 線の記号から読み取れるもの。start は記号の左の端、end は右の端の印
export type Arrow = { style: LineStyle; start: Head; end: Head };

// 左の端、線の本体、右の端。本体は --(2本以上)、-.-(点は1つ以上)、==(2本以上)
const PATTERN = /^(<<|<|o)?(-\.+-|-{2,}|={2,})(>>|>|o)?$/;

const START: Record<string, Head> = { "": "none", "<": "open", "<<": "filled", o: "dot" };
const END: Record<string, Head> = { "": "none", ">": "open", ">>": "filled", o: "dot" };

export function isArrow(text: string) {
  return PATTERN.test(text);
}

export function readArrow(text: string): Arrow | null {
  const match = PATTERN.exec(text);
  if (!match) return null;
  const [, start = "", body = "", end = ""] = match;
  const style: LineStyle = body.startsWith("=") ? "double" : body.includes(".") ? "dotted" : "solid";
  return { style, start: START[start]!, end: END[end]! };
}

const BODY: Record<LineStyle, string> = { solid: "---", dotted: "-.-", double: "===" };
const START_TEXT: Record<Head, string> = { none: "", open: "<", filled: "<<", dot: "o" };
const END_TEXT: Record<Head, string> = { none: "", open: ">", filled: ">>", dot: "o" };

export function writeArrow({ style, start, end }: Arrow) {
  return `${START_TEXT[start]}${BODY[style]}${END_TEXT[end]}`;
}
