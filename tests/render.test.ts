import assert from "node:assert/strict";
import { test } from "node:test";
import { ZuError, layout, parse, render } from "../src/index.ts";
import { DEFAULT_GAP, PADDING } from "../src/layout/layout.ts";
import type { PlacedShape } from "../src/layout/layout.ts";
import { tangentAt } from "../src/layout/geometry.ts";
import { controlFor } from "../src/layout/lines.ts";
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
  close(line!.from.point.y, a!.anchor.y);
  close(line!.to.point.y, b!.anchor.y);
  close(line!.from.point.x, a!.box.x + a!.box.width + 6);
  // 立方体はラベルを除いた本体の枠で切る(ラベルの幅は本体より狭い)
  close(line!.to.point.x, b!.anchor.x - (40 + 12) / 2 - 6);
});

test("lines between the same pair are drawn side by side, and labels sit in the middle", () => {
  const scene = layout(parse('text a\ntext b right of a by 200\na ---> b "行き"\nb ---> a'));
  const [go, back] = scene.lines;
  close(Math.abs(go!.from.point.y - back!.from.point.y), 16);
  const middle = (go!.from.point.x + go!.to.point.x) / 2;
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
  fails("text a\na --- x", 2, /「x」という図形や線はありません/);
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
  const { from, to, labelBox } = scene.lines[0]!;
  const [start, end] = [from.point, to.point];
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
  const sides = [upper!, lower!].map(({ labelBox, from }) => Math.sign(labelBox!.y + labelBox!.height / 2 - from.point.y));
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
  const { to, over } = scene.lines[0]!;
  const end = to.point;
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
  const tips = scene.lines.map(({ to }) => to.point);
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

test("a cube or parallelogram without a label draws none, and a cube shrinks to its body", () => {
  const { a, b, c } = place("cube a\ncube b below a\nparallelogram c");
  close(a!.height, 40 * 1.3);
  // 下の図形は、ラベルのない立方体の本体から既定の間で置く
  close(b!.y - (a!.y + a!.height), DEFAULT_GAP);
  close(c!.height, 48);
  const svg = render('cube a\nparallelogram b ""\ntext t');
  const group = (id: string) => svg.match(new RegExp(`<g data-id="${id}">(.*?)</g>`))?.[1] ?? "";
  assert.doesNotMatch(group("a"), /<text/);
  assert.doesNotMatch(group("b"), /<text/);
  // text はラベルを省くと名前を書く
  assert.match(group("t"), />t<\/tspan>/);
});

test("a line pointed at a named line stops at its label when the label sits on it", () => {
  const source = 'text b\ntext c right of b by 200\ntext x above b\nb ---> c "詐害行為" on as f\nx ---> f "取消"';
  const [f, onto] = layout(parse(`${source} into f`)).lines;
  assert.equal(f!.id, "f");
  assert.equal(onto!.to.id, "f");
  const label = f!.labelBox!;
  // x は左上から来るので、into なら下地の上の縁の 1 手前で止まる
  assert.ok(onto!.to.point.x > label.x && onto!.to.point.x < label.x + label.width);
  close(onto!.to.point.y, label.y - 1);
  // into がなければ、図形と同じく 6 手前で止まる
  const [, short] = layout(parse(source)).lines;
  close(short!.to.point.y, label.y - 6);
});

test("a label sits beside its line by default: above a level line, right of an upright one, away from later lines", () => {
  const level = layout(parse('text a\ntext b right of a by 200\na ---> b "α"')).lines[0]!;
  const box = level.labelBox!;
  assert.ok(box.y + box.height < level.from.point.y, "横向きの線のラベルは上");
  // 脇のラベルの下地は字にほぼぴったりで、線から 3 の所に置く(線に重ねるときより小さい)
  close(box.y + box.height, level.from.point.y - 3);
  close(box.x + box.width / 2, (level.from.point.x + level.to.point.x) / 2);
  const upright = layout(parse('text a\ntext b below a by 120\nb ---> a "α"')).lines[0]!;
  assert.ok(upright.labelBox!.x > upright.from.point.x, "縦向きの線のラベルは右");
  // 後から上へ曲げて向けた線があれば、ラベルは下へ
  const scene = layout(parse('text a\ntext b right of a by 200\na ---> b "α" as f\nb ---> f bend right large'));
  const [f] = scene.lines;
  assert.ok(f!.labelBox!.y > f!.from.point.y, "曲げた線を避けて下");
  // on なら線に重ねる
  const on = layout(parse('text a\ntext b right of a by 200\na ---> b "α" on')).lines[0]!;
  close(on.labelBox!.y + on.labelBox!.height / 2, on.from.point.y);
  assert.ok(on.labelBox!.height > box.height && on.labelBox!.width > box.width);
});

test("a line pointed at an unlabelled line touches its middle with into, and ends on one line are spread apart", () => {
  const scene = layout(
    parse("text p\ntext q right of p by 200\np --- q as g\ntext r below p by 80\ntext s below q by 80\nr ---> g into g\ns ---> g into g"),
  );
  const [g, fromR, fromS] = scene.lines;
  const y = g!.from.point.y;
  close(fromR!.to.point.y, y + 1.5);
  close(fromS!.to.point.y, y + 1.5);
  // into がなければ触れずに、線の中心から 10 手前で止まる。二重線へ into なら、2本の間まで入る
  const apart = layout(parse("text p\ntext q right of p by 200\np === q as g\ntext r below p by 80\nr ---> g")).lines[1]!;
  close(apart.to.point.y, y + 10);
  const inside = layout(parse("text p\ntext q right of p by 200\np === q as g\ntext r below p by 80\nr ---> g into g")).lines[1]!;
  close(inside.to.point.y, y);
  // 中点の両側に、r の側が左になるよう 12 以上離れる
  const middle = (g!.from.point.x + g!.to.point.x) / 2;
  assert.ok(fromS!.to.point.x - fromR!.to.point.x >= 12);
  close((fromR!.to.point.x + fromS!.to.point.x) / 2, middle);
});

test("lines pointed at lines report what cannot be done", () => {
  fails("text a\ntext b\na --- b as a", 3, /「a」という名前の図形がすでにあります/);
  fails("text a\ntext b\na --- b as f\nb --- a as f", 4, /「f」という名前の線がすでにあります/);
  fails("text a\ntext b\na --- b as f\na --- g as g", 4, /線をその線自身に向けることはできません/);
  fails("text a\ntext b\na --- g as f\na --- f as g", 3, /線の向ける先が循環しています/);
  fails("text a\ntext b\na --- b as f\ntext c below f", 4, /「f」は線です\(置き方の基準には図形を書きます\)/);
  fails("text a\ntext b\na --- b as f\nalign row a f", 4, /「f」は線です\(揃えには図形を書きます\)/);
});

test("bend left bulges to the left of the way, as seen walking from one end to the other", () => {
  const control = (source: string) => layout(parse(source)).lines[0]!.control!;
  const east = layout(parse("text a\ntext c right of a by 200\na ---> c bend left"));
  const { from, to } = east.lines[0]!;
  // 右へ進む線の左は上
  assert.ok(control("text a\ntext c right of a by 200\na ---> c bend left").y < from.point.y);
  // 同じ left でも、左へ進む線では下
  assert.ok(control("text a\ntext c right of a by 200\nc ---> a bend left").y > from.point.y);
  // 下へ進む線の左は右(東)
  const down = layout(parse("text a\ntext b below a by 200\na ---> b bend left")).lines[0]!;
  assert.ok(down.control!.x > down.from.point.x);
  assert.ok(to.point.x > from.point.x);
  // 本体の中心どうしを結ぶ弧が、端で弦となす角は既定で 30°(図形の手前で切るので、引いた弧の端では少し浅い)
  const apex = controlFor({ x: 0, y: 0 }, { x: 200, y: 0 }, { side: "left", scale: null })!;
  close(apex.x, 100);
  close(Math.atan2(-apex.y, 100) * (180 / Math.PI), 30);
  // large は small より大きくふくらむ
  assert.ok(
    control("text a\ntext c right of a by 200\na ---> c bend left large").y <
      control("text a\ntext c right of a by 200\na ---> c bend left small").y,
  );
});

test("a bent line keeps its label on the bulge, is not shifted aside, and is drawn as a curve", () => {
  // 大きな立方体なら、2本の端は離れているので、端を離す決まりは働かない
  const scene = layout(parse('cube a size large\ncube c right of a by 200 size large\na ---> c\na ---> c "上" on bend left large'));
  const [straight, bent] = scene.lines;
  // まっすぐな線は1本だけなので、ずらさない
  close(straight!.from.point.y, scene.shapes[0]!.anchor.y);
  close(straight!.to.point.y, scene.shapes[1]!.anchor.y);
  // ラベルは弧の頂点(線の上)
  const { from, to, control } = bent!;
  const apex = { x: (from.point.x + 2 * control!.x + to.point.x) / 4, y: (from.point.y + 2 * control!.y + to.point.y) / 4 };
  const box = bent!.labelBox!;
  close(box.x + box.width / 2, apex.x);
  close(box.y + box.height / 2, apex.y);
  // 図の範囲は弧の頂点を含む
  assert.ok(box.y >= PADDING - 1e-9);
  assert.match(render('text a\ntext c right of a by 200\na ===> c bend left'), /<path d="M[^"]+ Q[^"]+"[^>]*\/>.*<path d="M/);
});

test("ends arriving at one shape from close directions are kept apart, so the arrows stay separate", () => {
  const scene = layout(parse("text p\ntext q right of p by 200\ntext r below p by 60\np ---> q\nr ---> q bend left"));
  const [first, second] = scene.lines;
  const gap = Math.hypot(first!.to.point.x - second!.to.point.x, first!.to.point.y - second!.to.point.y);
  assert.ok(gap >= 14 - 1e-9, `矢先の間が ${gap}`);
  // 離した端は、線が入ってくる向きの順に並ぶので、線どうしはまたがない。
  // 下から弧で来る線は、横から来る線の下に着き、出るときも縦の線の右(弧の進む側)から出る
  const order = layout(
    parse('text Q "あいうQ"\ntext R\ntext P below of Q\nP ---> Q "かきくけこ"\nQ --->> R "さしすせそ"\nP --->> R "123" bend left'),
  );
  const [up, across, arc] = order.lines;
  assert.ok(arc!.to.point.y > across!.to.point.y, "弧は横の線の下に着く");
  assert.ok(arc!.from.point.x > up!.from.point.x, "弧は縦の線の右から出る");
  // 横の線の下に着く弧の矢先は、横の線と平行でなく、上向きに図形のほうへ寄る
  const path = { start: arc!.from.point, control: arc!.control, end: arc!.to.point };
  const arriving = tangentAt(path, 1);
  assert.ok(arriving.x > 0 && arriving.y < -0.05, `矢先の向き ${JSON.stringify(arriving)}`);
  // 曲げ直しても、曲がる向きは途中で変わらず(S 字にならず)、元の弧と同じ側(左)へふくらむ
  const turns = [0, 0.25, 0.5, 0.75].map((t) => {
    const a = tangentAt(path, t);
    const b = tangentAt(path, t + 0.25);
    return a.x * b.y - a.y * b.x;
  });
  // SVG の座標(y が下向き)では、右へ曲がり続ける(左へふくらむ)と正
  assert.ok(turns.every((turn) => turn > 0), `曲がり ${turns}`);
  // 小さな図形に多く来ても、枠を広げて離す
  const crowd = layout(
    parse("text q\ntext a at -200 -60\ntext b at -200 -20\ntext c at -200 20\ntext d at -200 60\ntext e at -200 0\na ---> q\nb ---> q\nc ---> q\nd ---> q\ne ---> q"),
  );
  const tips = crowd.lines.map(({ to }) => to.point);
  for (let i = 0; i < tips.length; i++) {
    for (let j = i + 1; j < tips.length; j++) {
      assert.ok(Math.hypot(tips[i]!.x - tips[j]!.x, tips[i]!.y - tips[j]!.y) >= 10, `${i} と ${j} が近い`);
    }
  }
});

test("lines pointed at lines do not widen the gap between shapes", () => {
  const { b, c } = place('text b\ntext c right of b\nb --- c as f\ntext x above b\nx ---> f "とても長いラベルを付けた線"');
  close(c!.x - (b!.x + b!.width), DEFAULT_GAP);
});

test("a remark sits in a bubble above and to the right, with its tail toward the shape", () => {
  const scene = layout(parse('text a "本人"\na says "売ります"'));
  const [shape] = scene.shapes;
  const [bubble] = scene.annotations;
  assert.equal(bubble!.annotation, "says");
  // 右上: 吹き出しの下端は図形の外枠の上端より尾の分上、左端は図形の中心
  close(bubble!.box.y + bubble!.box.height, shape!.box.y - 12);
  close(bubble!.box.x, shape!.anchor.x);
  // 尾は吹き出しの下の縁から出て、図形の手前で止まる
  const { base, tip } = bubble!.tail!;
  close(base[0].y, bubble!.box.y + bubble!.box.height);
  assert.ok(tip.y < shape!.box.y && tip.y > base[0].y);
  const svg = render('text a "本人"\na says "売ります"');
  assert.match(svg, /<g data-annotation="0" data-target="a"><rect [^>]*rx="8"[^>]*\/><polygon [^>]*\/><polyline /);
});

test("notes sit under the shape in small type, one under another, and avoid lines", () => {
  const scene = layout(parse('text b "債務者"\nb note "無資力"\nb note "悪意"'));
  const [shape] = scene.shapes;
  const [first, second] = scene.annotations;
  assert.equal(first!.fontSize, 12);
  assert.equal(first!.tail, null);
  close(first!.box.y, shape!.box.y + shape!.box.height + 3);
  close(first!.box.x + first!.box.width / 2, shape!.anchor.x);
  close(second!.box.y, first!.box.y + first!.box.height + 1);
  // 下に線があれば、次の候補(右)へ
  const crowded = layout(parse('text b "債務者"\ntext d below b\nb --- d\nb note "無資力"'));
  const note = crowded.annotations[0]!;
  const b = crowded.shapes[0]!;
  close(note.box.x, b.box.x + b.box.width + 3);
  // 置き場所を書けば、そこに置く
  const leftScene = layout(parse('text b "債務者"\nb note "無資力" left'));
  const left = leftScene.annotations[0]!;
  close(left.box.x + left.box.width, leftScene.shapes[0]!.box.x - 3);
  // 注記は小さな字だけ(枠や下地を描かない)
  assert.match(render('text b\nb note "無資力"'), /<g data-annotation="0" data-target="b"><text [^>]*font-size="12"><tspan[^>]*>無資力<\/tspan><\/text><\/g>/);
});

test("annotations name a shape", () => {
  fails('text a\nx says "y"', 2, /「x」という図形はありません/);
  fails('text a\ntext b\na --- b as f\nf note "y"', 4, /「f」は線です\(注釈は図形に付けます\)/);
});
