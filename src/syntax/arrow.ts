// 線の記号(---> など)と Arrow の行き来
import type { Arrow, Head, LineStyle } from "./ast.ts";

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
  const style: LineStyle = body.startsWith("=") ? "thick" : body.includes(".") ? "dotted" : "solid";
  return { style, start: START[start]!, end: END[end]! };
}

const BODY: Record<LineStyle, string> = { solid: "---", dotted: "-.-", thick: "===" };
const START_TEXT: Record<Head, string> = { none: "", open: "<", filled: "<<", dot: "o" };
const END_TEXT: Record<Head, string> = { none: "", open: ">", filled: ">>", dot: "o" };

export function writeArrow({ style, start, end }: Arrow) {
  return `${START_TEXT[start]}${BODY[style]}${END_TEXT[end]}`;
}
