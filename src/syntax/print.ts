// 文を zu の文字に戻す。parse の逆で、エディタが文を書き換えるときに使う。
// 書き方の揺れ(of の有無、数の間の「,」)は一つの形にそろえる
import { writeArrow } from "./arrow.ts";
import type { Placement, Size, Statement, TreeItem } from "./ast.ts";

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

function printSize(size: Size) {
  if (size.kind === "scale") return `size ${size.scale}`;
  const height = size.height === null ? "" : ` ${number(size.height)}`;
  return `size ${number(size.width)}${height}`;
}

export function print(statement: Statement) {
  const parts: string[] = [];
  switch (statement.kind) {
    case "line": {
      const { style, from, to, label } = statement;
      parts.push(from.id, writeArrow({ style, start: from.head, end: to.head }), to.id);
      if (label !== null) parts.push(quote(label), ...(statement.labelOn ? ["on"] : []));
      if (statement.id !== null) parts.push("as", statement.id);
      if (statement.bend) parts.push("bend", statement.bend.side, ...(statement.bend.scale ? [statement.bend.scale] : []));
      const into = [from, to].filter((end) => end.into).map((end) => end.id);
      if (into.length > 0) parts.push("into", ...into);
      break;
    }
    case "align":
      parts.push("align", statement.axis, ...statement.members.map(({ id }) => id));
      break;
    case "annotation":
      parts.push(statement.target, statement.annotation, quote(statement.text));
      if (statement.spot) {
        const { vertical, horizontal } = statement.spot;
        if (vertical) parts.push(vertical);
        if (horizontal) parts.push(horizontal);
      }
      break;
    case "caption":
      parts.push("caption", quote(statement.text));
      if (statement.justify) parts.push(statement.justify);
      if (statement.size) parts.push(`size ${statement.size}`);
      break;
    case "shape":
      parts.push(statement.shape, statement.id);
      if (statement.label !== null) parts.push(quote(statement.label));
      if (statement.placement) parts.push(printPlacement(statement.placement));
      if (statement.size) parts.push(printSize(statement.size));
      if (statement.items) return [parts.join(" "), ...printItems(statement.items, 0)].join("\n");
      break;
  }
  return parts.join(" ");
}

// 木の項目を、一段に2字ずつ字下げした「- 文字」の行にする。
// そのままでは読み違える文字(改行、前後の空白、引用符で始まる、コメントの印)は引用符で囲む
function printItems(items: TreeItem[], depth: number): string[] {
  return items.flatMap(({ label, children }) => {
    const plain = !/\n|%%|^\s|\s$|^"/.test(label);
    return [`${"  ".repeat(depth)}- ${plain ? label : quote(label)}`, ...printItems(children, depth + 1)];
  });
}
