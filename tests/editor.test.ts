import assert from "node:assert/strict";
import { test } from "node:test";
import * as edit from "../editor/edit.ts";
import { History } from "../editor/history.ts";
import { relocate, removeShape } from "../editor/relocate.ts";
import { Editor } from "../editor/state.ts";
import { nearest, placementsFor, slide, slots } from "../editor/snap.ts";
import { DEFAULT_GAP, defaultGap, layout } from "../src/layout/layout.ts";
import { parse } from "../src/syntax/parser.ts";

const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} は ${expected} ではありません`);

test("positions count characters, not UTF-16 units", () => {
  const text = "text 𠮷 at 1 2\ntext b";
  assert.equal(edit.offsetOf(text, { line: 1, column: 7 }), 7);
  assert.equal(edit.offsetOf(text, { line: 2, column: 6 }), text.indexOf("b"));
});

test("replacing a statement keeps comments, blank lines and other lines", () => {
  const text = '%% はじめ\ntext a "本人"\n\ntext b right a by 3 %% 右に\n';
  const document = parse(text);
  const b = edit.findShape(document, "b")!;
  const next = edit.replaceShape(text, document, {
    ...b,
    placement: { kind: "beside", direction: "below", of: "a", gap: null, at: b.at },
  });
  assert.equal(next, '%% はじめ\ntext a "本人"\n\ntext b below of a %% 右に\n');
});

test("renaming a shape updates its references and aligns", () => {
  const text = "text a\ntext b below a\nalign row a b\n";
  assert.equal(edit.rename(text, parse(text), "a", "本人"), "text 本人\ntext b below of 本人\nalign row 本人 b\n");
});

test("aligning adds to an existing align of the same axis or appends a new one", () => {
  const text = "text a\ntext b\ntext c\nalign row a b";
  assert.equal(edit.addAlign(text, parse(text), "row", ["b", "c"]), "text a\ntext b\ntext c\nalign row a b c");
  assert.equal(edit.addAlign(text, parse(text), "column", ["a", "c"]), "text a\ntext b\ntext c\nalign row a b\nalign column a c\n");
  assert.equal(edit.leaveAlign(text, parse(text), "row", "a"), "text a\ntext b\ntext c\n");
});

test("followers are the shapes whose placement leads to the shape, including implicit ones", () => {
  const document = parse("text a\ntext b\ntext c below b\ntext d at 0 0\ntext e right of d");
  assert.deepEqual([...edit.dependents(document, "a")].sort(), ["b", "c"]);
  assert.deepEqual([...edit.dependents(document, "d")], ["e"]);
});

test("numbers in a statement are noticed", () => {
  const [a, b, c, d] = edit.shapes(parse("text a\ntext b below a by 3\ncube c size 30\ntext d at 1 2"));
  assert.deepEqual([a, b, c, d].map((s) => edit.usesNumbers(s!)), [false, true, true, true]);
});

test("slots put the dragged shape beside others at the default gap", () => {
  const scene = layout(parse("text a\ncube b at 300 0"));
  const [a, b] = scene.shapes;
  const candidates = slots(scene.shapes, b!, new Set());
  const below = candidates.find((slot) => slot.of === "a" && slot.direction === "below")!;
  close(below.anchor.x, a!.anchor.x);
  // 置いたときの外枠どうしの間が既定の間になる
  const top = below.anchor.y - (b!.anchor.y - b!.box.y);
  close(top - (a!.box.y + a!.box.height), DEFAULT_GAP);
  assert.equal(nearest(candidates, { x: below.anchor.x + 10, y: below.anchor.y }, 56), below);
  assert.equal(nearest(candidates, { x: 9999, y: 9999 }, 56), null);
  assert.equal(slots(scene.shapes, b!, new Set(["a"])).length, 0);
});

test("sliding keeps the shape on the line and turns the distance into a gap", () => {
  const scene = layout(parse("text a\ntext b below a"));
  const [a, b] = scene.shapes;
  const slot = slide(b!, a!, "below", { x: a!.anchor.x + 50, y: b!.anchor.y + 30.4 });
  assert.equal(slot.gap, DEFAULT_GAP + 30);
  close(slot.anchor.x, a!.anchor.x);
  assert.equal(slide(b!, a!, "below", { x: 0, y: -999 }).gap, 0);
});

// 図形の本体の中心を、id の図形からの相対で返す(出力では全体がずれるので)
function positions(text: string, from: string) {
  const scene = layout(parse(text));
  const origin = scene.shapes.find((shape) => shape.id === from)!.anchor;
  return new Map(scene.shapes.map((shape) => [shape.id, { x: shape.anchor.x - origin.x, y: shape.anchor.y - origin.y }]));
}

function assertStayed(before: string, after: string, ids: string[], from: string) {
  const old = positions(before, from);
  const now = positions(after, from);
  for (const id of ids) {
    assert.ok(Math.abs(now.get(id)!.x - old.get(id)!.x) < 0.06, `${id} の x が動きました`);
    assert.ok(Math.abs(now.get(id)!.y - old.get(id)!.y) < 0.06, `${id} の y が動きました`);
  }
}

type Direction = "left" | "right" | "above" | "below";
const beside = (direction: Direction, of: string) =>
  ({ kind: "beside", direction, of, gap: null, at: { line: 0, column: 0 } }) as const;

// id を of の direction(既定の間)へ動かすときの量
function slotDelta(text: string, id: string, direction: Direction, of: string) {
  const scene = layout(parse(text));
  const shape = scene.shapes.find((other) => other.id === id)!;
  const slot = slots(scene.shapes, shape, new Set()).find((s) => s.of === of && s.direction === direction)!;
  return { x: slot.anchor.x - shape.anchor.x, y: slot.anchor.y - shape.anchor.y };
}

test("candidate placements prefer no numbers, then the narrowest gap", () => {
  const scene = layout(parse("text a\ntext b below a\ntext c below b by 100"));
  const c = scene.shapes[2]!;
  const options = placementsFor(scene.shapes, c, c.anchor, new Set());
  const first = options[0];
  assert.equal(options.length, 2);
  assert.ok(first?.kind === "beside" && first.of === "b" && first.gap === 100);
  const b = scene.shapes[1]!;
  const exact = placementsFor(scene.shapes, b, b.anchor, new Set());
  assert.deepEqual(exact[0], beside("below", "a"));
});

test("moving a shape leaves the shapes that hung on it where they were", () => {
  const text = "text a\ntext b below a\ntext c right of b\n";
  const delta = slotDelta(text, "a", "right", "c");
  const next = relocate(text, { moved: new Set(["a"]), delta, primary: "a", placement: beside("right", "c") });
  assertStayed(text, next, ["b", "c"], "b");
  // b は座標で残さず、最初の図形にして置き方なしにする
  assert.equal(next, "text b\ntext a right of c\ntext c right of b\n");
});

test("moving a shape onto one that depended on it does not make a cycle", () => {
  const text = "text a\ntext b below a\n";
  const delta = slotDelta(text, "a", "below", "b");
  const next = relocate(text, { moved: new Set(["a"]), delta, primary: "a", placement: beside("below", "b") });
  assert.equal(next, "text b\ntext a below of b\n");
});

test("shapes moved together keep their relations, even when the pulled one depended on another", () => {
  const text = "text a\ntext b below a\ncube c right of a by 200\n";
  const delta = slotDelta(text, "a", "below", "c");
  const next = relocate(text, { moved: new Set(["a", "b"]), delta, primary: "a", placement: beside("below", "c") });
  assert.match(next, /^text b below a$/m);
  assertStayed(text, next, ["c"], "c");
  const old = positions(text, "a");
  const now = positions(next, "a");
  assert.ok(Math.abs(now.get("b")!.y - old.get("b")!.y) < 0.06);

  // b を引っ張ると、a は b の上に付け替わる
  const pulled = slotDelta(text, "b", "below", "c");
  const after = relocate(text, { moved: new Set(["a", "b"]), delta: pulled, primary: "b", placement: beside("below", "c") });
  assert.match(after, /^text a above of b$/m);
  assertStayed(text, after, ["b"], "a");
});

// 付け替えた図形は、数を書かずに済むなら少しずれてよい
function assertNearby(before: string, after: string, id: string, from: string) {
  const old = positions(before, from).get(id)!;
  const now = positions(after, from).get(id)!;
  assert.ok(Math.hypot(now.x - old.x, now.y - old.y) <= DEFAULT_GAP * 1.5, `${id} が離れすぎました`);
}

test("moving a shape across its row takes it out of that row only", () => {
  const text = "text a\ntext c right of a by 200\ntext b below a\ncube land below c\nalign row b land\n";
  const delta = slotDelta(text, "land", "right", "c");
  const next = relocate(text, { moved: new Set(["land"]), delta, primary: "land", placement: beside("right", "c") });
  assert.doesNotMatch(next, /align/);
  assertStayed(text, next, ["a", "c"], "a");
  // b は land の段に引っ張られていた。段がなくなったので、数を書かずに a の下へ戻る
  assert.match(next, /^text b below (of )?a$/m);
  assertNearby(text, next, "b", "a");
});

test("re-placed shapes prefer a nearby placement without numbers", () => {
  const text = "text a\ntext b below a\ntext c right of b\n";
  const delta = slotDelta(text, "a", "right", "c");
  const next = relocate(text, { moved: new Set(["a"]), delta, primary: "a", placement: beside("right", "c") });
  assert.doesNotMatch(next, /\bby\b|\bat\b/);
  // 遠くにしか数なしの置き方がなければ、数を書いて位置を保つ
  const far = "text a\ntext b below a by 300\ntext c right of a by 300\n";
  const moved = relocate(far, { moved: new Set(["a"]), delta: slotDelta(far, "a", "right", "c"), primary: "a", placement: beside("right", "c") });
  assertStayed(far, moved, ["b", "c"], "c");
});

test("removing a shape leaves the others where they were, or close by without numbers", () => {
  const text = "text a\ntext b below a\ntext c right of b\nalign row b c\n";
  const next = removeShape(text, "b");
  assert.doesNotMatch(next, /\bb\b/);
  assert.doesNotMatch(next, /\bby\b|\bat\b/);
  assertNearby(text, next, "c", "a");
  const chain = "text a\ntext b\ntext c\n";
  const shorter = removeShape(chain, "b");
  assert.equal(shorter.trim().split("\n").length, 2);
  assertNearby(chain, shorter, "c", "a");
});

test("lines follow renames and disappear with their shapes", () => {
  const text = "text a\ntext b below a\na ---> b \"x\"\n";
  assert.equal(edit.rename(text, parse(text), "b", "代理人"), 'text a\ntext 代理人 below of a\na ---> 代理人 "x"\n');
  assert.doesNotMatch(removeShape(text, "b"), /--->/);
  const added = edit.addLine(text, "b", "a");
  assert.match(added, /^b --- a$/m);
  const document = parse(added);
  const changed = edit.replaceLine(added, document, 1, { ...edit.lines(document)[1]!, arrow: { style: "dotted", start: "dot", end: "filled" } });
  assert.match(changed, /^b o-.->> a$/m);
  assert.equal(edit.lineAtLine(document, 3), 0);
});

test("snapping beside a shape uses the same widened gap as the layout", () => {
  const text = 'text a\ntext b at 0 200\na ---> b "意思表示"\n';
  const document = parse(text);
  const scene = layout(document);
  const b = scene.shapes[1]!;
  const gapOf = (of: string, direction: Direction) => defaultGap(document, "b", of, direction);
  const slot = slots(scene.shapes, b, new Set(), gapOf).find((s) => s.of === "a" && s.direction === "right")!;
  const delta = { x: slot.anchor.x - b.anchor.x, y: slot.anchor.y - b.anchor.y };
  const next = relocate(text, { moved: new Set(["b"]), delta, primary: "b", placement: beside("right", "a") });
  assert.match(next, /^text b right of a$/m);
  const after = positions(next, "a").get("b")!;
  const wanted = { x: slot.anchor.x - scene.shapes[0]!.anchor.x, y: slot.anchor.y - scene.shapes[0]!.anchor.y };
  close(after.x, wanted.x);
  close(after.y, wanted.y);
});

test("history steps back and forth, and a new change drops the redo side", () => {
  const history = new History();
  assert.equal(history.canUndo, false);
  history.record("a");
  history.record("b");
  assert.equal(history.undo("c"), "b");
  assert.equal(history.undo("b"), "a");
  assert.equal(history.undo("a"), undefined);
  assert.equal(history.redo("a"), "b");
  history.record("b");
  assert.equal(history.canRedo, false);
});

test("the editor keeps the text as the source and refuses edits that break it", () => {
  const messages: string[] = [];
  const editor = new Editor("text a\ntext b below a\n", (message) => messages.push(message));
  const changes: string[] = [];
  editor.listen((change) => changes.push(change));
  editor.reload();
  editor.select({ kind: "shapes", ids: ["a", "b"] });
  assert.deepEqual(changes, ["text", "selection"]);

  // 循環になる書き換えは入れず、理由を出す
  editor.commit("text a below b\ntext b below a\n");
  assert.equal(editor.text, "text a\ntext b below a\n");
  assert.match(messages[0]!, /循環/);

  // 消えた図形は選んでいるものから外れる
  editor.commit("text a\n");
  assert.deepEqual(editor.selection, { kind: "shapes", ids: ["a"] });
  editor.undo();
  assert.equal(editor.text, "text a\ntext b below a\n");
});
