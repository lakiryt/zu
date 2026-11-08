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
  // 正面の一辺 40、奥行き 12 の立方体の中心は、外枠の上端から 26
  close(b!.cy - b!.y, 26);
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
  close(line!.end.x, b!.anchor.x - (40 + 12) / 2 - 6);
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
  // > は V 字(塗らない折れ線)
  assert.match(line(2), /<polyline[^>]*fill="none"/);
  assert.doesNotMatch(line(2), /<polygon/);
  // 線は図形より先に(下に)描く
  assert.ok(svg.indexOf('data-line="0"') < svg.indexOf('data-id="a"'));
});

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1e-6 &&
  Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1e-6;

test("shapes joined by a labelled line are spaced so the label and arrowheads fit", () => {
  const plain = place("text a\ntext b right of a\na ---> b");
  close(plain.b!.x - (plain.a!.x + plain.a!.width), DEFAULT_GAP);

  const scene = layout(parse('text a\ntext b right of a\na <---> b "意思表示"'));
  const [a, b] = scene.shapes;
  const gap = b!.box.x - (a!.box.x + a!.box.width);
  assert.ok(gap > DEFAULT_GAP);
  const { start, end, labelBox } = scene.lines[0]!;
  // ラベルは両端の矢先(長さ 12)にかからない
  assert.ok(labelBox!.x > start.x + 12);
  assert.ok(labelBox!.x + labelBox!.width < end.x - 12);
  // by を書けば、その間のまま
  const fixed = place('text a\ntext b right of a by 10\na ---> b "意思表示"');
  close(fixed.b!.x - (fixed.a!.x + fixed.a!.width), 10);
});

test("three shapes joined in a triangle get room for the labels on the other two sides", () => {
  const source = [
    'text x "代理人(X)"',
    'text a "本人(A)" above of x',
    'text c "相手方(C)" right of x',
    "a --- x",
    'a === c "契約成立"',
    'x ---> c "意思表示"',
    'x <--- c "意思表示"',
  ].join("\n");
  const scene = layout(parse(source));
  const box = (id: string) => scene.shapes.find((shape) => shape.id === id)!.box;
  // a と x の間の線にはラベルがないが、a-c と x-c のラベルが積める分だけ広がる
  assert.ok(box("x").y - (box("a").y + box("a").height) > DEFAULT_GAP * 2);

  const labels = scene.lines.flatMap(({ labelBox }) => (labelBox ? [labelBox] : []));
  assert.equal(labels.length, 3);
  for (const [index, label] of labels.entries()) {
    for (const other of labels.slice(index + 1)) assert.ok(!overlaps(label, other), "ラベルどうしが重なっています");
    for (const shape of scene.shapes) assert.ok(!overlaps(label, shape.box), `ラベルが ${shape.id} に重なっています`);
  }
  // 平行な2本のラベルは、2本の外側に上下に分かれる
  const [, , upper, lower] = scene.lines;
  const sides = [upper!, lower!].map(({ labelBox, start }) => Math.sign(labelBox!.y + labelBox!.height / 2 - start.y));
  assert.deepEqual(sides.sort(), [-1, 1]);
});

test("the default gap follows the font size", () => {
  close(DEFAULT_GAP, 16 * 2.5);
});

test("size words pick small, medium (the default) and large shapes", () => {
  const { a, b, c, d } = place("cube a size small\ncube b\ncube c size large\ncube d size medium");
  const side = (shape: typeof a) => (shape!.cy - shape!.y) * 2;
  close(side(a), 28 * 1.3);
  close(side(b), 40 * 1.3);
  close(side(c), 60 * 1.3);
  close(side(d), side(b));
  const scene = layout(parse("parallelogram p size small\nparallelogram q\nparallelogram r size large"));
  assert.deepEqual(
    scene.shapes.map(({ box }) => box.height),
    [36, 48, 60],
  );
});

test("a line drawn into a shape ends inside its front face, and drawn over the shapes", () => {
  const source = "text a\ncube b right of a by 100\na ---o b into b";
  const scene = layout(parse(source));
  const b = scene.shapes[1]!;
  const { end, over } = scene.lines[0]!;
  assert.equal(over, true);
  // 正面は立方体の左下。線は正面の左の縁から 10 入った所で止まる
  const front = { x: b.anchor.x - (40 + 12) / 2, y: b.box.y + 12 };
  close(end.x, front.x + 10);
  assert.ok(end.y > front.y && end.y < front.y + 40);
  const svg = render(source);
  assert.ok(svg.indexOf('data-id="b"') < svg.indexOf('data-line="0"'));
});

test("several lines drawn into one shape end apart from each other", () => {
  const scene = layout(
    parse("cube t\ntext a at -200 -10\ntext b at -200 0\ntext c at -200 10\na ---o t into t\nb ---o t into t\nc ---o t into t"),
  );
  const tips = scene.lines.map(({ end }) => end);
  for (let i = 0; i < tips.length; i++) {
    for (let j = i + 1; j < tips.length; j++) {
      assert.ok(Math.hypot(tips[i]!.x - tips[j]!.x, tips[i]!.y - tips[j]!.y) >= 12 - 1e-9, `${i} と ${j} が近い`);
    }
  }
  const t = scene.shapes[0]!;
  for (const tip of tips) assert.ok(tip.y > t.box.y && tip.y < t.box.y + 52);
});

test("captions sit under the whole drawing, left-aligned unless told otherwise", () => {
  const scene = layout(
    parse('text a\ntext b below a\ncube c right of a\ncaption "左"\ncaption "右" right\ncaption "中" center size large'),
  );
  const bottom = Math.max(...scene.shapes.map(({ box }) => box.y + box.height));
  const left = Math.min(...scene.shapes.map(({ box }) => box.x));
  const right = Math.max(...scene.shapes.map(({ box }) => box.x + box.width));
  const [first, second, third] = scene.captions;
  close(first!.box.y, bottom + 16);
  close(first!.box.x, left);
  close(second!.box.x + second!.box.width, right);
  close(third!.box.x + third!.box.width / 2, (left + right) / 2);
  assert.ok(second!.box.y >= first!.box.y + first!.box.height);
  assert.equal(third!.fontSize, 20);
  close(scene.height, third!.box.y + third!.box.height + PADDING);
  const svg = render('text a\ncaption "x" right size small');
  assert.match(svg, /<g data-caption="0"><text text-anchor="end"[^>]*font-size="12"/);
});

test("a caption wider than the drawing widens it", () => {
  const scene = layout(parse('text a\ncaption "とても長い説明の文がここに入る"'));
  close(scene.width, measureText("とても長い説明の文がここに入る").width + PADDING * 2);
  const alone = layout(parse('caption "文だけ"'));
  close(alone.captions[0]!.box.x, PADDING);
});
