import assert from "node:assert/strict";
import { test } from "node:test";
import { ZuError, layout, parse, render } from "../src/index.ts";
import { DEFAULT_GAP, PADDING } from "../src/layout/layout.ts";
import type { PlacedShape } from "../src/layout/layout.ts";
import { measureText } from "../src/layout/measure.ts";

// 外枠(x, y, width, height)に本体の中心(cx, cy)を添えて返す
const place = (source: string) => {
  const scene = layout(parse(source));
  return Object.fromEntries(
    scene.shapes.map(({ id, box, anchor }: PlacedShape) => [id, { ...box, cx: anchor.x, cy: anchor.y }]),
  );
};
// 座標は小数の計算なので、誤差の範囲で比べる
const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} は ${expected} ではありません`);

const fails = (source: string, line: number, reason: RegExp) =>
  assert.throws(
    () => layout(parse(source)),
    (error: unknown) => error instanceof ZuError && error.line === line && reason.test(error.reason),
  );

test("wide characters take a full width and others about half", () => {
  assert.equal(measureText("本人").width, 32);
  assert.equal(measureText("AB").width, 2 * 16 * 0.6);
  assert.equal(measureText("一\n二").height, 2 * 16 * 1.4);
});

test("relative placement keeps the given gap between the outlines and aligns the bodies", () => {
  const { a, b, c } = place("text a at 0 0\ncube b right of a by 30\nparallelogram c below b");
  close(b!.x - (a!.x + a!.width), 30);
  close(b!.cy, a!.cy);
  close(c!.y - (b!.y + b!.height), DEFAULT_GAP);
  close(c!.cx, b!.cx);
});

test("the body of a cube excludes its label", () => {
  const { b } = place("text a\ncube b");
  // 正面の一辺 60、奥行き 18 の立方体の中心は、外枠の上端から 39
  close(b!.cy - b!.y, 39);
  close(b!.cx, b!.x + b!.width / 2);
});

test("shapes without a placement follow the previous one, and the drawing starts inside the padding", () => {
  const { a, b } = place("text a\ntext b");
  close(a!.x, PADDING);
  close(a!.y, PADDING);
  close(b!.x - (a!.x + a!.width), DEFAULT_GAP);
});

test("a shape may refer to one written later", () => {
  const { a, b } = place("text a above b\ntext b at 100 100");
  close(a!.cx, b!.cx);
  assert.ok(a!.y < b!.y);
});

test("broken references are reported where they are written", () => {
  fails("text a\ntext b right of x", 2, /「x」という図形はありません/);
  fails("text a right of b\ntext b right of a", 1, /循環/);
  fails("text a\ncube a", 2, /すでにあります/);
});

test("align row puts shapes below different bases on one row, never closer to their bases", () => {
  const source = [
    "text a at 0 0",
    "text c right of a by 200",
    "text b below a",
    "parallelogram land below c",
    "align row b land",
  ].join("\n");
  const { a, b, c, land } = place(source);
  close(b!.cy, land!.cy);
  // 高いほう(land)の間はそのまま、低いほう(b)の間は広がる
  close(land!.y - (c!.y + c!.height), DEFAULT_GAP);
  assert.ok(b!.y - (a!.y + a!.height) > DEFAULT_GAP);
  // 揃えても左右の位置は置き方のまま
  close(b!.cx, a!.cx);
  close(land!.cx, c!.cx);
});

test("align moves shapes placed above only upward", () => {
  const { a, b, c, d } = place("text a\ntext c right of a\ncube b above a\ntext d above c\nalign row b d");
  close(b!.cy, d!.cy);
  close((a!.y - DEFAULT_GAP) - (b!.y + b!.height), 0);
  assert.ok(c!.y - (d!.y + d!.height) > DEFAULT_GAP);
});

test("a shape placed some other way decides the row", () => {
  const { b, c } = place("text a at 0 0\ntext b at 300 120\ncube c below a\nalign row c b");
  close(c!.cy, b!.cy);
  const { p, q } = place("text p at 0 0\ntext q at 0 50\nalign row p q");
  close(q!.cy, p!.cy);
});

test("align column lines shapes up left to right", () => {
  const { b, d } = place("text a\ntext b below a\ncube c right of a\ntext d right of c\nalign column b d");
  close(b!.cx, d!.cx);
});

test("shapes placed after an aligned one follow it", () => {
  const { land, d } = place("text a\ntext c right of a\ntext b below a\ncube land below c\nalign row b land\ntext d below land");
  close(d!.cx, land!.cx);
  close(d!.y - (land!.y + land!.height), DEFAULT_GAP);
});

test("aligns sharing a shape are merged, and redundant alignment is allowed", () => {
  const { a, b, c } = place("text a\ntext b at 0 80\ntext c at 0 160\nalign row a b\nalign row b c");
  close(b!.cy, a!.cy);
  close(c!.cy, a!.cy);
  const { p, q } = place("text p\ncube q right of p\nalign row p q");
  close(q!.cy, p!.cy);
});

test("broken aligns are reported where they are written", () => {
  fails("text a\ntext b\nalign row a x", 3, /「x」という図形はありません/);
  fails("text a\ntext b\nalign row a b a", 3, /2回挙げています/);
  // b は a の下なので、a と同じ段には置けない
  fails("text a\ntext b below a\nalign row a b", 3, /揃えと置き方が循環しています/);
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

test("a line runs between the bodies, stopping short of their outlines", () => {
  const scene = layout(parse("text a\ncube b right of a by 100\na ---> b"));
  const [a, b] = scene.shapes;
  const [line] = scene.lines;
  // 本体の中心どうしは同じ高さなので、線は水平
  close(line!.start.y, a!.anchor.y);
  close(line!.end.y, b!.anchor.y);
  close(line!.start.x, a!.box.x + a!.box.width + 6);
  // 立方体はラベルを除いた本体の枠で切る(ラベルの幅は本体より狭い)
  close(line!.end.x, b!.anchor.x - (60 + 18) / 2 - 6);
});

test("lines between the same pair are drawn side by side, and labels sit in the middle", () => {
  const scene = layout(parse('text a\ntext b right of a by 200\na ---> b "行き"\nb ---> a'));
  const [go, back] = scene.lines;
  close(Math.abs(go!.start.y - back!.start.y), 16);
  const middle = (go!.start.x + go!.end.x) / 2;
  close(go!.labelBox!.x + go!.labelBox!.width / 2, middle);
  assert.equal(back!.labelBox, null);
});

test("labels are inside the drawing", () => {
  const scene = layout(parse('text a\ntext b below a by 10\na --- b "とても長いラベルとても長いラベル"'));
  const box = scene.lines[0]!.labelBox!;
  assert.ok(box.x >= PADDING - 1e-9);
  assert.ok(box.x + box.width <= scene.width - PADDING + 1e-9);
});

test("broken lines are reported where they are written", () => {
  fails("text a\na --- x", 2, /「x」という図形はありません/);
  fails("text a\na --- a", 2, /同じ図形どうし/);
});

test("the svg draws line styles and heads", () => {
  const svg = render("text a\ntext b\na -.->> b\na ===o b\nb ---> a");
  const line = (index: number) => svg.match(new RegExp(`<g data-line="${index}">(.*?)</g>`))?.[1] ?? "";
  assert.match(line(0), /stroke-dasharray/);
  assert.match(line(0), /<polygon[^>]*fill="#333333"/);
  // 二重線は2本の線で描く
  assert.equal(line(1).match(/<line /g)?.length, 2);
  assert.equal(line(0).match(/<line /g)?.length, 1);
  assert.match(line(1), /<circle/);
  assert.match(line(2), /<polygon[^>]*fill="#ffffff"/);
  // 線は図形より先に(下に)描く
  assert.ok(svg.indexOf('data-line="0"') < svg.indexOf('data-id="a"'));
});
