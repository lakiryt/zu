import assert from "node:assert/strict";
import { test } from "node:test";
import * as edit from "../editor/edit.ts";
import { nearest, slide, slots } from "../editor/snap.ts";
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

test("removing a shape hands its placement to the shapes placed beside it", () => {
  const text = "text a\ntext b below a\ntext c right of b\nalign row b c\n";
  assert.equal(edit.remove(text, parse(text), "b"), "text a\ntext c below of a\n");
  const fixed = "text a right of b\ntext b at 0 0\ntext c below a\n";
  assert.equal(edit.remove(fixed, parse(fixed), "b"), "text a at 0 0\ntext c below a\n");
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
