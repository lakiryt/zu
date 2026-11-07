import assert from "node:assert/strict";
import { test } from "node:test";
import { ZuError, layout, parse, render } from "../src/index.ts";
import { DEFAULT_GAP, PADDING } from "../src/layout/layout.ts";
import { measureText } from "../src/layout/measure.ts";

const place = (source: string) => {
  const scene = layout(parse(source));
  return Object.fromEntries(scene.shapes.map((shape) => [shape.id, shape.box]));
};
// 座標は小数の計算なので、誤差の範囲で比べる
const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} は ${expected} ではありません`);

const center = ({ x, y, width, height }: { x: number; y: number; width: number; height: number }) => ({
  x: x + width / 2,
  y: y + height / 2,
});

test("wide characters take a full width and others about half", () => {
  assert.equal(measureText("本人").width, 32);
  assert.equal(measureText("AB").width, 2 * 16 * 0.6);
  assert.equal(measureText("一\n二").height, 2 * 16 * 1.4);
});

test("relative placement keeps the given gap between the outlines and aligns the centers", () => {
  const { a, b, c } = place("text a at 0 0\ncube b right of a by 30\nparallelogram c below b");
  close(b!.x - (a!.x + a!.width), 30);
  close(center(b!).y, center(a!).y);
  close(c!.y - (b!.y + b!.height), DEFAULT_GAP);
  close(center(c!).x, center(b!).x);
});

test("shapes without a placement follow the previous one, and the drawing starts inside the padding", () => {
  const { a, b } = place("text a\ntext b");
  close(a!.x, PADDING);
  close(a!.y, PADDING);
  close(b!.x - (a!.x + a!.width), DEFAULT_GAP);
});

test("a shape may refer to one written later", () => {
  const { a, b } = place("text a above b\ntext b at 100 100");
  close(center(a!).x, center(b!).x);
  assert.ok(a!.y < b!.y);
});

test("broken references are reported where they are written", () => {
  const fails = (source: string, line: number, reason: RegExp) =>
    assert.throws(
      () => layout(parse(source)),
      (error: unknown) => error instanceof ZuError && error.line === line && reason.test(error.reason),
    );
  fails("text a\ntext b right of x", 2, /「x」という図形はありません/);
  fails("text a right of b\ntext b right of a", 1, /循環/);
  fails("text a\ncube a", 2, /すでにあります/);
});

test("the svg draws each shape and escapes labels", () => {
  const svg = render('text a "<A & B>"\nparallelogram b\ncube c "一\\n二"');
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.match(svg, /&lt;A &amp; B&gt;/);
  const group = (id: string) => svg.match(new RegExp(`<g data-id="${id}">(.*?)</g>`))?.[1] ?? "";
  assert.equal(group("b").match(/<polygon/g)?.length, 1);
  assert.equal(group("c").match(/<polygon/g)?.length, 3);
  assert.equal(group("c").match(/<tspan/g)?.length, 2);
});
