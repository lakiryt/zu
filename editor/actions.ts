// ツールバー、パネル、キーボードから使う操作。どれも文字を書き換えて Editor に渡す
import type { Axis, Placement, Shape, ShapeStatement } from "../src/index.ts";
import * as edit from "./edit.ts";
import { relocate, removeShape } from "./relocate.ts";
import type { Move } from "./relocate.ts";
import { NOTHING, linePick, shapePick } from "./state.ts";
import type { Editor } from "./state.ts";

export function addShape(editor: Editor, shape: Shape) {
  const { document } = editor;
  if (!document) return;
  const id = edit.freshId(document);
  const statement: ShapeStatement = {
    kind: "shape",
    shape,
    id,
    label: null,
    placement: null,
    size: null,
    // 木は項目がないと書けないので、二つ置いておく
    ...(shape === "tree" ? { items: ["項目1", "項目2"].map((label) => ({ label, children: [], at: edit.NOWHERE })) } : {}),
    at: edit.NOWHERE,
    end: edit.NOWHERE,
  };
  editor.commit(edit.append(editor.text, statement), [shapePick(id)]);
}

// 先に選んだものから、後に選んだものへ線を引き、その線を選ぶ。図形でも線でもよい
export function connect(editor: Editor) {
  const [from, to, ...rest] = editor.selection;
  if (!from || !to || rest.length > 0) return;
  link(editor, from, to);
}

// 図形 from から、選んでいる線へ矢印を引き、引いた線を選ぶ
export function pointAtLine(editor: Editor, from: string) {
  const index = editor.selectedLine;
  if (index !== null) link(editor, shapePick(from), linePick(index));
}

function link(editor: Editor, from: edit.Pick, to: edit.Pick) {
  const { document } = editor;
  if (!document) return;
  const index = edit.statementsOf(document, "line").length;
  editor.attempt(() => edit.connect(editor.text, document, from, to), [linePick(index)]);
}

export function align(editor: Editor, axis: Axis) {
  const { document } = editor;
  if (!document || editor.selectedShapes.length < 2) return;
  editor.commit(edit.addAlign(editor.text, document, axis, editor.selectedShapes));
}

// 選んでいる線と図形を消す。線を先に消す(図形を消すと線の番号がずれるので)。図形を消してもほかの図形は動かない
export function removeSelected(editor: Editor) {
  const { document } = editor;
  if (!document || editor.selection.length === 0) return;
  const lines = editor.selectedLines;
  const shapes = editor.selectedShapes;
  editor.attempt(
    () => shapes.reduce((text, id) => removeShape(text, id), edit.removeLines(editor.text, document, lines)),
    NOTHING,
  );
}

// 図形を動かす。moved 以外の図形はその場に残す
export function move(editor: Editor, request: Move) {
  editor.attempt(() => relocate(editor.text, request));
}

// 一つの図形の置き方を変える(パネルから)。ほかの図形はその場に残す
export function setPlacement(editor: Editor, statement: ShapeStatement, placement: Placement | null) {
  move(editor, { moved: new Set([statement.id]), delta: null, primary: statement.id, placement });
}
