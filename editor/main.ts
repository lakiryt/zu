// エディタの画面。正本は左の .zu の文字で、図の操作は文字を書き換えてから描き直す
import { ZuError, layout, parse, toSvg } from "../src/index.ts";
import { defaultGap } from "../src/layout/layout.ts";
import type { PlacedShape, Point, Scene } from "../src/layout/layout.ts";
import { HEADS, LINE_STYLES, SHAPES } from "../src/syntax/ast.ts";
import type { Direction, Document, Head, LineStatement, LineStyle, Placement, Shape, ShapeStatement } from "../src/syntax/ast.ts";
import * as edit from "./edit.ts";
import { relocate, removeShape } from "./relocate.ts";
import type { Move } from "./relocate.ts";
import { nearest, slide, slots } from "./snap.ts";
import type { Slot } from "./snap.ts";
import SAMPLE from "../examples/agency.zu?raw";

// 初めて開いたときの例。examples/agency.zu をそのまま使う

const STORAGE_KEY = "zu-editor:source";
// 図の周りに取る、ドラッグ用の余白
const MARGIN = 120;
const SNAP_RADIUS = 56;
const SVG_NS = "http://www.w3.org/2000/svg";

const DIRECTION_NAMES: Record<Direction, string> = { left: "左", right: "右", above: "上", below: "下" };
const SHAPE_NAMES: Record<Shape, string> = { text: "文字", parallelogram: "平行四辺形", cube: "立方体" };
const WORD = /^[\p{L}_][\p{L}\p{N}_-]*$/u;

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const source = element<HTMLTextAreaElement>("source");
const stage = element<HTMLDivElement>("stage");
const errorBox = element<HTMLDivElement>("error");
const panel = element<HTMLDivElement>("panel");
const status = element<HTMLDivElement>("status");
const fileInput = element<HTMLInputElement>("file");

let text = load();
let parsed: Document | null = null;
let scene: Scene | null = null;
let broken = false;
let selected: string[] = [];
// 選んでいる線(書いた順の番号)。図形と線は同時には選ばない
let selectedLine: number | null = null;
let fileName = "diagram.zu";
let advancedOpen = false;
const history = { past: [] as string[], future: [] as string[] };
let typing: number | null = null;

function load() {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? SAMPLE;
  } catch {
    return SAMPLE;
  }
}

function store() {
  try {
    localStorage.setItem(STORAGE_KEY, text);
  } catch {
    // 保存できない環境(プライベートウィンドウなど)では覚えないだけ
  }
}

let statusTimer: number | undefined;
function say(message: string) {
  status.textContent = message;
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => (status.textContent = ""), 4000);
}

// --- 文字の更新と履歴 ---

// 図やパネルからの書き換え。誤りになる書き換えは取り消して理由を出す
function commit(next: string) {
  // 書き換えがなくても描き直す。ドラッグで少しずらした見た目と点線を消すため
  if (next === text) {
    draw();
    return;
  }
  try {
    layout(parse(next));
  } catch (error) {
    if (!(error instanceof ZuError)) throw error;
    say(`できませんでした: ${error.reason}`);
    draw();
    return;
  }
  history.past.push(text);
  history.future = [];
  text = next;
  source.value = text;
  update();
}

// 開いたファイルなど、誤りがあってもそのまま入れるもの
function replaceAll(next: string) {
  history.past.push(text);
  history.future = [];
  text = next;
  source.value = text;
  update();
}

function undo() {
  const previous = history.past.pop();
  if (previous === undefined) return;
  history.future.push(text);
  text = previous;
  source.value = text;
  update();
}

function redo() {
  const next = history.future.pop();
  if (next === undefined) return;
  history.past.push(text);
  text = next;
  source.value = text;
  update();
}

source.addEventListener("input", () => {
  // 打ち始めの文字を履歴に残す。続けて打つあいだは一つにまとめる
  if (typing === null) {
    history.past.push(text);
    history.future = [];
  }
  window.clearTimeout(typing ?? undefined);
  typing = window.setTimeout(() => (typing = null), 800);
  text = source.value;
  update();
});

// 文字のカーソルがある行の図形か線を選ぶ
function selectFromCursor() {
  if (!parsed || broken) return;
  const line = source.value.slice(0, source.selectionStart).split("\n").length;
  const id = edit.shapeAtLine(parsed, line);
  const lineIndex = edit.lineAtLine(parsed, line);
  if (id && !(selected.length === 1 && selected[0] === id)) {
    selected = [id];
    selectedLine = null;
  } else if (lineIndex !== null && selectedLine !== lineIndex) {
    selected = [];
    selectedLine = lineIndex;
  } else {
    return;
  }
  drawSelection();
  renderPanel();
  renderToolbar();
}
source.addEventListener("click", selectFromCursor);
source.addEventListener("keyup", selectFromCursor);

function update() {
  try {
    parsed = parse(text);
    scene = layout(parsed);
    broken = false;
    errorBox.textContent = "";
  } catch (error) {
    if (!(error instanceof ZuError)) throw error;
    broken = true;
    errorBox.textContent = error.message;
  }
  stage.classList.toggle("stale", broken);
  if (scene) selected = selected.filter((id) => scene!.shapes.some((shape) => shape.id === id));
  if (scene && selectedLine !== null && selectedLine >= scene.lines.length) selectedLine = null;
  draw();
  renderPanel();
  renderToolbar();
  store();
}

// --- 図 ---

const svgElement = <K extends keyof SVGElementTagNameMap>(name: K, attributes: Record<string, string | number>) => {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
};

function svg() {
  return stage.querySelector("svg");
}

function draw() {
  if (!scene || !parsed) {
    stage.innerHTML = "";
    return;
  }
  stage.innerHTML = toSvg(scene);
  const root = svg()!;
  const width = scene.width + MARGIN * 2;
  const height = scene.height + MARGIN * 2;
  root.setAttribute("viewBox", `${-MARGIN} ${-MARGIN} ${width} ${height}`);
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  const background = root.querySelector("rect");
  background?.setAttribute("x", String(-MARGIN));
  background?.setAttribute("y", String(-MARGIN));

  // 図の範囲(書き出す SVG の大きさ)を薄く示す
  root.insertBefore(
    svgElement("rect", { class: "extent", x: 0, y: 0, width: scene.width, height: scene.height }),
    background?.nextSibling ?? null,
  );

  for (const shape of scene.shapes) {
    const group = root.querySelector(`g[data-id="${CSS.escape(shape.id)}"]`);
    if (!group) continue;
    group.classList.add("shape");
    const { x, y, width: w, height: h } = shape.box;
    group.insertBefore(svgElement("rect", { class: "hit", x: x - 4, y: y - 4, width: w + 8, height: h + 8, rx: 4 }), group.firstChild);
    const statement = edit.findShape(parsed, shape.id);
    if (statement && edit.usesNumbers(statement)) {
      const mark = svgElement("circle", { class: "numeric", cx: x + w + 4, cy: y - 4, r: 4 });
      mark.appendChild(svgElement("title", {})).textContent = "数で指定しています";
      group.appendChild(mark);
    }
  }
  // 線は細いので、つかみやすいよう太い透明の線を重ねる
  scene.lines.forEach((line, index) => {
    const group = root.querySelector(`g[data-line="${index}"]`);
    if (!group) return;
    group.classList.add("line");
    group.insertBefore(
      svgElement("line", { class: "hit", x1: line.start.x, y1: line.start.y, x2: line.end.x, y2: line.end.y }),
      group.firstChild,
    );
  });
  root.appendChild(svgElement("g", { id: "overlay" }));
  drawSelection();
}

function drawSelection() {
  const root = svg();
  if (!root) return;
  for (const group of root.querySelectorAll("g.shape")) {
    group.classList.toggle("selected", selected.includes(group.getAttribute("data-id") ?? ""));
  }
  for (const group of root.querySelectorAll("g.line")) {
    group.classList.toggle("selected", group.getAttribute("data-line") === String(selectedLine));
  }
}

function refreshSelection() {
  drawSelection();
  renderPanel();
  renderToolbar();
}

function pointIn(root: SVGSVGElement, event: PointerEvent): Point {
  const matrix = root.getScreenCTM()!.inverse();
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
  return { x: point.x, y: point.y };
}

// ドラッグの行き先。slot は関係で置く、at は座標で置く(Alt)
type Target = { kind: "slot"; slot: Slot } | { kind: "at"; anchor: Point; written: Point } | null;

type Drag = {
  shape: PlacedShape;
  start: Point;
  moved: boolean;
  // 一緒に動かす図形(複数選んでいればその全部)。ほかの図形は動かない
  moving: Set<string>;
  slots: Slot[];
  target: Target;
  // 選んである図形を Shift なしで押した。動かさずに離したら、それだけを選び直す
  narrow: boolean;
};
let drag: Drag | null = null;

stage.addEventListener("pointerdown", (event) => {
  const root = svg();
  if (!root || !scene || !parsed || broken || event.button !== 0) return;
  const lineGroup = (event.target as Element).closest("g.line");
  if (lineGroup) {
    selected = [];
    selectedLine = Number(lineGroup.getAttribute("data-line"));
    refreshSelection();
    return;
  }
  const group = (event.target as Element).closest("g.shape");
  if (!group) {
    selected = [];
    selectedLine = null;
    refreshSelection();
    return;
  }
  selectedLine = null;
  const id = group.getAttribute("data-id")!;
  const narrow = !event.shiftKey && selected.includes(id) && selected.length > 1;
  if (event.shiftKey) selected = selected.includes(id) ? selected.filter((other) => other !== id) : [...selected, id];
  else if (!selected.includes(id)) selected = [id];
  drawSelection();
  renderPanel();
  renderToolbar();

  const shape = scene.shapes.find((other) => other.id === id)!;
  const moving = new Set(selected.includes(id) && selected.length > 1 ? selected : [id]);
  drag = {
    shape,
    start: pointIn(root, event),
    moved: false,
    moving,
    slots: slots(scene.shapes, shape, moving, (of, direction) => defaultGap(parsed!, id, of, direction)),
    target: null,
    narrow,
  };
  root.setPointerCapture(event.pointerId);
  event.preventDefault();
});

stage.addEventListener("pointermove", (event) => {
  const root = svg();
  if (!drag || !root || !scene || !parsed) return;
  const point = pointIn(root, event);
  const dx = point.x - drag.start.x;
  const dy = point.y - drag.start.y;
  if (!drag.moved && Math.hypot(dx, dy) < 3) return;
  if (!drag.moved) {
    // 動かす図形に結んだ線は、放すまで薄くする(放すと引き直す)
    scene.lines.forEach((line, index) => {
      if (drag!.moving.has(line.from) || drag!.moving.has(line.to)) {
        root.querySelector(`g[data-line="${index}"]`)?.classList.add("detached");
      }
    });
  }
  drag.moved = true;

  for (const id of drag.moving) {
    root.querySelector(`g[data-id="${CSS.escape(id)}"]`)?.setAttribute("transform", `translate(${dx} ${dy})`);
  }
  const anchor = { x: drag.shape.anchor.x + dx, y: drag.shape.anchor.y + dy };
  drag.target = aim(drag, anchor, event.altKey);
  drawGhost(root, drag);
});

stage.addEventListener("pointerup", () => {
  const current = drag;
  drag = null;
  if (!current) return;
  if (!current.moved) {
    if (current.narrow) {
      selected = [current.shape.id];
      drawSelection();
      renderPanel();
      renderToolbar();
    }
    return;
  }
  if (!current.target) {
    say("ほかの図形の上下左右に寄せると置けます(Alt を押しながらだと数で置けます)");
    draw();
    return;
  }
  place(current, current.target);
});

function aim(current: Drag, anchor: Point, free: boolean): Target {
  if (!scene || !parsed) return null;
  if (!free) {
    const slot = nearest(current.slots, anchor, SNAP_RADIUS);
    return slot ? { kind: "slot", slot } : null;
  }
  // Alt: 関係で置いている図形はその線の上だけを動かして間を変え、そうでなければ座標で置く
  const statement = edit.findShape(parsed, current.shape.id);
  if (statement?.placement?.kind === "beside") {
    const base = scene.shapes.find((shape) => shape.id === (statement.placement as { of: string }).of);
    if (base) return { kind: "slot", slot: slide(current.shape, base, statement.placement.direction, anchor) };
  }
  const written = {
    x: Math.round(anchor.x - scene.origin.x),
    y: Math.round(anchor.y - scene.origin.y),
  };
  return { kind: "at", written, anchor: { x: written.x + scene.origin.x, y: written.y + scene.origin.y } };
}

function describeTarget(target: NonNullable<Target>) {
  if (target.kind === "at") return `座標 (${target.written.x}, ${target.written.y})`;
  const { of, direction, gap } = target.slot;
  return `${of} の${DIRECTION_NAMES[direction]}${gap === null ? "" : `(間 ${gap})`}`;
}

function drawGhost(root: SVGSVGElement, current: Drag) {
  const overlay = root.querySelector("#overlay")!;
  overlay.replaceChildren();
  const { target, shape } = current;
  if (!target) return;
  const anchor = target.kind === "slot" ? target.slot.anchor : target.anchor;
  const x = shape.box.x - shape.anchor.x + anchor.x;
  const y = shape.box.y - shape.anchor.y + anchor.y;
  overlay.appendChild(
    svgElement("rect", { class: "ghost", x, y, width: shape.box.width, height: shape.box.height, rx: 4 }),
  );
  if (target.kind === "slot") {
    const base = scene?.shapes.find((other) => other.id === target.slot.of);
    if (base) {
      overlay.appendChild(
        svgElement("line", { class: "guide", x1: base.anchor.x, y1: base.anchor.y, x2: anchor.x, y2: anchor.y }),
      );
    }
  }
  const caption = svgElement("text", { class: "caption", x: x + shape.box.width / 2, y: y - 10 });
  caption.textContent = describeTarget(target);
  overlay.appendChild(caption);
}

function place(current: Drag, target: NonNullable<Target>) {
  if (!parsed) return;
  const { shape } = current;
  const statement = edit.findShape(parsed, shape.id);
  if (!statement) return;
  const placement: Placement =
    target.kind === "at"
      ? { kind: "at", x: target.written.x, y: target.written.y }
      : { kind: "beside", direction: target.slot.direction, of: target.slot.of, gap: target.slot.gap, at: statement.at };
  const anchor = target.kind === "at" ? target.anchor : target.slot.anchor;
  move({
    moved: current.moving,
    delta: { x: anchor.x - shape.anchor.x, y: anchor.y - shape.anchor.y },
    primary: shape.id,
    placement,
  });
}

// 図形を動かす。ほかの図形はその場に残す
function move(request: Move) {
  try {
    commit(relocate(text, request));
  } catch (error) {
    if (!(error instanceof ZuError)) throw error;
    say(error.reason);
    draw();
  }
}

function setPlacement(statement: ShapeStatement, placement: Placement | null) {
  move({ moved: new Set([statement.id]), delta: null, primary: statement.id, placement });
}

// --- パネル ---

const html = (tag: string, attributes: Record<string, string> = {}, ...children: (Node | string)[]) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  node.append(...children);
  return node;
};

const button = (label: string, onClick: () => void, attributes: Record<string, string> = {}) => {
  const node = html("button", { type: "button", ...attributes }, label);
  node.addEventListener("click", onClick);
  return node;
};

function describePlacement(statement: ShapeStatement) {
  const { placement } = statement;
  if (!placement) {
    const list = edit.shapes(parsed!);
    const index = list.indexOf(statement);
    return index === 0 ? "最初の図形(置き方なし)" : `直前の図形(${list[index - 1]!.id})の右`;
  }
  if (placement.kind === "at") return `座標 (${placement.x}, ${placement.y})`;
  const gap = placement.gap === null ? "" : `、間 ${placement.gap}`;
  return `${placement.of} の${DIRECTION_NAMES[placement.direction]}${gap}`;
}

function update1(statement: ShapeStatement, change: Partial<ShapeStatement>) {
  commit(edit.replaceShape(text, parsed!, { ...statement, ...change }));
}

function numberField(label: string, value: number | null, placeholder: string, onChange: (value: number | null) => void) {
  const input = html("input", { type: "number", step: "1", placeholder, value: value === null ? "" : String(value) }) as HTMLInputElement;
  input.addEventListener("change", () => onChange(input.value === "" ? null : Number(input.value)));
  return html("label", { class: "field" }, label, input);
}

const STYLE_NAMES: Record<LineStyle, string> = { solid: "実線", dotted: "点線", double: "二重線" };
const HEAD_NAMES: Record<Head, string> = { none: "なし", open: "矢印(V字)", filled: "矢印(塗りつぶし)", dot: "丸" };

function choice<T extends string>(label: string, options: readonly T[], names: Record<T, string>, value: T, onChange: (value: T) => void) {
  const select = html("select") as HTMLSelectElement;
  for (const option of options) select.append(html("option", { value: option }, names[option]));
  select.value = value;
  select.addEventListener("change", () => onChange(select.value as T));
  return html("label", { class: "field" }, label, select);
}

function renderLinePanel(index: number) {
  const statement = edit.lines(parsed!)[index];
  if (!statement) return;
  const change = (next: LineStatement | null) => {
    if (next === null) selectedLine = null;
    commit(edit.replaceLine(text, parsed!, index, next));
  };
  const { arrow } = statement;
  const label = html("textarea", { rows: "2", placeholder: "なし" }) as HTMLTextAreaElement;
  label.value = statement.label ?? "";
  label.addEventListener("change", () => change({ ...statement, label: label.value === "" ? null : label.value }));

  panel.append(
    html(
      "div",
      { class: "field" },
      html("span", {}, "結ぶ図形"),
      html("span", { class: "value" }, `${statement.from.id} → ${statement.to.id}`),
      button(
        "向きを入れ替える",
        () => change({ ...statement, from: statement.to, to: statement.from, arrow: { ...arrow, start: arrow.end, end: arrow.start } }),
        { class: "small" },
      ),
    ),
    choice("線の種類", LINE_STYLES, STYLE_NAMES, arrow.style, (style) => change({ ...statement, arrow: { ...arrow, style } })),
    choice(`${statement.from.id} の側の端`, HEADS, HEAD_NAMES, arrow.start, (start) => change({ ...statement, arrow: { ...arrow, start } })),
    choice(`${statement.to.id} の側の端`, HEADS, HEAD_NAMES, arrow.end, (end) => change({ ...statement, arrow: { ...arrow, end } })),
    html("label", { class: "field" }, "ラベル", label),
    html("div", { class: "row" }, button("この線を消す", () => change(null), { class: "danger" })),
  );
}

function renderPanel() {
  panel.replaceChildren();
  if (broken) {
    panel.append(html("p", { class: "muted" }, "文字の誤りを直すと、図で編集できます。"));
    return;
  }
  if (!parsed) return;

  if (selectedLine !== null) {
    renderLinePanel(selectedLine);
    return;
  }

  if (selected.length === 0) {
    panel.append(
      html("p", { class: "muted" }, "図形を選ぶと、ここで編集できます。"),
      html(
        "ul",
        { class: "help" },
        html("li", {}, "ドラッグ: ほかの図形の上下左右に寄せて置く(ほかの図形は動かない)"),
        html("li", {}, "Shift+クリック: いくつも選ぶ。まとめてドラッグすると、互いの位置を保って動く"),
        html("li", {}, "Alt+ドラッグ: 数で置く(間や座標)"),
        html("li", {}, "2つ選んで「線でつなぐ」: 線を引く。線をクリックすると種類や矢印を変えられる"),
      ),
    );
    return;
  }

  if (selected.length > 1) {
    panel.append(html("p", {}, `${selected.length} 個を選んでいます: ${selected.join("、")}`));
    panel.append(
      html(
        "div",
        { class: "row" },
        button("段を揃える", () => commit(edit.addAlign(text, parsed!, "row", selected))),
        button("列を揃える", () => commit(edit.addAlign(text, parsed!, "column", selected))),
      ),
    );
    return;
  }

  const statement = edit.findShape(parsed, selected[0]!);
  if (!statement) return;

  const name = html("input", { value: statement.id }) as HTMLInputElement;
  name.addEventListener("change", () => {
    const next = name.value.trim();
    if (next === statement.id) return;
    if (!WORD.test(next)) return say("名前には文字、数字、_、- が使えます(先頭は文字か _)");
    if (edit.findShape(parsed!, next)) return say(`「${next}」という名前の図形がすでにあります`);
    selected = [next];
    commit(edit.rename(text, parsed!, statement.id, next));
  });

  const label = html("textarea", { rows: "2" }) as HTMLTextAreaElement;
  label.value = statement.label ?? statement.id;
  label.addEventListener("change", () => {
    const value = label.value;
    update1(statement, { label: value === statement.id ? null : value });
  });

  const kind = html("select") as HTMLSelectElement;
  for (const shape of SHAPES) kind.append(html("option", { value: shape }, SHAPE_NAMES[shape]));
  kind.value = statement.shape;
  kind.addEventListener("change", () => update1(statement, { shape: kind.value as Shape }));

  panel.append(
    html("label", { class: "field" }, "名前", name),
    html("label", { class: "field" }, "ラベル", label),
    html("label", { class: "field" }, "形", kind),
  );

  const placementRow = html("div", { class: "field" }, html("span", {}, "置き方"), html("span", { class: "value" }, describePlacement(statement)));
  if (statement.placement) {
    placementRow.append(button("外す", () => setPlacement(statement, null), { class: "small" }));
  }
  panel.append(placementRow);

  for (const align of parsed.statements) {
    if (align.kind !== "align" || !align.members.some((m) => m.id === statement.id)) continue;
    const others = align.members.map((m) => m.id).join("、");
    panel.append(
      html(
        "div",
        { class: "field" },
        html("span", {}, align.axis === "row" ? "同じ段" : "同じ列"),
        html("span", { class: "value" }, others),
        button("外す", () => commit(edit.leaveAlign(text, parsed!, align.axis, statement.id)), { class: "small" }),
      ),
    );
  }

  // 数の指定は普段は隠しておく
  const advanced = html("details", { class: "advanced" }) as HTMLDetailsElement;
  advanced.open = advancedOpen;
  advanced.addEventListener("toggle", () => (advancedOpen = advanced.open));
  advanced.append(html("summary", {}, "高度な設定(数で指定する)"));
  const { placement, size } = statement;
  if (placement?.kind === "beside") {
    advanced.append(
      numberField("間", placement.gap, "既定 40", (gap) => setPlacement(statement, { ...placement, gap })),
    );
  }
  const at = placement?.kind === "at" ? placement : null;
  const setAt = (axis: "x" | "y") => (value: number | null) => {
    if (value === null) return;
    const x = axis === "x" ? value : (at?.x ?? 0);
    const y = axis === "y" ? value : (at?.y ?? 0);
    setPlacement(statement, { kind: "at", x, y });
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
    const setSize = (part: "width" | "height") => (value: number | null) => {
      const width = part === "width" ? value : (size?.width ?? null);
      const height = part === "height" ? value : (size?.height ?? null);
      update1(statement, { size: width === null ? null : { width, height } });
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
  panel.append(advanced);
  panel.append(html("div", { class: "row" }, button("この図形を消す", removeSelected, { class: "danger" })));
}

// --- 道具 ---

function connect() {
  if (!parsed || selected.length !== 2) return;
  const index = edit.lines(parsed).length;
  const [from, to] = selected as [string, string];
  selected = [];
  selectedLine = index;
  commit(edit.addLine(text, from, to));
}

function removeSelected() {
  if (parsed && selectedLine !== null) {
    const index = selectedLine;
    selectedLine = null;
    commit(edit.replaceLine(text, parsed, index, null));
    return;
  }
  if (!parsed || selected.length === 0) return;
  try {
    let next = text;
    for (const id of selected) next = removeShape(next, id);
    selected = [];
    commit(next);
  } catch (error) {
    if (!(error instanceof ZuError)) throw error;
    say(error.reason);
  }
}

function addShape(shape: Shape) {
  if (!parsed) return;
  const id = edit.freshId(parsed);
  const at = { line: 0, column: 0 };
  selected = [id];
  commit(edit.append(text, { kind: "shape", shape, id, label: null, placement: null, size: null, at, end: at }));
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = html("a", { href: url, download: name });
  link.click();
  URL.revokeObjectURL(url);
}

const toolbar = element<HTMLDivElement>("toolbar");
function renderToolbar() {
  toolbar.replaceChildren(
    html(
      "div",
      { class: "group" },
      ...SHAPES.map((shape) => button(`+ ${SHAPE_NAMES[shape]}`, () => addShape(shape), broken ? { disabled: "" } : {})),
    ),
    html(
      "div",
      { class: "group" },
      button("段を揃える", () => commit(edit.addAlign(text, parsed!, "row", selected)), selected.length < 2 || broken ? { disabled: "" } : { title: "選んだ図形を同じ高さに" }),
      button("列を揃える", () => commit(edit.addAlign(text, parsed!, "column", selected)), selected.length < 2 || broken ? { disabled: "" } : { title: "選んだ図形を同じ左右の位置に" }),
      button("線でつなぐ", connect, selected.length !== 2 || broken ? { disabled: "" } : { title: "先に選んだ図形から後に選んだ図形へ" }),
    ),
    html(
      "div",
      { class: "group" },
      button("元に戻す", undo, history.past.length === 0 ? { disabled: "" } : {}),
      button("やり直す", redo, history.future.length === 0 ? { disabled: "" } : {}),
    ),
    html(
      "div",
      { class: "group" },
      button("開く", () => fileInput.click()),
      button(".zu を保存", () => download(fileName, text, "text/plain")),
      button("SVG を保存", () => {
        try {
          download(fileName.replace(/\.zu$/, "") + ".svg", toSvg(layout(parse(text))), "image/svg+xml");
        } catch (error) {
          if (error instanceof ZuError) say(error.message);
          else throw error;
        }
      }),
    ),
  );
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  fileName = file.name;
  replaceAll((await file.text()).replace(/\r\n?/g, "\n"));
  fileInput.value = "";
});

document.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement;
  if (target.closest("textarea, input, select")) return;
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
  } else if (mod && event.key.toLowerCase() === "y") {
    event.preventDefault();
    redo();
  } else if (event.key === "Delete" || event.key === "Backspace") {
    if (selected.length > 0 || selectedLine !== null) {
      event.preventDefault();
      removeSelected();
    }
  } else if (event.key === "Escape") {
    selected = [];
    selectedLine = null;
    drawSelection();
    renderPanel();
    renderToolbar();
  }
});

source.value = text;
update();
