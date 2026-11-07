// 右の欄。選んでいる図形や線の中身を見せ、変えられるようにする
import { HEADS, LINE_STYLES, SHAPES } from "../src/index.ts";
import type { Document, LineStatement, Shape, ShapeStatement } from "../src/index.ts";
import { openAbout } from "./about.ts";
import { align, removeSelected, setPlacement } from "./actions.ts";
import { button, choice, html, numberField } from "./dom.ts";
import * as edit from "./edit.ts";
import { DIRECTION_NAMES, HEAD_NAMES, SHAPE_NAMES, STYLE_NAMES } from "./names.ts";
import { NOTHING } from "./state.ts";
import type { Editor } from "./state.ts";

// 図形の名前に使える語(SPEC の「語」)
const WORD = /^[\p{L}_][\p{L}\p{N}_-]*$/u;

const HELP = [
  "ドラッグ: ほかの図形の上下左右に寄せて置く(ほかの図形は動かない)",
  "Shift+クリック: いくつも選ぶ。まとめてドラッグすると、互いの位置を保って動く",
  "Alt+ドラッグ: 数で置く(間や座標)",
  "2つ選んで「線でつなぐ」: 線を引く。線をクリックすると種類や矢印を変えられる",
];

function describePlacement(document: Document, statement: ShapeStatement) {
  const { placement } = statement;
  if (!placement) {
    const list = edit.shapes(document);
    const index = list.indexOf(statement);
    return index === 0 ? "最初の図形(置き方なし)" : `直前の図形(${list[index - 1]!.id})の右`;
  }
  if (placement.kind === "at") return `座標 (${placement.x}, ${placement.y})`;
  const gap = placement.gap === null ? "" : `、間 ${placement.gap}`;
  return `${placement.of} の${DIRECTION_NAMES[placement.direction]}${gap}`;
}

export function createPanel(panel: HTMLElement, editor: Editor) {
  // 「高度な設定」を開いたかどうかは、選び直しても覚えておく
  let advancedOpen = false;

  function render() {
    panel.replaceChildren();
    const { document, selection } = editor;
    if (editor.broken) {
      panel.append(html("p", { class: "muted" }, "文字の誤りを直すと、図で編集できます。"));
      return;
    }
    if (!document) return;
    if (selection.kind === "line") lineFields(document, selection.index);
    else if (selection.kind === "shapes" && selection.ids.length > 1) severalShapes(selection.ids);
    else if (selection.kind === "shapes") shapeFields(document, selection.ids[0]!);
    else nothingSelected();
  }

  function nothingSelected() {
    panel.append(
      html("p", { class: "muted" }, "図形を選ぶと、ここで編集できます。"),
      html("ul", { class: "help" }, ...HELP.map((line) => html("li", {}, line))),
      button("Law図 について", openAbout, { class: "link" }),
    );
  }

  function severalShapes(ids: string[]) {
    panel.append(
      html("p", {}, `${ids.length} 個を選んでいます: ${ids.join("、")}`),
      html(
        "div",
        { class: "row" },
        button("段を揃える", () => align(editor, "row")),
        button("列を揃える", () => align(editor, "column")),
      ),
    );
  }

  function lineFields(document: Document, index: number) {
    const statement = edit.lines(document)[index];
    if (!statement) return;
    const change = (next: LineStatement | null) =>
      editor.commit(edit.replaceLine(editor.text, document, index, next), next === null ? NOTHING : editor.selection);
    const { arrow } = statement;
    const label = html("textarea", { rows: "2", placeholder: "なし" }) as HTMLTextAreaElement;
    label.value = statement.label ?? "";
    label.addEventListener("change", () => change({ ...statement, label: label.value === "" ? null : label.value }));
    const reverse = () =>
      change({ ...statement, from: statement.to, to: statement.from, arrow: { ...arrow, start: arrow.end, end: arrow.start } });

    panel.append(
      html(
        "div",
        { class: "field" },
        html("span", {}, "結ぶ図形"),
        html("span", { class: "value" }, `${statement.from.id} → ${statement.to.id}`),
        button("向きを入れ替える", reverse, { class: "small" }),
      ),
      choice("線の種類", LINE_STYLES, STYLE_NAMES, arrow.style, (style) => change({ ...statement, arrow: { ...arrow, style } })),
      choice(`${statement.from.id} の側の端`, HEADS, HEAD_NAMES, arrow.start, (start) =>
        change({ ...statement, arrow: { ...arrow, start } }),
      ),
      choice(`${statement.to.id} の側の端`, HEADS, HEAD_NAMES, arrow.end, (end) =>
        change({ ...statement, arrow: { ...arrow, end } }),
      ),
      html("label", { class: "field" }, "ラベル", label),
      html("div", { class: "row" }, button("この線を消す", () => change(null), { class: "danger" })),
    );
  }

  function shapeFields(document: Document, id: string) {
    const statement = edit.findShape(document, id);
    if (!statement) return;
    const change = (part: Partial<ShapeStatement>) =>
      editor.commit(edit.replaceShape(editor.text, document, { ...statement, ...part }));

    const name = html("input", { value: statement.id }) as HTMLInputElement;
    name.addEventListener("change", () => {
      const next = name.value.trim();
      if (next === statement.id) return;
      if (!WORD.test(next)) return editor.say("名前には文字、数字、_、- が使えます(先頭は文字か _)");
      if (edit.findShape(document, next)) return editor.say(`「${next}」という名前の図形がすでにあります`);
      editor.commit(edit.rename(editor.text, document, statement.id, next), { kind: "shapes", ids: [next] });
    });

    const label = html("textarea", { rows: "2" }) as HTMLTextAreaElement;
    label.value = statement.label ?? statement.id;
    label.addEventListener("change", () => change({ label: label.value === statement.id ? null : label.value }));

    panel.append(
      html("label", { class: "field" }, "名前", name),
      html("label", { class: "field" }, "ラベル", label),
      choice("形", SHAPES, SHAPE_NAMES, statement.shape, (shape: Shape) => change({ shape })),
    );

    const placementRow = html(
      "div",
      { class: "field" },
      html("span", {}, "置き方"),
      html("span", { class: "value" }, describePlacement(document, statement)),
    );
    if (statement.placement) {
      placementRow.append(button("外す", () => setPlacement(editor, statement, null), { class: "small" }));
    }
    panel.append(placementRow);

    for (const group of document.statements) {
      if (group.kind !== "align" || !group.members.some((member) => member.id === statement.id)) continue;
      panel.append(
        html(
          "div",
          { class: "field" },
          html("span", {}, group.axis === "row" ? "同じ段" : "同じ列"),
          html("span", { class: "value" }, group.members.map((member) => member.id).join("、")),
          button(
            "外す",
            () => editor.commit(edit.leaveAlign(editor.text, document, group.axis, statement.id)),
            { class: "small" },
          ),
        ),
      );
    }

    panel.append(advancedFields(statement, change));
    panel.append(html("div", { class: "row" }, button("この図形を消す", () => removeSelected(editor), { class: "danger" })));
  }

  // 数で指定する欄。普段は閉じておく
  function advancedFields(statement: ShapeStatement, change: (part: Partial<ShapeStatement>) => void) {
    const advanced = html("details", { class: "advanced" }) as HTMLDetailsElement;
    advanced.open = advancedOpen;
    advanced.addEventListener("toggle", () => (advancedOpen = advanced.open));
    advanced.append(html("summary", {}, "高度な設定(数で指定する)"));

    const { placement, size } = statement;
    if (placement?.kind === "beside") {
      advanced.append(
        numberField("間", placement.gap, "自動", (gap) => setPlacement(editor, statement, { ...placement, gap })),
      );
    }
    const at = placement?.kind === "at" ? placement : null;
    const setAt = (axis: "x" | "y") => (value: number | null) => {
      if (value === null) return;
      const x = axis === "x" ? value : (at?.x ?? 0);
      const y = axis === "y" ? value : (at?.y ?? 0);
      setPlacement(editor, statement, { kind: "at", x, y });
    };
    advanced.append(
      html("div", { class: "pair" }, numberField("x", at?.x ?? null, "—", setAt("x")), numberField("y", at?.y ?? null, "—", setAt("y"))),
    );

    if (statement.shape !== "text") {
      const setSize = (part: "width" | "height") => (value: number | null) => {
        const width = part === "width" ? value : (size?.width ?? null);
        const height = part === "height" ? value : (size?.height ?? null);
        change({ size: width === null ? null : { width, height } });
      };
      advanced.append(
        html(
          "div",
          { class: "pair" },
          numberField(statement.shape === "cube" ? "一辺" : "幅", size?.width ?? null, "自動", setSize("width")),
          statement.shape === "parallelogram" ? numberField("高さ", size?.height ?? null, "60", setSize("height")) : "",
        ),
      );
    }
    return advanced;
  }

  return { render };
}
