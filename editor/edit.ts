// .zu の文字を、文の単位で書き換える。DOM を知らないので Node でも試せる
import { print } from "../src/index.ts";
import type { Axis, Document, LineEnd, LineStatement, ShapeStatement, SourcePosition, Statement } from "../src/index.ts";

// エディタが作る文の位置。書き出すと print で文字になるので、位置は使わない
export const NOWHERE: SourcePosition = { line: 0, column: 0 };

// 図の操作が書き換えにならなかったときの誤り。文字の誤り(ZuError)と違い、行と列を持たない
export class EditError extends Error {
  override readonly name = "EditError";
}

// --- 文字と文 ---

// 行と列(1から、字は code point で数える)を文字列の添字にする
export function offsetOf(text: string, { line, column }: SourcePosition) {
  const lines = text.split("\n");
  let offset = 0;
  for (let index = 0; index < line - 1 && index < lines.length; index++) offset += lines[index]!.length + 1;
  const current = lines[line - 1] ?? "";
  return offset + [...current].slice(0, column - 1).join("").length;
}

// 文ごとに書き換える。fn が undefined を返せばそのまま、null なら行ごと消す、文を返せば置き換える。
// 後ろの文から書き換えるので、前の文の位置はずれない
export function rewrite(text: string, document: Document, fn: (statement: Statement) => Statement | null | undefined) {
  let result = text;
  for (const statement of [...document.statements].reverse()) {
    const next = fn(statement);
    if (next === undefined) continue;
    if (next === null) {
      const start = offsetOf(result, { line: statement.at.line, column: 1 });
      const lineEnd = result.indexOf("\n", start);
      result = result.slice(0, start) + (lineEnd === -1 ? "" : result.slice(lineEnd + 1));
    } else {
      const start = offsetOf(result, statement.at);
      const end = offsetOf(result, statement.end);
      result = result.slice(0, start) + print(next) + result.slice(end);
    }
  }
  return result;
}

export function append(text: string, statement: Statement) {
  const base = text === "" || text.endsWith("\n") ? text : `${text}\n`;
  return `${base}${print(statement)}\n`;
}

type Of<K extends Statement["kind"]> = Extract<Statement, { kind: K }>;

// kind の文を書いた順に。線と図の下の文は名前を持たないので、この順の番号で指す(図の data-line、data-caption と同じ番号)
export function statementsOf<K extends Statement["kind"]>(document: Document, kind: K): Of<K>[] {
  return document.statements.filter((statement): statement is Of<K> => statement.kind === kind);
}

// kind の文のうち index 番目を next に置き換える。null なら消す
export function replaceNth<K extends Statement["kind"]>(
  text: string,
  document: Document,
  kind: K,
  index: number,
  next: Of<K> | null,
) {
  const target = statementsOf(document, kind)[index];
  return rewrite(text, document, (statement) => (statement === target ? next : undefined));
}

// 文字の位置(行)にある kind の文の番号
export function indexAtLine(document: Document, kind: Statement["kind"], line: number) {
  const index = statementsOf(document, kind).findIndex((statement) => statement.at.line === line);
  return index === -1 ? null : index;
}

// --- 図形 ---

export const shapes = (document: Document) => statementsOf(document, "shape");

export function findShape(document: Document, id: string) {
  return shapes(document).find((statement) => statement.id === id);
}

export function replaceShape(text: string, document: Document, next: ShapeStatement) {
  return rewrite(text, document, (statement) =>
    statement.kind === "shape" && statement.id === next.id ? next : undefined,
  );
}

// 図形と線の名前(線は as で付けたものだけ)。図形と線は同じ名前を使えない
export function names(document: Document) {
  const lines = statementsOf(document, "line").flatMap(({ id }) => (id === null ? [] : [id]));
  return new Set([...shapes(document).map(({ id }) => id), ...lines]);
}

export function freshId(document: Document, base = "図形") {
  const used = names(document);
  for (let n = 1; ; n++) if (!used.has(`${base}${n}`)) return `${base}${n}`;
}

// 位置を決める基準の図形(list は図形の文を書いた順に並べたもの)。
// 置き方がなければ直前の図形。at の図形と最初の図形には基準がない
export function baseOf(list: ShapeStatement[], index: number) {
  const { placement } = list[index]!;
  if (placement?.kind === "at") return null;
  if (placement) return placement.of;
  return list[index - 1]?.id ?? null;
}

// 数を書いている図形か(エディタで印を付ける)
export function usesNumbers({ placement, size }: ShapeStatement) {
  return placement?.kind === "at" || (placement?.kind === "beside" && placement.gap !== null) || size?.kind === "numbers";
}

// id の図形の位置が変わるとついてくる図形(置き方をたどって id に行き着くもの)。
// 置き方のない図形は直前の図形に従う
export function dependents(document: Document, id: string) {
  const list = shapes(document);
  const bases = new Map(list.map((statement, index) => [statement.id, baseOf(list, index)]));
  const result = new Set<string>();
  for (const { id: start } of list) {
    const seen = new Set<string>();
    let current = bases.get(start) ?? null;
    while (current !== null && !seen.has(current)) {
      if (current === id) {
        result.add(start);
        break;
      }
      seen.add(current);
      current = bases.get(current) ?? null;
    }
  }
  result.delete(id);
  return result;
}

// 図形か線の名前を変え、参照している置き方、揃え、線も書き換える
export function rename(text: string, document: Document, from: string, to: string) {
  const swap = <T extends { id: string }>(item: T): T => (item.id === from ? { ...item, id: to } : item);
  return rewrite(text, document, (statement) => {
    switch (statement.kind) {
      case "caption":
        return undefined;
      case "align":
        if (!statement.members.some(({ id }) => id === from)) return undefined;
        return { ...statement, members: statement.members.map(swap) };
      case "line":
        if (statement.from.id !== from && statement.to.id !== from && statement.id !== from) return undefined;
        return {
          ...statement,
          from: swap(statement.from),
          to: swap(statement.to),
          id: statement.id === from ? to : statement.id,
        };
      case "shape": {
        const { placement } = statement;
        const refers = placement?.kind === "beside" && placement.of === from;
        if (statement.id !== from && !refers) return undefined;
        return { ...swap(statement), placement: refers ? { ...placement, of: to } : placement };
      }
    }
  });
}

// 文字の位置(行)にある図形の名前
export function shapeAtLine(document: Document, line: number) {
  return shapes(document).find((statement) => statement.at.line === line)?.id ?? null;
}

// --- 揃え ---

// 揃えを足す。同じ向きの揃えに既に入っている図形があれば、その揃えに加える
export function addAlign(text: string, document: Document, axis: Axis, ids: string[]) {
  const existing = statementsOf(document, "align").find(
    (statement) => statement.axis === axis && statement.members.some((m) => ids.includes(m.id)),
  );
  if (!existing) {
    const members = ids.map((id) => ({ id, at: NOWHERE }));
    return append(text, { kind: "align", axis, members, at: NOWHERE, end: NOWHERE });
  }
  const have = new Set(existing.members.map((m) => m.id));
  const added = ids.filter((id) => !have.has(id)).map((id) => ({ id, at: NOWHERE }));
  if (added.length === 0) return text;
  return rewrite(text, document, (statement) =>
    statement === existing ? { ...existing, members: [...existing.members, ...added] } : undefined,
  );
}

// 揃えから外す。残りが1つになった揃えは消す
export function leaveAlign(text: string, document: Document, axis: Axis, id: string) {
  return rewrite(text, document, (statement) => {
    if (statement.kind !== "align" || statement.axis !== axis) return undefined;
    if (!statement.members.some((m) => m.id === id)) return undefined;
    const members = statement.members.filter((m) => m.id !== id);
    return members.length < 2 ? null : { ...statement, members };
  });
}

// --- 線と図の下の文 ---

const lineEnd = (id: string, head: LineEnd["head"] = "none"): LineEnd => ({ id, at: NOWHERE, head, into: false });

export function addLine(text: string, from: string, to: string) {
  return append(text, {
    kind: "line",
    style: "solid",
    from: lineEnd(from),
    to: lineEnd(to),
    label: null,
    id: null,
    at: NOWHERE,
    end: NOWHERE,
  });
}

// 図形 from から index 番目の線へ矢印を引く。線に名前がなければ付ける。新しい線は最後の線になる
export function pointAtLine(text: string, document: Document, from: string, index: number) {
  const target = statementsOf(document, "line")[index];
  if (!target) return text;
  const name = target.id ?? freshId(document, "線");
  const named = target.id === null ? replaceNth(text, document, "line", index, { ...target, id: name }) : text;
  return append(named, {
    kind: "line",
    style: "solid",
    from: lineEnd(from),
    to: lineEnd(name, "open"),
    label: null,
    id: null,
    at: NOWHERE,
    end: NOWHERE,
  });
}

// ids(図形か線の名前)を消すと一緒に消える線。ids に結んだ線と、その線に向けた線(をたどったもの)
export function attachedLines(document: Document, ids: Iterable<string>) {
  const gone = new Set(ids);
  const result = new Set<LineStatement>();
  for (let grew = true; grew; ) {
    grew = false;
    for (const line of statementsOf(document, "line")) {
      if (result.has(line) || !(gone.has(line.from.id) || gone.has(line.to.id))) continue;
      result.add(line);
      if (line.id !== null) gone.add(line.id);
      grew = true;
    }
  }
  return result;
}

// index 番目の線を消す。その線に向けた線も消す
export function removeLine(text: string, document: Document, index: number) {
  const target = statementsOf(document, "line")[index];
  if (!target) return text;
  const doomed = target.id === null ? new Set<LineStatement>() : attachedLines(document, [target.id]);
  doomed.add(target);
  return rewrite(text, document, (statement) => (statement.kind === "line" && doomed.has(statement) ? null : undefined));
}

// 名前を付けた線に、ほかの線が向いているか
export const isPointedAt = (document: Document, name: string) =>
  statementsOf(document, "line").some(({ from, to }) => from.id === name || to.id === name);

export function addCaption(text: string, caption: string) {
  return append(text, { kind: "caption", text: caption, justify: null, size: null, at: NOWHERE, end: NOWHERE });
}
