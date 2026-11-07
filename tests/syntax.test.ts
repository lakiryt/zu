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
        size: { width: 50, height: null },
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
