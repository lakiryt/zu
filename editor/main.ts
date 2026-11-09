// エディタの入口。画面の各欄を作り、Editor の変化をつなぐ。
// 正本は左の .zu の文字で、図やパネルの操作は文字を書き換えてから描き直す
import { setUpAbout } from "./about.ts";
import { removeSelected } from "./actions.ts";
import { createCanvas } from "./canvas.ts";
import { element } from "./dom.ts";
import * as edit from "./edit.ts";
import { createPanel } from "./panel.ts";
import { SAMPLES } from "./samples.ts";
import { Editor, NOTHING, linePick, samePick, shapePick } from "./state.ts";
import { createToolbar } from "./toolbar.ts";

// 作業中の文字は、このブラウザにだけ覚える。初めて開いたときは最初のサンプルを出す
const STORAGE_KEY = "zu-editor:source";
const STATUS_DURATION = 4000;

const source = element<HTMLTextAreaElement>("source");
const errorBox = element<HTMLDivElement>("error");
const status = element<HTMLDivElement>("status");
const fileInput = element<HTMLInputElement>("file");
const samples = element<HTMLSelectElement>("samples");
const stage = element<HTMLDivElement>("stage");
const main = document.querySelector("main")!;
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
const canvas = createCanvas(stage, editor);
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

// 幅の狭い画面の下の欄。"source" は文字、"panel" は設定、"none" はたたんで図を広げる。
// 広い画面ではタブを出さず、文字と設定を両方出す(この値は見た目に効かない)
type Pane = "source" | "panel" | "none";
const tabs = [...main.querySelectorAll<HTMLButtonElement>(".tabs button")];
function showPane(pane: Pane) {
  main.dataset.pane = pane;
  for (const tab of tabs) {
    if (tab.getAttribute("role") === "tab") tab.setAttribute("aria-selected", String(tab.dataset.pane === pane));
  }
}
for (const tab of tabs) tab.addEventListener("click", () => showPane(tab.dataset.pane as Pane));
showPane("source");

// 図の図形や線に触れて選んだら、下の欄を設定に替える。たたんであるときは開かない(図の大きさを変えない)。
// ドラッグの途中で替えないよう、指を離してから替える
let touched: { x: number; y: number } | null = null;
stage.addEventListener("pointerdown", (event) => (touched = { x: event.clientX, y: event.clientY }));
stage.addEventListener("pointerup", (event) => {
  const start = touched;
  touched = null;
  if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
  if (main.dataset.pane === "source" && editor.selection.length > 0) showPane("panel");
});

// 文字のカーソルがある行の図形か線を選ぶ
function selectFromCursor() {
  const { document } = editor;
  if (!document || editor.broken) return;
  const line = source.value.slice(0, source.selectionStart).split("\n").length;
  // 注釈の行なら、その図形を選ぶ
  const id = edit.shapeAtLine(document, line) ?? edit.annotationTargetAtLine(document, line);
  const index = edit.indexAtLine(document, "line", line);
  const pick = id !== null ? shapePick(id) : index !== null ? linePick(index) : null;
  if (!pick) return;
  const [only, ...rest] = editor.selection;
  if (!only || rest.length > 0 || !samePick(only, pick)) editor.select([pick]);
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
    if (editor.selection.length > 0) {
      event.preventDefault();
      removeSelected(editor);
    }
  } else if (event.key === "Escape") {
    editor.select(NOTHING);
  }
});

setUpAbout();
editor.reload();
