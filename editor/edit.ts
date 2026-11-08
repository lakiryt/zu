// .zu の文字を、文の単位で書き換える。DOM を知らないので Node でも試せる
import { print } from "../src/index.ts";
import type { Arrow, Document, LineStatement, ShapeStatement, SourcePosition, Statement } from "../src/index.ts";

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

export function replaceShape(text: string, document: Document, next: ShapeStatement) {
  return rewrite(text, document, (statement) =>
    statement.kind === "shape" && statement.id === next.id ? next : undefined,
  );
}

export function append(text: string, statement: Statement) {
  const base = text === "" || text.endsWith("\n") ? text : `${text}\n`;
  return `${base}${print(statement)}\n`;
}

export function shapes(document: Document) {
  return document.statements.filter((statement) => statement.kind === "shape");
}

export function findShape(document: Document, id: string) {
  return shapes(document).find((statement) => statement.id === id);
}

export function freshId(document: Document, base = "図形") {
  const used = new Set(shapes(document).map(({ id }) => id));
  for (let n = 1; ; n++) if (!used.has(`${base}${n}`)) return `${base}${n}`;
}

// 図の操作が書き換えにならなかったときの誤り。文字の誤り(ZuError)と違い、行と列を持たない
export class EditError extends Error {
  override readonly name = "EditError";
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
export function usesNumbers(statement: ShapeStatement) {
  const { placement, size } = statement;
  const sized = size !== null && typeof size !== "string";
  return placement?.kind === "at" || (placement?.kind === "beside" && placement.gap !== null) || sized;
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

// 名前を変え、参照している置き方、揃え、線も書き換える
export function rename(text: string, document: Document, from: string, to: string) {
  return rewrite(text, document, (statement) => {
    if (statement.kind === "align") {
      if (!statement.members.some(({ id }) => id === from)) return undefined;
      return { ...statement, members: statement.members.map((m) => (m.id === from ? { ...m, id: to } : m)) };
    }
    if (statement.kind === "line") {
      if (statement.from.id !== from && statement.to.id !== from) return undefined;
      const swap = (end: LineStatement["from"]) => (end.id === from ? { ...end, id: to } : end);
      return { ...statement, from: swap(statement.from), to: swap(statement.to) };
    }
    const own = statement.id === from;
    const refers = statement.placement?.kind === "beside" && statement.placement.of === from;
    if (!own && !refers) return undefined;
    return {
      ...statement,
      id: own ? to : statement.id,
      placement:
        refers && statement.placement?.kind === "beside" ? { ...statement.placement, of: to } : statement.placement,
    };
  });
}

// 揃えを足す。同じ向きの揃えに既に入っている図形があれば、その揃えに加える
export function addAlign(text: string, document: Document, axis: "row" | "column", ids: string[]) {
  const existing = document.statements.find(
    (statement) => statement.kind === "align" && statement.axis === axis && statement.members.some((m) => ids.includes(m.id)),
  );
  if (existing && existing.kind === "align") {
    const have = new Set(existing.members.map((m) => m.id));
    const added = ids.filter((id) => !have.has(id)).map((id) => ({ id, at: existing.at }));
    if (added.length === 0) return text;
    return rewrite(text, document, (statement) =>
      statement === existing ? { ...existing, members: [...existing.members, ...added] } : undefined,
    );
  }
  const at = { line: 0, column: 0 };
  return append(text, { kind: "align", axis, members: ids.map((id) => ({ id, at })), at, end: at });
}

// 揃えから外す。残りが1つになった揃えは消す
export function leaveAlign(text: string, document: Document, axis: "row" | "column", id: string) {
  return rewrite(text, document, (statement) => {
    if (statement.kind !== "align" || statement.axis !== axis) return undefined;
    if (!statement.members.some((m) => m.id === id)) return undefined;
    const members = statement.members.filter((m) => m.id !== id);
    return members.length < 2 ? null : { ...statement, members };
  });
}

// 文字の位置(行)にある図形の名前
export function shapeAtLine(document: Document, line: number) {
  return shapes(document).find((statement) => statement.at.line === line)?.id ?? null;
}

// --- 線 ---

export function lines(document: Document) {
  return document.statements.filter((statement) => statement.kind === "line");
}

// 線は名前を持たないので、書いた順の番号で指す(図の data-line と同じ番号)
export function addLine(text: string, from: string, to: string) {
  const at = { line: 0, column: 0 };
  const arrow: Arrow = { style: "solid", start: "none", end: "none" };
  return append(text, { kind: "line", from: { id: from, at, into: false }, to: { id: to, at, into: false }, arrow, label: null, at, end: at });
}

export function replaceLine(text: string, document: Document, index: number, next: LineStatement | null) {
  const target = lines(document)[index];
  return rewrite(text, document, (statement) => (statement === target ? next : undefined));
}

// 文字の位置(行)にある線の番号
export function lineAtLine(document: Document, line: number) {
  const index = lines(document).findIndex((statement) => statement.at.line === line);
  return index === -1 ? null : index;
}
