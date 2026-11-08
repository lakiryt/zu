// エディタの入口。画面の各欄を作り、Editor の変化をつなぐ。
// 正本は左の .zu の文字で、図やパネルの操作は文字を書き換えてから描き直す
import { setUpAbout } from "./about.ts";
import { removeSelected } from "./actions.ts";
import { createCanvas } from "./canvas.ts";
import { element } from "./dom.ts";
import * as edit from "./edit.ts";
import { createPanel } from "./panel.ts";
import { SAMPLES } from "./samples.ts";
import { Editor, NOTHING } from "./state.ts";
import { createToolbar } from "./toolbar.ts";

// 作業中の文字は、このブラウザにだけ覚える。初めて開いたときは最初のサンプルを出す
const STORAGE_KEY = "zu-editor:source";
const STATUS_DURATION = 4000;

const source = element<HTMLTextAreaElement>("source");
const errorBox = element<HTMLDivElement>("error");
const status = element<HTMLDivElement>("status");
const fileInput = element<HTMLInputElement>("file");
const samples = element<HTMLSelectElement>("samples");
const SAMPLE = SAMPLES[0]!.source;

function load() {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? SAMPLE;
  } catch {
    return SAMPLE;
  }
}

function store(text: string) {
  try {
    localStorage.setItem(STORAGE_KEY, text);
  } catch {
    // 保存できない環境(プライベートウィンドウなど)では覚えないだけ
  }
}

let statusTimer: ReturnType<typeof setTimeout> | undefined;
function say(message: string) {
  status.textContent = message;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (status.textContent = ""), STATUS_DURATION);
}

const editor = new Editor(load(), say);
const canvas = createCanvas(element("stage"), editor);
const panel = createPanel(element("panel"), editor);
const toolbar = createToolbar(element("toolbar"), editor, () => fileInput.click());

editor.listen((change) => {
  if (change === "text") {
    // 打っている最中に書き戻すとカーソルが飛ぶので、違うときだけ書き戻す
    if (source.value !== editor.text) source.value = editor.text;
    errorBox.textContent = editor.error;
    canvas.draw();
    store(editor.text);
  } else {
    canvas.drawSelection();
  }
  panel.render();
  toolbar.render();
});

source.addEventListener("input", () => editor.type(source.value));

// 文字のカーソルがある行の図形か線を選ぶ
function selectFromCursor() {
  const { document } = editor;
  if (!document || editor.broken) return;
  const line = source.value.slice(0, source.selectionStart).split("\n").length;
  const id = edit.shapeAtLine(document, line);
  const index = edit.indexAtLine(document, "line", line);
  const { selection } = editor;
  if (id !== null) {
    if (selection.kind !== "shapes" || selection.ids.length !== 1 || selection.ids[0] !== id) {
      editor.select({ kind: "shapes", ids: [id] });
    }
  } else if (index !== null) {
    if (selection.kind !== "line" || selection.index !== index) editor.select({ kind: "line", index });
  }
}
source.addEventListener("click", selectFromCursor);
source.addEventListener("keyup", selectFromCursor);

// サンプルを選ぶと、文字を置き換える。置き換えは履歴に残るので、元に戻せる
samples.append(new Option("選んで開く", ""), ...SAMPLES.map(({ name }, index) => new Option(name, String(index))));
samples.addEventListener("change", () => {
  const sample = SAMPLES[Number(samples.value)];
  samples.value = "";
  if (!sample) return;
  editor.fileName = sample.file;
  editor.replaceAll(sample.source);
  say(`サンプル「${sample.name}」を開きました。元の文字には Ctrl+Z で戻せます`);
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  editor.fileName = file.name;
  editor.replaceAll((await file.text()).replace(/\r\n?/g, "\n"));
  fileInput.value = "";
});

document.addEventListener("keydown", (event) => {
  if ((event.target as HTMLElement).closest("textarea, input, select")) return;
  // 「Law図 について」を開いている間は、裏の図を操作しない(Esc は窓を閉じるだけにする)
  if (document.querySelector("dialog[open]")) return;
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (mod && key === "z") {
    event.preventDefault();
    if (event.shiftKey) editor.redo();
    else editor.undo();
  } else if (mod && key === "y") {
    event.preventDefault();
    editor.redo();
  } else if (event.key === "Delete" || event.key === "Backspace") {
    if (editor.selection.kind !== "none") {
      event.preventDefault();
      removeSelected(editor);
    }
  } else if (event.key === "Escape") {
    editor.select(NOTHING);
  }
});

setUpAbout();
editor.reload();
