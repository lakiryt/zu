// ツールバー、パネル、キーボードから使う操作。どれも文字を書き換えて Editor に渡す
import type { Axis, Placement, Shape, ShapeStatement } from "../src/index.ts";
import * as edit from "./edit.ts";
import { relocate, removeShape } from "./relocate.ts";
import type { Move } from "./relocate.ts";
import { NOTHING } from "./state.ts";
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
    at: edit.NOWHERE,
    end: edit.NOWHERE,
  };
  editor.commit(edit.append(editor.text, statement), { kind: "shapes", ids: [id] });
}

// 先に選んだ図形から、後に選んだ図形へ線を引き、その線を選ぶ
export function connect(editor: Editor) {
  const { document } = editor;
  const [from, to, ...rest] = editor.selectedShapes;
  if (!document || !from || !to || rest.length > 0) return;
  const index = edit.statementsOf(document, "line").length;
  editor.commit(edit.addLine(editor.text, from, to), { kind: "line", index });
}

export function align(editor: Editor, axis: Axis) {
  const { document } = editor;
  if (!document || editor.selectedShapes.length < 2) return;
  editor.commit(edit.addAlign(editor.text, document, axis, editor.selectedShapes));
}

// 選んでいる線か図形を消す。図形を消してもほかの図形は動かない
export function removeSelected(editor: Editor) {
  const { document, selection } = editor;
  if (!document) return;
  if (selection.kind === "line") {
    editor.commit(edit.replaceNth(editor.text, document, "line", selection.index, null), NOTHING);
  } else if (selection.kind === "shapes") {
    editor.attempt(() => selection.ids.reduce((text, id) => removeShape(text, id), editor.text), NOTHING);
  }
}

// 図形を動かす。moved 以外の図形はその場に残す
export function move(editor: Editor, request: Move) {
  editor.attempt(() => relocate(editor.text, request));
}

// 一つの図形の置き方を変える(パネルから)。ほかの図形はその場に残す
export function setPlacement(editor: Editor, statement: ShapeStatement, placement: Placement | null) {
  move(editor, { moved: new Set([statement.id]), delta: null, primary: statement.id, placement });
}
