// 配置の段の入口。構文木から図形の外枠と線を決め、全体を余白の内側へ寄せる。SVG は知らない
import { ZuError } from "../errors.ts";
import type { Document, ShapeStatement, SourcePosition } from "../syntax/ast.ts";
import { placeCaptions } from "./captions.ts";
import type { PlacedCaption } from "./captions.ts";
import { pointAt, union } from "./geometry.ts";
import type { Box, Point } from "./geometry.ts";
import { placeLines } from "./lines.ts";
import type { PlacedLine } from "./lines.ts";
import { solvePositions } from "./position.ts";
import { frameAt, labelOf, sizeOf } from "./size.ts";
import type { Geometry } from "./size.ts";

export type { PlacedCaption } from "./captions.ts";
export type { Box, Path, Point } from "./geometry.ts";
export type { PlacedEnd, PlacedLine } from "./lines.ts";
export { DEFAULT_GAP, defaultGap } from "./position.ts";
export type { Geometry } from "./size.ts";

// anchor は図形の本体(ラベルを除く)の中心。at、相対配置の揃え、align はこの点で決まる
// label は図形に書くラベル(なければ null)
export type PlacedShape = { id: string; label: string | null; box: Box; anchor: Point; geometry: Geometry };

// origin は書いた座標の (0, 0) が図のどこに来たか。全体を余白の内側へずらした量でもある
export type Scene = {
  width: number;
  height: number;
  origin: Point;
  shapes: PlacedShape[];
  lines: PlacedLine[];
  captions: PlacedCaption[];
};

export const PADDING = 20;

export function layout(document: Document): Scene {
  const statements = document.statements.filter((statement) => statement.kind === "shape");
  const byId = indexShapes(document, statements);

  const sizes = new Map(statements.map((statement) => [statement.id, sizeOf(statement)]));
  const anchors = solvePositions(document, statements, byId, sizes);
  const placed = statements.map((statement) => {
    const size = sizes.get(statement.id)!;
    const anchor = anchors.get(statement.id)!;
    return { statement, geometry: size.geometry, anchor, ...frameAt(size, anchor) };
  });

  const lines = placeLines(
    document.statements.filter((statement) => statement.kind === "line"),
    new Map(placed.map(({ statement, anchor, box, body, inner }) => [statement.id, { id: statement.id, anchor, box, body, inner }])),
  );

  // 図形と線(端、弧の頂点、ラベルの下地)の範囲。図の下の文はその下に置く
  const figure = union([
    ...placed.map(({ box }) => box),
    ...lines.flatMap(({ from, to, controls, labelBox }) => [
      pointBox(from.point),
      pointBox(to.point),
      ...(controls ? [pointBox(pointAt({ start: from.point, controls, end: to.point }, 0.5))] : []),
      ...(labelBox ? [labelBox] : []),
    ]),
  ]);
  const captions = placeCaptions(
    document.statements.filter((statement) => statement.kind === "caption"),
    figure,
  );
  const extent = union([...(figure ? [figure] : []), ...captions.map(({ box }) => box)]) ?? { x: 0, y: 0, width: 0, height: 0 };

  // いちばん左上のものが余白のすぐ内側に来るようずらす
  const origin = { x: PADDING - extent.x, y: PADDING - extent.y };
  const shift = <T extends Point>(point: T): T => ({ ...point, x: point.x + origin.x, y: point.y + origin.y });

  return {
    width: extent.width + PADDING * 2,
    height: extent.height + PADDING * 2,
    origin,
    shapes: placed.map(({ statement, geometry, anchor, box }) => ({
      id: statement.id,
      label: labelOf(statement),
      box: shift(box),
      anchor: shift(anchor),
      geometry,
    })),
    lines: lines.map((line) => ({
      ...line,
      from: { ...line.from, point: shift(line.from.point) },
      to: { ...line.to, point: shift(line.to.point) },
      controls: line.controls && [shift(line.controls[0]), shift(line.controls[1])],
      labelBox: line.labelBox && shift(line.labelBox),
    })),
    captions: captions.map((caption) => ({ ...caption, box: shift(caption.box) })),
  };
}

// 名前で引けるようにする。名前の重なりと、置き方や揃えの参照先がない(か線である)ものは誤り
function indexShapes(document: Document, statements: ShapeStatement[]) {
  const byId = new Map<string, ShapeStatement>();
  for (const statement of statements) {
    if (byId.has(statement.id)) {
      throw new ZuError(`「${statement.id}」という名前の図形がすでにあります`, statement.at);
    }
    byId.set(statement.id, statement);
  }
  const lines = new Set(document.statements.flatMap((statement) => (statement.kind === "line" && statement.id !== null ? [statement.id] : [])));
  const refer = (id: string, at: SourcePosition, use: string) => {
    if (byId.has(id)) return;
    if (lines.has(id)) throw new ZuError(`「${id}」は線です(${use}には図形を書きます)`, at);
    throw new ZuError(`「${id}」という図形はありません`, at);
  };
  for (const { placement } of statements) {
    if (placement?.kind === "beside") refer(placement.of, placement.at, "置き方の基準");
  }
  for (const statement of document.statements) {
    if (statement.kind === "align") for (const { id, at } of statement.members) refer(id, at, "揃え");
  }
  return byId;
}

const pointBox = (point: Point): Box => ({ ...point, width: 0, height: 0 });
