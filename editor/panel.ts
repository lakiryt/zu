// 右の欄。選んでいる図形や線の中身を見せ、変えられるようにする
import { HEADS, JUSTIFICATIONS, LINE_STYLES, SCALES, SHAPES } from "../src/index.ts";
import type { CaptionStatement, Document, LineStatement, Scale, Shape, ShapeStatement, Size } from "../src/index.ts";
import { openAbout } from "./about.ts";
import { align, removeSelected, setPlacement } from "./actions.ts";
import { button, checkbox, choice, html, numberField } from "./dom.ts";
import * as edit from "./edit.ts";
import { HEAD_NAMES, JUSTIFY_NAMES, SCALE_NAMES, SHAPE_NAMES, STYLE_NAMES, describeBeside } from "./names.ts";
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

// 数で書いた大きさは、語の選択肢に加えてこれを出す(変えるのは「高度な設定」で)
const SIZE_NAMES: Record<Scale | "numbers", string> = { ...SCALE_NAMES, numbers: "数で指定(高度な設定)" };

function describePlacement(document: Document, statement: ShapeStatement) {
  const { placement } = statement;
  if (!placement) {
    const list = edit.shapes(document);
    const previous = list[list.indexOf(statement) - 1];
    return previous ? `直前の図形(${previous.id})の右` : "最初の図形(置き方なし)";
  }
  if (placement.kind === "at") return `座標 (${placement.x}, ${placement.y})`;
  return describeBeside(placement.of, placement.direction, placement.gap);
}

// 形を変えたとき、その形に書ける大きさに直す。text は書けず、cube は一辺だけ
function sizeFor(shape: Shape, size: Size | null): Size | null {
  if (shape === "text") return null;
  if (shape === "cube" && size?.kind === "numbers") return { ...size, height: null };
  return size;
}

const textArea = (value: string, rows: number, onChange: (value: string) => void, placeholder = "") => {
  const node = html("textarea", { rows: String(rows), placeholder }) as HTMLTextAreaElement;
  node.value = value;
  node.addEventListener("change", () => onChange(node.value));
  return node;
};

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
    else nothingSelected(document);
  }

  function nothingSelected(document: Document) {
    panel.append(
      html("p", { class: "muted" }, "図形を選ぶと、ここで編集できます。"),
      html("ul", { class: "help" }, ...HELP.map((line) => html("li", {}, line))),
      captionFields(document),
      button("Law図 について", openAbout, { class: "link" }),
    );
  }

  // 図の下の文(caption)。書いた順に並べ、それぞれ文、揃え、大きさを変えられる。既定(左詰め、中)は書かない
  function captionFields(document: Document) {
    const section = html("section", { class: "captions" }, html("h2", {}, "図の下の文"));
    edit.statementsOf(document, "caption").forEach((statement, index) => {
      const change = (next: CaptionStatement | null) =>
        editor.commit(edit.replaceNth(editor.text, document, "caption", index, next));
      section.append(
        html(
          "label",
          { class: "field" },
          `文 ${index + 1}`,
          textArea(statement.text, 3, (text) => change(text === "" ? null : { ...statement, text })),
        ),
        html(
          "div",
          { class: "pair" },
          choice("揃え", JUSTIFICATIONS, JUSTIFY_NAMES, statement.justify ?? "left", (justify) =>
            change({ ...statement, justify: justify === "left" ? null : justify }),
          ),
          choice("大きさ", SCALES, SCALE_NAMES, statement.size ?? "medium", (size) =>
            change({ ...statement, size: size === "medium" ? null : size }),
          ),
        ),
        html("div", { class: "row" }, button("この文を消す", () => change(null), { class: "small" })),
      );
    });
    section.append(
      html("div", { class: "row" }, button("文を足す", () => editor.commit(edit.addCaption(editor.text, "文")))),
    );
    return section;
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
    const statement = edit.statementsOf(document, "line")[index];
    if (!statement) return;
    const change = (next: LineStatement | null) =>
      editor.commit(
        edit.replaceNth(editor.text, document, "line", index, next),
        next === null ? NOTHING : editor.selection,
      );
    const { from, to } = statement;
    // 結ぶ図形だけを入れ替える。端の印と「中まで伸ばす」は端の位置に残るので、矢印の向きが逆になる
    const reverse = () => change({ ...statement, from: { ...from, id: to.id }, to: { ...to, id: from.id } });

    panel.append(
      html(
        "div",
        { class: "field" },
        html("span", {}, "結ぶ図形"),
        html("span", { class: "value" }, `${from.id} → ${to.id}`),
        button("向きを入れ替える", reverse, { class: "small" }),
      ),
      choice("線の種類", LINE_STYLES, STYLE_NAMES, statement.style, (style) => change({ ...statement, style })),
    );
    for (const side of ["from", "to"] as const) {
      const end = statement[side];
      panel.append(
        choice(`${end.id} の側の端`, HEADS, HEAD_NAMES, end.head, (head) =>
          change({ ...statement, [side]: { ...end, head } }),
        ),
        checkbox("図形の中まで伸ばす", end.into, (into) => change({ ...statement, [side]: { ...end, into } })),
      );
    }
    panel.append(
      html(
        "label",
        { class: "field" },
        "ラベル",
        textArea(statement.label ?? "", 2, (label) => change({ ...statement, label: label === "" ? null : label }), "なし"),
      ),
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

    panel.append(
      html("label", { class: "field" }, "名前", name),
      html(
        "label",
        { class: "field" },
        "ラベル",
        textArea(statement.label ?? statement.id, 2, (label) => change({ label: label === statement.id ? null : label })),
      ),
      choice("形", SHAPES, SHAPE_NAMES, statement.shape, (shape) => change({ shape, size: sizeFor(shape, statement.size) })),
    );
    // 大きさは語で選ぶ。中は既定なので書かない。数で書いた大きさは「高度な設定」で変える
    if (statement.shape !== "text") {
      const { size } = statement;
      const current = size === null ? "medium" : size.kind === "scale" ? size.scale : "numbers";
      const options = current === "numbers" ? (["numbers", ...SCALES] as const) : SCALES;
      panel.append(
        choice<Scale | "numbers">("大きさ", options, SIZE_NAMES, current, (scale) => {
          if (scale !== "numbers") change({ size: scale === "medium" ? null : { kind: "scale", scale } });
        }),
      );
    }

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

    for (const group of edit.statementsOf(document, "align")) {
      if (!group.members.some((member) => member.id === statement.id)) continue;
      panel.append(
        html(
          "div",
          { class: "field" },
          html("span", {}, group.axis === "row" ? "同じ段" : "同じ列"),
          html("span", { class: "value" }, group.members.map((member) => member.id).join("、")),
          button("外す", () => editor.commit(edit.leaveAlign(editor.text, document, group.axis, statement.id)), {
            class: "small",
          }),
        ),
      );
    }

    panel.append(
      advancedFields(statement, change),
      html("div", { class: "row" }, button("この図形を消す", () => removeSelected(editor), { class: "danger" })),
    );
  }

  // 数で指定する欄。普段は閉じておく
  function advancedFields(statement: ShapeStatement, change: (part: Partial<ShapeStatement>) => void) {
    const advanced = html("details", { class: "advanced" }) as HTMLDetailsElement;
    advanced.open = advancedOpen;
    advanced.addEventListener("toggle", () => (advancedOpen = advanced.open));
    advanced.append(html("summary", {}, "高度な設定(数で指定する)"));

    const { placement } = statement;
    if (placement?.kind === "beside") {
      advanced.append(
        numberField("間", placement.gap, "自動", (gap) => setPlacement(editor, statement, { ...placement, gap })),
      );
    }
    const at = placement?.kind === "at" ? placement : null;
    const setAt = (axis: "x" | "y") => (value: number | null) => {
      if (value === null) return;
      setPlacement(editor, statement, { kind: "at", x: at?.x ?? 0, y: at?.y ?? 0, [axis]: value });
    };
    advanced.append(
      html(
        "div",
        { class: "pair" },
        numberField("x", at?.x ?? null, "—", setAt("x")),
        numberField("y", at?.y ?? null, "—", setAt("y")),
      ),
    );

    if (statement.shape !== "text") {
      const numbers = statement.size?.kind === "numbers" ? statement.size : null;
      const setSize = (part: "width" | "height") => (value: number | null) => {
        const next = { width: numbers?.width ?? null, height: numbers?.height ?? null, [part]: value };
        const size: Size | null = next.width === null ? null : { kind: "numbers", width: next.width, height: next.height };
        change({ size });
      };
      advanced.append(
        html(
          "div",
          { class: "pair" },
          numberField(statement.shape === "cube" ? "一辺" : "幅", numbers?.width ?? null, "自動", setSize("width")),
          statement.shape === "parallelogram"
            ? numberField("高さ", numbers?.height ?? null, "自動", setSize("height"))
            : "",
        ),
      );
    }
    return advanced;
  }

  return { render };
}
