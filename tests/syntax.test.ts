import assert from "node:assert/strict";
import { test } from "node:test";
import { ZuError } from "../src/errors.ts";
import { tokenize } from "../src/syntax/lexer.ts";
import { parse } from "../src/syntax/parser.ts";
import type { ShapeStatement } from "../src/syntax/ast.ts";
import { print } from "../src/syntax/print.ts";

const kinds = (source: string) => tokenize(source).map(({ type, value }) => `${type}:${value}`);

test("source is split into words, strings and numbers, dropping comments", () => {
  assert.deepEqual(kinds('text 本人 "A\\n\\"B\\"" at -12.5, 3 %% comment\n'), [
    "word:text",
    "word:本人",
    'string:A\n"B"',
    "word:at",
    "number:-12.5",
    "comma:,",
    "number:3",
    "newline:\n",
    "eof:",
  ]);
});

function assertError(source: string, line: number, column: number, reason: RegExp) {
  assert.throws(
    () => parse(source),
    (error: unknown) =>
      error instanceof ZuError && error.line === line && error.column === column && reason.test(error.reason),
  );
}

test("lexical errors point at the place", () => {
  assertError('text a "閉じない\n', 1, 8, /閉じていません/);
  assertError('text a "\\t"', 1, 10, /使えません/);
  assertError("text a\ntext b @", 2, 8, /「@」は使えません/);
});

test("a statement holds the shape, name, label, placement and size", () => {
  const { statements } = parse(
    '%% 図\n\ntext a "本人" at 10 20\ncube b right of a by 30 size 50\nparallelogram c below a',
  );
  assert.deepEqual(
    statements.map((statement) => {
      assert.equal(statement.kind, "shape");
      const { at: _, end: __, ...rest } = statement as ShapeStatement;
      return { ...rest, placement: rest.placement && { ...rest.placement, at: undefined } };
    }),
    [
      { kind: "shape", shape: "text", id: "a", label: "本人", placement: { kind: "at", x: 10, y: 20, at: undefined }, size: null },
      {
        kind: "shape",
        shape: "cube",
        id: "b",
        label: null,
        placement: { kind: "beside", direction: "right", of: "a", gap: 30, at: undefined },
        size: { kind: "numbers", width: 50, height: null },
      },
      {
        kind: "shape",
        shape: "parallelogram",
        id: "c",
        label: null,
        placement: { kind: "beside", direction: "below", of: "a", gap: null, at: undefined },
        size: null,
      },
    ],
  );
  assert.deepEqual(statements[1]!.at, { line: 4, column: 1 });
});

test("a shape named of can still be referred to", () => {
  const [, second] = parse("text of\ntext b below of of").statements;
  assert.equal(second?.kind === "shape" && second.placement?.kind === "beside" && second.placement.of, "of");
});

test("an align statement lists the axis and the shapes with their places", () => {
  const [statement] = parse("align row b  land item").statements;
  assert.deepEqual(statement, {
    kind: "align",
    axis: "row",
    members: [
      { id: "b", at: { line: 1, column: 11 } },
      { id: "land", at: { line: 1, column: 14 } },
      { id: "item", at: { line: 1, column: 19 } },
    ],
    at: { line: 1, column: 1 },
    end: { line: 1, column: 23 },
  });
  assert.equal(parse("align column a b").statements[0]?.kind, "align");
});

test("align errors name what was expected", () => {
  assertError("align a b", 1, 7, /揃え方は row か column です/);
  assertError("align", 1, 6, /揃え方\(row か column\)が必要です/);
  assertError("align row a", 1, 12, /2つ以上/);
  assertError('align row a "b"', 1, 13, /揃える図形の名前が必要です/);
});

test("syntax errors name what was expected", () => {
  assertError("circle a", 1, 1, /「circle」という図形はありません/);
  assertError("text", 1, 5, /図形の名前が必要です/);
  assertError("text a at 1", 1, 12, /y 座標が必要です/);
  assertError("text a at 1 2 below b", 1, 15, /置き方は1つの図形に1つまでです/);
  assertError("text a color red", 1, 8, /「color」は使えません/);
});

test("a statement ends before a trailing comment", () => {
  const [statement] = parse('text a "本人" below b %% メモ\n').statements;
  assert.deepEqual(statement?.end, { line: 1, column: 20 });
});

test("printing a statement gives back the same statement", () => {
  const sources = [
    'text a "本人\\n(\\"A\\")" at 10 -20.5',
    "cube b right of a by 30 size 50",
    "parallelogram c below of of size 120 40",
    "text d",
    "align column a b c",
  ];
  for (const source of sources) {
    const [statement] = parse(source).statements;
    const [again] = parse(print(statement!)).statements;
    const strip = (value: unknown) => JSON.stringify(value, (key, inner) => (key === "at" || key === "end" ? undefined : inner));
    assert.equal(strip(again), strip(statement), source);
  }
  assert.equal(print(parse("text a right a").statements[0]!), "text a right of a");
});

test("arrows are read as one token and turned into style and heads", () => {
  const arrows = (source: string) =>
    parse(source).statements.map((statement) =>
      statement.kind === "line" ? { style: statement.style, start: statement.from.head, end: statement.to.head } : null,
    );
  assert.deepEqual(arrows("a --- b\na -.-> b\na ===>> b\na <---o b\na o-..-o b\na -- b"), [
    { style: "solid", start: "none", end: "none" },
    { style: "dotted", start: "none", end: "open" },
    { style: "double", start: "none", end: "filled" },
    { style: "solid", start: "open", end: "dot" },
    { style: "dotted", start: "dot", end: "dot" },
    { style: "solid", start: "none", end: "none" },
  ]);
  // 名前の o や、数の -40 は線の記号にしない
  assert.deepEqual(kinds("text o at -40 0"), ["word:text", "word:o", "word:at", "number:-40", "number:0", "eof:"]);
});

test("a line statement holds both ends, the arrow and the label", () => {
  const [statement] = parse('a <<--->> b "代理権の授与" %% メモ').statements;
  assert.deepEqual(statement, {
    kind: "line",
    style: "solid",
    from: { id: "a", at: { line: 1, column: 1 }, head: "filled", into: false },
    to: { id: "b", at: { line: 1, column: 11 }, head: "filled", into: false },
    label: "代理権の授与",
    id: null,
    bend: null,
    at: { line: 1, column: 1 },
    end: { line: 1, column: 21 },
  });
  // 図形の種類や align という名前の図形も結べる
  assert.equal(parse("text --- align").statements[0]?.kind, "line");
});

test("line errors name what was expected", () => {
  assertError("a --->", 1, 7, /結ぶ先の図形の名前が必要です/);
  assertError("a ---> b c", 1, 10, /線の文には「c」を書けません/);
  assertError("a ---> b <", 1, 10, /「<」は使えません/);
});

test("into names the ends drawn into their shapes", () => {
  const [line] = parse('a ---o b "x" into b').statements;
  assert.ok(line?.kind === "line" && !line.from.into && line.to.into);
  const [both] = parse("a o---o b into a b").statements;
  assert.ok(both?.kind === "line" && both.from.into && both.to.into);
  assertError("a --- b into c", 1, 14, /「c」はこの線で結ぶ図形ではありません/);
  assertError("a --- b into b b", 1, 16, /「b」は2回挙げています/);
  assertError("a --- b into", 1, 13, /中まで伸ばす図形の名前が必要です/);
});

test("as names a line, written before into", () => {
  const [line] = parse('b ---> c "詐害行為" as f into c').statements;
  assert.ok(line?.kind === "line" && line.id === "f" && line.to.into);
  const [plain] = parse("b ---> c").statements;
  assert.ok(plain?.kind === "line" && plain.id === null);
  assertError("b ---> c as", 1, 12, /線の名前が必要です/);
  assertError("b ---> c into c as f", 1, 17, /as は into より前に書きます/);
});

test("bend curves a line to the left or right of its way, with an optional size", () => {
  const [line] = parse('a ---> c "効果帰属" as f bend left into c').statements;
  assert.ok(line?.kind === "line");
  assert.deepEqual(line.bend, { side: "left", scale: null });
  const [large] = parse("a ---> c bend right large").statements;
  assert.ok(large?.kind === "line");
  assert.deepEqual(large.bend, { side: "right", scale: "large" });
  for (const source of ['a ---> c "x" as f bend left into c', "a --- c bend right small"]) {
    assert.equal(print(parse(source).statements[0]!), source);
  }
  assertError("a ---> c bend above", 1, 15, /曲げる向きは left か right です/);
  assertError("a ---> c bend", 1, 14, /曲げる向き\(left か right\)が必要です/);
  // as と bend の順は問わない。書き出すと as が先
  assert.equal(print(parse("a ---> c bend left as f").statements[0]!), "a ---> c as f bend left");
  assertError("a ---> c bend left bend right", 1, 20, /bend は1つの線に1つまでです/);
  assertError("a ---> c into c bend left", 1, 17, /bend は into より前に書きます/);
});

test("size fits the shape: none for text, one number for a cube", () => {
  assertError("text a size 10", 1, 8, /text には size を書けません/);
  assertError("cube a size 40 50", 1, 13, /cube の size は一辺を1つだけ書きます/);
  assert.equal(parse("parallelogram a size 100 40\ncube b size 40").statements.length, 2);
});

test("size takes a word as well as numbers", () => {
  const [shape] = parse("cube a size small").statements;
  assert.ok(shape?.kind === "shape" && shape.size?.kind === "scale" && shape.size.scale === "small");
  assertError("cube a size huge", 1, 13, /大きさは数か small、medium、large で書きます/);
  assert.equal(print(parse("cube a size large").statements[0]!), "cube a size large");
});

test("printing a line gives back the same line", () => {
  for (const source of ['a -.->> b "x\\ny"', "a o=== b", "a <--- b", "a --- b", 'a ---o b "x" into b', "a o---o b into a b", 'b ---> c "x" as f into c', "x ---> f"]) {
    const [statement] = parse(source).statements;
    assert.equal(print(statement!), source);
  }
});

test("a caption holds its text, alignment and size, and prints back", () => {
  const [caption] = parse('caption "一行目\\n二行目" right size small').statements;
  assert.deepEqual(caption, {
    kind: "caption",
    text: "一行目\n二行目",
    justify: "right",
    size: "small",
    at: { line: 1, column: 1 },
    end: { line: 1, column: 36 },
  });
  for (const source of ['caption "x"', 'caption "x" center', 'caption "x" size large']) {
    assert.equal(print(parse(source).statements[0]!), source);
  }
  // caption という名前の図形も結べる
  assert.equal(parse("caption --- a").statements[0]?.kind, "line");
  assertError("caption", 1, 8, /文\("…"\)が必要です/);
  assertError('caption "x" top', 1, 13, /「top」は使えません/);
  assertError('caption "x" left right', 1, 18, /揃えは1つの文に1つまでです/);
  assertError('caption "x" size 12', 1, 18, /大きさ\(small、medium、large\)が必要です/);
});
