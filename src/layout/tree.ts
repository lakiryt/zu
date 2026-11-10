// 木(tree)の項目と線の置き場所を決める。親は最初の子と同じ段に書き、線で子へ枝分かれさせる
//
//   ┌1─┬─a
//   │   └─b─┬─i
//   │       └─ii
//   └─2
//
// 同じ深さの項目は同じ列に揃える。根のラベルがなく、上の段の項目が複数あれば、左の括弧でまとめる。
// 上の段が1つなら、その項目を根にする
import type { TreeItem } from "../syntax/ast.ts";
import type { Box, Point } from "./geometry.ts";
import { measureText } from "./measure.ts";

// 項目の字の外枠(box)と、線(端から端までの線分)。どちらも木の外枠の左上からの位置
export type TreeNode = { label: string; box: Box };
export type TreeShape = { width: number; height: number; nodes: TreeNode[]; strokes: [Point, Point][] };

// gap は上下に並ぶ項目(その子孫も含めた範囲)の間。pad は字と線の間、arm は枝分かれの縦線から横へ伸ばす長さ
export const TREE = { gap: 8, pad: 6, arm: 12 };

// 根のラベルがない括弧は、字を持たない節として扱う
type Node = { label: string | null; width: number; height: number; level: number; children: Node[] };

function build(label: string | null, items: TreeItem[], level: number): Node {
  const size = label === null ? { width: 0, height: 0 } : measureText(label);
  return { label, ...size, level, children: items.map((item) => build(item.label, item.children, level + 1)) };
}

// root が null なら、上の段の項目を括弧でまとめる(1つだけなら、それを根にする)
export function layoutTree(root: string | null, items: TreeItem[]): TreeShape {
  const top = root === null && items.length === 1 ? build(items[0]!.label, items[0]!.children, 0) : build(root, items, 0);
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
  const reach = (node: Node): { above: number; below: number } => {
    const spans = node.children.map(reach);
    const own = node.height / 2;
    if (spans.length === 0) return { above: own, below: own };
    const list: number[] = [0];
    for (let index = 1; index < spans.length; index++) {
      list.push(list[index - 1]! + spans[index - 1]!.below + TREE.gap + spans[index]!.above);
    }
    offsets.set(node, list);
    return { above: Math.max(own, spans[0]!.above), below: Math.max(own, list.at(-1)! + spans.at(-1)!.below) };
  };
  const { above, below } = reach(top);

  const nodes: TreeNode[] = [];
  const strokes: [Point, Point][] = [];
  const place = (node: Node, y: number) => {
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
  place(top, above);

  const width = Math.max(...nodes.map(({ box }) => box.x + box.width), ...strokes.flat().map(({ x }) => x));
  return { width, height: above + below, nodes, strokes };
}
