import assert from "node:assert/strict";
import { test } from "node:test";
import * as edit from "../editor/edit.ts";
import { relocate, removeShape } from "../editor/relocate.ts";
import { nearest, placementsFor, slide, slots } from "../editor/snap.ts";
import { DEFAULT_GAP, layout } from "../src/layout/layout.ts";
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

test("moving a shape across its row takes it out of that row only", () => {
  const text = "text a\ntext c right of a by 200\ntext b below a\ncube land below c\nalign row b land\n";
  const delta = slotDelta(text, "land", "right", "c");
  const next = relocate(text, { moved: new Set(["land"]), delta, primary: "land", placement: beside("right", "c") });
  assert.doesNotMatch(next, /align/);
  assertStayed(text, next, ["a", "b", "c"], "a");
});

test("removing a shape leaves the others where they were", () => {
  const text = "text a\ntext b below a\ntext c right of b\nalign row b c\n";
  const next = removeShape(text, "b");
  assert.doesNotMatch(next, /\bb\b/);
  assertStayed(text, next, ["a", "c"], "a");
  const chain = "text a\ntext b\ntext c\n";
  const shorter = removeShape(chain, "b");
  assert.equal(shorter.trim().split("\n").length, 2);
  assertStayed(chain, shorter, ["a", "c"], "a");
});
