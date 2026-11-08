// 図の欄。描いた SVG につかむための枠を足し、選ぶ・ドラッグして置くを受け持つ
import { defaultGap, toSvg } from "../src/index.ts";
import type { Document, Placement, PlacedShape, Point, ShapeStatement } from "../src/index.ts";
import { move } from "./actions.ts";
import { svgElement } from "./dom.ts";
import * as edit from "./edit.ts";
import { describeBeside } from "./names.ts";
import { nearest, slide, slots } from "./snap.ts";
import type { Slot } from "./snap.ts";
import { NOTHING } from "./state.ts";
import type { Editor } from "./state.ts";

// 図の周りに取る、ドラッグ用の余白
const MARGIN = 120;
// この距離(図の単位)まで近づけば吸着する
const SNAP_RADIUS = 56;
// これより小さい動きはクリックとみなす
const CLICK_SLOP = 3;

// ドラッグの行き先。slot は関係で置く、at は座標で置く(Alt)
type Target = { kind: "slot"; slot: Slot } | { kind: "at"; anchor: Point; written: Point };

type Drag = {
  shape: PlacedShape;
  start: Point;
  moved: boolean;
  // 一緒に動かす図形(複数選んでいればその全部)。ほかの図形は動かない
  moving: Set<string>;
  slots: Slot[];
  target: Target | null;
  // 選んである図形を Shift なしで押した。動かさずに離したら、それだけを選び直す
  narrow: boolean;
};

// 吸着先が、その図形の今の置き方と同じ関係か。置き方なしは「直前の図形の右」と同じ
function sameRelation(document: Document, statement: ShapeStatement, slot: Slot) {
  const { placement } = statement;
  if (placement?.kind === "beside") {
    return placement.direction === slot.direction && placement.of === slot.of && placement.gap === slot.gap;
  }
  if (placement === null && slot.direction === "right" && slot.gap === null) {
    const list = edit.shapes(document);
    return list[list.indexOf(statement) - 1]?.id === slot.of;
  }
  return false;
}

export function createCanvas(stage: HTMLElement, editor: Editor) {
  let drag: Drag | null = null;
  const svg = () => stage.querySelector("svg");

  function draw() {
    const { scene, document } = editor;
    stage.classList.toggle("stale", editor.broken);
    if (!scene || !document) {
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
      group.insertBefore(
        svgElement("rect", { class: "hit", x: x - 4, y: y - 4, width: w + 8, height: h + 8, rx: 4 }),
        group.firstChild,
      );
      const statement = edit.findShape(document, shape.id);
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
        svgElement("line", {
          class: "hit",
          x1: line.from.point.x,
          y1: line.from.point.y,
          x2: line.to.point.x,
          y2: line.to.point.y,
        }),
        group.firstChild,
      );
    });
    root.appendChild(svgElement("g", { id: "overlay" }));
    drawSelection();
  }

  function drawSelection() {
    const root = svg();
    if (!root) return;
    const shapes = editor.selectedShapes;
    const line = editor.selection.kind === "line" ? String(editor.selection.index) : null;
    for (const group of root.querySelectorAll("g.shape")) {
      group.classList.toggle("selected", shapes.includes(group.getAttribute("data-id") ?? ""));
    }
    for (const group of root.querySelectorAll("g.line")) {
      group.classList.toggle("selected", group.getAttribute("data-line") === line);
    }
  }

  function pointIn(root: SVGSVGElement, event: PointerEvent): Point {
    const matrix = root.getScreenCTM()!.inverse();
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
    return { x: point.x, y: point.y };
  }

  stage.addEventListener("pointerdown", (event) => {
    const root = svg();
    const { scene, document } = editor;
    if (!root || !scene || !document || editor.broken || event.button !== 0) return;
    const target = event.target as Element;

    const lineGroup = target.closest("g.line");
    if (lineGroup) {
      editor.select({ kind: "line", index: Number(lineGroup.getAttribute("data-line")) });
      return;
    }
    const group = target.closest("g.shape");
    if (!group) {
      editor.select(NOTHING);
      return;
    }

    const id = group.getAttribute("data-id")!;
    const before = editor.selectedShapes;
    const narrow = !event.shiftKey && before.includes(id) && before.length > 1;
    let ids: string[];
    if (event.shiftKey) ids = before.includes(id) ? before.filter((other) => other !== id) : [...before, id];
    else ids = before.includes(id) ? before : [id];
    editor.select(ids.length > 0 ? { kind: "shapes", ids } : NOTHING);

    const shape = scene.shapes.find((other) => other.id === id)!;
    const moving = new Set(ids.includes(id) && ids.length > 1 ? ids : [id]);
    drag = {
      shape,
      start: pointIn(root, event),
      moved: false,
      moving,
      slots: slots(scene.shapes, shape, moving, (of, direction) => defaultGap(document, id, of, direction)),
      target: null,
      narrow,
    };
    root.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  stage.addEventListener("pointermove", (event) => {
    const root = svg();
    const { scene } = editor;
    if (!drag || !root || !scene) return;
    const point = pointIn(root, event);
    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
    if (!drag.moved) {
      // 動かす図形に結んだ線は、放すまで薄くする(放すと引き直す)
      scene.lines.forEach((line, index) => {
        if (drag!.moving.has(line.from.id) || drag!.moving.has(line.to.id)) {
          root.querySelector(`g[data-line="${index}"]`)?.classList.add("detached");
        }
      });
      drag.moved = true;
    }

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
      if (current.narrow) editor.select({ kind: "shapes", ids: [current.shape.id] });
      return;
    }
    if (!current.target) {
      editor.say("ほかの図形の上下左右に寄せると置けます(Alt を押しながらだと数で置けます)");
      draw();
      return;
    }
    place(current, current.target);
  });

  function aim(current: Drag, anchor: Point, free: boolean): Target | null {
    const { scene, document } = editor;
    if (!scene || !document) return null;
    if (!free) {
      const slot = nearest(current.slots, anchor, SNAP_RADIUS);
      return slot ? { kind: "slot", slot } : null;
    }
    // Alt: 関係で置いている図形はその線の上だけを動かして間を変え、そうでなければ座標で置く
    const placement = edit.findShape(document, current.shape.id)?.placement;
    if (placement?.kind === "beside") {
      const base = scene.shapes.find((shape) => shape.id === placement.of);
      if (base) return { kind: "slot", slot: slide(current.shape, base, placement.direction, anchor) };
    }
    const written = { x: Math.round(anchor.x - scene.origin.x), y: Math.round(anchor.y - scene.origin.y) };
    return { kind: "at", written, anchor: { x: written.x + scene.origin.x, y: written.y + scene.origin.y } };
  }

  function describe(target: Target) {
    if (target.kind === "at") return `座標 (${target.written.x}, ${target.written.y})`;
    const { of, direction, gap } = target.slot;
    return describeBeside(of, direction, gap);
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
      const base = editor.scene?.shapes.find((other) => other.id === target.slot.of);
      if (base) {
        overlay.appendChild(
          svgElement("line", { class: "guide", x1: base.anchor.x, y1: base.anchor.y, x2: anchor.x, y2: anchor.y }),
        );
      }
    }
    const hint = svgElement("text", { class: "hint", x: x + shape.box.width / 2, y: y - 10 });
    hint.textContent = describe(target);
    overlay.appendChild(hint);
  }

  function place(current: Drag, target: Target) {
    const { document } = editor;
    const statement = document && edit.findShape(document, current.shape.id);
    if (!statement) return;
    // 今の置き方と同じ所に寄せただけなら、何も変えない(揃えで今の置き方からずれている図形を、
    // 少しつまんで放しただけで揃えから外さないように)
    if (target.kind === "slot" && current.moving.size === 1 && sameRelation(document, statement, target.slot)) {
      editor.commit(editor.text);
      return;
    }
    const placement: Placement =
      target.kind === "at"
        ? { kind: "at", x: target.written.x, y: target.written.y }
        : { kind: "beside", direction: target.slot.direction, of: target.slot.of, gap: target.slot.gap, at: statement.at };
    const anchor = target.kind === "at" ? target.anchor : target.slot.anchor;
    move(editor, {
      moved: current.moving,
      delta: { x: anchor.x - current.shape.anchor.x, y: anchor.y - current.shape.anchor.y },
      primary: current.shape.id,
      placement,
    });
  }

  return { draw, drawSelection };
}
