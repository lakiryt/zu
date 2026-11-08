// 配置の段の入口。構文木から図形の外枠と線を決め、全体を余白の内側へ寄せる。SVG は知らない
import { ZuError } from "../errors.ts";
import type { Document, ShapeStatement } from "../syntax/ast.ts";
import type { Box, Point } from "./geometry.ts";
import { placeLines } from "./lines.ts";
import type { PlacedLine } from "./lines.ts";
import { solvePositions } from "./position.ts";
import { bodyOf, boxAt, innerOf, sizeOf } from "./size.ts";
import type { Geometry } from "./size.ts";

export type { Box, Point } from "./geometry.ts";
export type { PlacedLine } from "./lines.ts";
export { DEFAULT_GAP, defaultGap } from "./position.ts";
export type { Geometry } from "./size.ts";

// anchor は図形の本体(ラベルを除く)の中心。at、相対配置の揃え、align はこの点で決まる
export type PlacedShape = { id: string; label: string; box: Box; anchor: Point; geometry: Geometry };

// origin は書いた座標の (0, 0) が図のどこに来たか。全体を余白の内側へずらした量でもある
export type Scene = { width: number; height: number; origin: Point; shapes: PlacedShape[]; lines: PlacedLine[] };

export const PADDING = 20;

export function layout(document: Document): Scene {
  const statements = document.statements.filter((statement) => statement.kind === "shape");

  const byId = new Map<string, ShapeStatement>();
  for (const statement of statements) {
    if (byId.has(statement.id)) {
      throw new ZuError(`「${statement.id}」という名前の図形がすでにあります`, statement.at);
    }
    byId.set(statement.id, statement);
  }
  for (const { placement } of statements) {
    if (placement?.kind === "beside" && !byId.has(placement.of)) {
      throw new ZuError(`「${placement.of}」という図形はありません`, placement.at);
    }
  }

  const sizes = new Map(statements.map((statement) => [statement.id, sizeOf(statement)]));
  const anchors = solvePositions(document, statements, byId, sizes);

  const placed = statements.map((statement) => {
    const size = sizes.get(statement.id)!;
    const anchor = anchors.get(statement.id)!;
    return { statement, size, anchor, box: boxAt(size, anchor) };
  });

  const lines = placeLines(
    document.statements.filter((statement) => statement.kind === "line"),
    new Map(
      placed.map(({ statement, size, anchor, box }) => {
        const body = bodyOf(size, anchor, box);
        return [statement.id, { id: statement.id, anchor, body, inner: innerOf(size, body), box }];
      }),
    ),
  );

  // 図の範囲は、図形の外枠と、線の端と、線のラベルの下地が入る大きさ
  const extents: Box[] = [
    ...placed.map(({ box }) => box),
    ...lines.flatMap(({ start, end, labelBox }) => [
      { x: start.x, y: start.y, width: 0, height: 0 },
      { x: end.x, y: end.y, width: 0, height: 0 },
      ...(labelBox ? [labelBox] : []),
    ]),
  ];
  if (extents.length === 0) {
    return { width: PADDING * 2, height: PADDING * 2, origin: { x: PADDING, y: PADDING }, shapes: [], lines: [] };
  }

  // いちばん左上のものが余白のすぐ内側に来るようずらす
  const shiftX = PADDING - Math.min(...extents.map((box) => box.x));
  const shiftY = PADDING - Math.min(...extents.map((box) => box.y));
  const shift = <T extends Point>(point: T): T => ({ ...point, x: point.x + shiftX, y: point.y + shiftY });

  const shapes = placed.map(({ statement, size, anchor, box }) => ({
    id: statement.id,
    label: statement.label ?? statement.id,
    box: shift(box),
    anchor: shift(anchor),
    geometry: size.geometry,
  }));
  const shiftedLines = lines.map((line) => ({
    ...line,
    start: shift(line.start),
    end: shift(line.end),
    labelBox: line.labelBox && shift(line.labelBox),
  }));

  const right = Math.max(...extents.map((box) => box.x + box.width)) + shiftX;
  const bottom = Math.max(...extents.map((box) => box.y + box.height)) + shiftY;
  return {
    width: right + PADDING,
    height: bottom + PADDING,
    origin: { x: shiftX, y: shiftY },
    shapes,
    lines: shiftedLines,
  };
}
