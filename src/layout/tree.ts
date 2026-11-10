// 木(tree)の項目と線の置き場所を決める。親は最初の子と同じ段に書き、線で子へ枝分かれさせる
//
//   ┌1─┬─a ⎫
//   │   │   ⎬ 括弧の文
//   │   └─b ⎭
//   └─2
//
// 同じ深さの項目は同じ列に揃える。根のラベルがなく、上の段の項目が複数あれば、左の括弧でまとめる。
// 上の段が1つなら、その項目を根にする。兄弟を括る括弧は、括った段の中でいちばん右にあるものの右に置く
import type { TreeBrace, TreeItem } from "../syntax/ast.ts";
import type { Box, Point } from "./geometry.ts";
import { measureText } from "./measure.ts";

// 項目と括弧の文の字の外枠(box)、線(端から端までの線分)、括弧(x は左端、top から bottom まで、width は張り出し)。
// どれも木の外枠の左上からの位置
export type TreeNode = { label: string; box: Box };
export type TreeBraceShape = { x: number; top: number; bottom: number; width: number };
export type TreeShape = {
  width: number;
  height: number;
  nodes: TreeNode[];
  strokes: [Point, Point][];
  braces: TreeBraceShape[];
};

// gap は上下に並ぶ項目(その子孫も含めた範囲)の間。pad は字と線の間、arm は枝分かれの縦線から横へ伸ばす長さ。
// brace は括弧の張り出しと、括った中身や括弧の文との間
export const TREE = { gap: 8, pad: 6, arm: 12, brace: { width: 8, pad: 6 } };

// 根のラベルがない括弧は、字を持たない節として扱う。braces は子にかける括弧
type Node = { label: string | null; width: number; height: number; level: number; children: Node[]; braces: TreeBrace[] };

function build(label: string | null, items: TreeItem[], braces: TreeBrace[], level: number): Node {
  const size = label === null ? { width: 0, height: 0 } : measureText(label);
  return {
    label,
    ...size,
    level,
    braces,
    children: items.map((item) => build(item.label, item.children, item.braces ?? [], level + 1)),
  };
}

// root が null なら、上の段の項目を括弧でまとめる(1つだけなら、それを根にする)。braces は上の段にかける括弧
export function layoutTree(root: string | null, items: TreeItem[], braces: TreeBrace[] = []): TreeShape {
  const single = root === null && items.length === 1;
  const top = single
    ? build(items[0]!.label, items[0]!.children, items[0]!.braces ?? [], 0)
    : build(root, items, braces, 0);
  const all: Node[] = [];
  const visit = (node: Node) => {
    all.push(node);
    node.children.forEach(visit);
  };
  visit(top);

  // 列の左端。親の列は、子を持つ項目のうち最も広いものに合わせ、その右に枝分かれの縦線を置く
  const depth = Math.max(...all.map(({ level }) => level));
  const columns: number[] = [0];
  const spines: number[] = [];
  for (let level = 0; level < depth; level++) {
    const parents = all.filter((node) => node.level === level && node.children.length > 0);
    const widest = Math.max(...parents.map(({ width }) => width));
    // 字のない括弧は、縦線を列の左端に置く
    spines[level] = columns[level]! + (top.label === null && level === 0 ? 0 : widest + TREE.pad + TREE.arm);
    columns[level + 1] = spines[level]! + TREE.arm + TREE.pad;
  }

  // 段の高さ。節ごとに、自分の段の中心から上と下へどれだけ広がるかを求め、子の段の中心の位置を決める
  const offsets = new Map<Node, number[]>();
  const spans = new Map<Node, { above: number; below: number }>();
  const reach = (node: Node): { above: number; below: number } => {
    const list = node.children.map(reach);
    const own = node.height / 2;
    let span = { above: own, below: own };
    if (list.length > 0) {
      const rows: number[] = [0];
      for (let index = 1; index < list.length; index++) {
        rows.push(rows[index - 1]! + list[index - 1]!.below + TREE.gap + list[index]!.above);
      }
      offsets.set(node, rows);
      span = { above: Math.max(own, list[0]!.above), below: Math.max(own, rows.at(-1)! + list.at(-1)!.below) };
    }
    spans.set(node, span);
    return span;
  };
  reach(top);

  const nodes: TreeNode[] = [];
  const strokes: [Point, Point][] = [];
  // 節の段の中心
  const rowOf = new Map<Node, number>();
  const place = (node: Node, y: number) => {
    rowOf.set(node, y);
    const x = columns[node.level]!;
    if (node.label !== null) {
      nodes.push({ label: node.label, box: { x, y: y - node.height / 2, width: node.width, height: node.height } });
    }
    const list = offsets.get(node);
    if (!list) return;
    const spine = spines[node.level]!;
    const rows = list.map((offset) => y + offset);
    if (node.label !== null) strokes.push([{ x: x + node.width + TREE.pad, y }, { x: spine, y }]);
    if (rows.length > 1) strokes.push([{ x: spine, y: rows[0]! }, { x: spine, y: rows.at(-1)! }]);
    const left = columns[node.level + 1]! - TREE.pad;
    node.children.forEach((child, index) => {
      strokes.push([{ x: spine, y: rows[index]! }, { x: left, y: rows[index]! }]);
      place(child, rows[index]!);
    });
  };
  place(top, 0);

  const placedBraces = placeBraces(top, single ? braces : [], nodes, rowOf, spans);
  const boxes = [...nodes.map(({ box }) => box), ...placedBraces.map(({ x, top, bottom, width }) => ({ x, y: top, width, height: bottom - top }))];
  const minY = Math.min(...boxes.map(({ y }) => y));
  const maxY = Math.max(...boxes.map(({ y, height }) => y + height));
  const width = Math.max(...boxes.map(({ x, width }) => x + width), ...strokes.flat().map(({ x }) => x));
  // 上端を 0 にそろえる
  const down = <T extends { y: number }>(point: T): T => ({ ...point, y: point.y - minY });
  return {
    width,
    height: maxY - minY,
    nodes: nodes.map(({ label, box }) => ({ label, box: down(box) })),
    strokes: strokes.map(([a, b]) => [down(a), down(b)]),
    braces: placedBraces.map((brace) => ({ ...brace, top: brace.top - minY, bottom: brace.bottom - minY })),
  };
}

// 括弧を内側から置く。括弧は括った兄弟(子孫を含む)の段の上端から下端までに掛け、その段にあるもの
// (項目と、先に置いた内側の括弧とその文)のいちばん右に置く。括弧の文は nodes に足す。
// selfBraces は、根にした唯一の項目を括る括弧(上の段の括弧)
function placeBraces(
  top: Node,
  selfBraces: TreeBrace[],
  nodes: TreeNode[],
  rowOf: Map<Node, number>,
  spans: Map<Node, { above: number; below: number }>,
): TreeBraceShape[] {
  const extent = (node: Node) => {
    const y = rowOf.get(node)!;
    const span = spans.get(node)!;
    return { top: y - span.above, bottom: y + span.below };
  };
  type Pending = { top: number; bottom: number; level: number; order: number; label: string | null };
  const pending: Pending[] = [];
  const collect = (siblings: Node[], braces: TreeBrace[], level: number) => {
    for (const { first, last, label } of braces) {
      pending.push({ top: extent(siblings[first]!).top, bottom: extent(siblings[last]!).bottom, level, order: pending.length, label });
    }
  };
  collect([top], selfBraces, -1);
  const visit = (node: Node) => {
    collect(node.children, node.braces, node.level + 1);
    node.children.forEach(visit);
  };
  visit(top);
  // 内側が先: 段の範囲が狭いもの、深いもの、先に閉じたものの順
  pending.sort((a, b) => a.bottom - a.top - (b.bottom - b.top) || b.level - a.level || a.order - b.order);

  const placed: TreeBraceShape[] = [];
  const occupied: Box[] = nodes.map(({ box }) => box);
  const EPSILON = 1e-6;
  for (const { top: upper, bottom, label } of pending) {
    const beside = occupied.filter(({ y, height }) => y < bottom - EPSILON && y + height > upper + EPSILON);
    const x = Math.max(0, ...beside.map(({ x, width }) => x + width)) + TREE.brace.pad;
    const brace = { x, top: upper, bottom, width: TREE.brace.width };
    placed.push(brace);
    occupied.push({ x, y: upper, width: brace.width, height: bottom - upper });
    if (label !== null) {
      const size = measureText(label);
      const box = { x: x + brace.width + TREE.brace.pad, y: (upper + bottom) / 2 - size.height / 2, ...size };
      nodes.push({ label, box });
      occupied.push(box);
    }
  }
  return placed;
}
