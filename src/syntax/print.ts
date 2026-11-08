// 文を zu の文字に戻す。parse の逆で、エディタが文を書き換えるときに使う。
// 書き方の揺れ(of の有無、数の間の「,」)は一つの形にそろえる
import { writeArrow } from "./arrow.ts";
import type { Placement, Statement } from "./ast.ts";

const ESCAPED: Record<string, string> = { '"': '\\"', "\\": "\\\\", "\n": "\\n" };

export function quote(label: string) {
  return `"${label.replace(/["\\\n]/g, (char) => ESCAPED[char]!)}"`;
}

// 小数は2桁までに丸める。ドラッグで出た半端な数を残さない
export function number(value: number) {
  return String(Math.round(value * 100) / 100);
}

export function printPlacement(placement: Placement) {
  if (placement.kind === "at") return `at ${number(placement.x)} ${number(placement.y)}`;
  const gap = placement.gap === null ? "" : ` by ${number(placement.gap)}`;
  return `${placement.direction} of ${placement.of}${gap}`;
}

export function print(statement: Statement) {
  if (statement.kind === "line") {
    const label = statement.label === null ? "" : ` ${quote(statement.label)}`;
    const into = [statement.from, statement.to].filter((end) => end.into).map((end) => end.id);
    const deep = into.length === 0 ? "" : ` into ${into.join(" ")}`;
    return `${statement.from.id} ${writeArrow(statement.arrow)} ${statement.to.id}${label}${deep}`;
  }
  if (statement.kind === "caption") {
    const parts = ["caption", quote(statement.text)];
    if (statement.align) parts.push(statement.align);
    if (statement.size) parts.push(`size ${statement.size}`);
    return parts.join(" ");
  }
  if (statement.kind === "align") {
    return ["align", statement.axis, ...statement.members.map(({ id }) => id)].join(" ");
  }
  const parts: string[] = [statement.shape, statement.id];
  if (statement.label !== null) parts.push(quote(statement.label));
  if (statement.placement) parts.push(printPlacement(statement.placement));
  if (typeof statement.size === "string") {
    parts.push(`size ${statement.size}`);
  } else if (statement.size) {
    const { width, height } = statement.size;
    parts.push(height === null ? `size ${number(width)}` : `size ${number(width)} ${number(height)}`);
  }
  return parts.join(" ");
}
