// 上の道具の並び
import { SHAPES, ZuError, layout, parse, toSvg } from "../src/index.ts";
import { addShape, align, connect } from "./actions.ts";
import { button, download, enabledIf, html } from "./dom.ts";
import { SHAPE_NAMES } from "./names.ts";
import type { Editor } from "./state.ts";

export function createToolbar(toolbar: HTMLElement, editor: Editor, openFile: () => void) {
  function saveSvg() {
    try {
      download(editor.fileName.replace(/\.zu$/, "") + ".svg", toSvg(layout(parse(editor.text))), "image/svg+xml");
    } catch (error) {
      if (!(error instanceof ZuError)) throw error;
      editor.say(error.message);
    }
  }

  function render() {
    const usable = !editor.broken;
    const count = editor.selectedShapes.length;
    const picked = editor.selection.length;
    toolbar.replaceChildren(
      html(
        "div",
        { class: "group" },
        ...SHAPES.map((shape) => button(`+ ${SHAPE_NAMES[shape]}`, () => addShape(editor, shape), enabledIf(usable))),
      ),
      html(
        "div",
        { class: "group" },
        // Shift の代わり。押している間は、触れた図形や線を選んでいるものに足していく
        button("まとめて選ぶ", () => editor.setAdding(!editor.adding), {
          class: "touch-only",
          "aria-pressed": String(editor.adding),
          title: "触れた図形や線を、選んでいるものに足していく",
        }),
        button("段を揃える", () => align(editor, "row"), enabledIf(usable && count >= 2, "選んだ図形を同じ高さに")),
        button("列を揃える", () => align(editor, "column"), enabledIf(usable && count >= 2, "選んだ図形を同じ左右の位置に")),
        button(
          "線でつなぐ",
          () => connect(editor),
          enabledIf(usable && picked === 2, "先に選んだものから後に選んだものへ(図形でも線でも)"),
        ),
      ),
      html(
        "div",
        { class: "group" },
        button("元に戻す", () => editor.undo(), enabledIf(editor.history.canUndo)),
        button("やり直す", () => editor.redo(), enabledIf(editor.history.canRedo)),
      ),
      html(
        "div",
        { class: "group" },
        button("開く", openFile),
        button(".zu を保存", () => download(editor.fileName, editor.text, "text/plain")),
        button("SVG を保存", saveSvg),
      ),
    );
  }

  return { render };
}
