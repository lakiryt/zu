import { ZuError } from "../errors.ts";
import type { Document, Shape, ShapeStatement } from "../syntax/ast.ts";
import { measureText } from "./measure.ts";

// 図形の外枠。左上の座標と大きさ
export type Box = { x: number; y: number; width: number; height: number };

// 図形ごとの描き方に要る寸法。外枠の中のどこに何を描くかは svg 側で決める
export type Geometry =
  | { shape: "text" }
  | { shape: "parallelogram"; skew: number }
  // 立方体は外枠の上部に描き、ラベルはその下に置く。labelTop は外枠の上端からラベルの上端まで
  | { shape: "cube"; edge: number; depth: number; labelTop: number };

export type PlacedShape = { id: string; label: string; box: Box; geometry: Geometry };

export type Scene = { width: number; height: number; shapes: PlacedShape[] };

export const DEFAULT_GAP = 40;
export const PADDING = 20;
const PARALLELOGRAM = { minWidth: 120, height: 60, padding: 24, skewRatio: 0.5 };
const CUBE = { edge: 60, depthRatio: 0.3, labelGap: 6 };

type Sized = { width: number; height: number; geometry: Geometry };

function sizeOf(statement: ShapeStatement, label: string): Sized {
  const text = measureText(label);
  const shape: Shape = statement.shape;
  if (shape === "text") return { ...text, geometry: { shape } };

  if (shape === "parallelogram") {
    const height = statement.size?.height ?? PARALLELOGRAM.height;
    const skew = height * PARALLELOGRAM.skewRatio;
    const fitted = Math.max(PARALLELOGRAM.minWidth, text.width + PARALLELOGRAM.padding * 2 + skew);
    return { width: statement.size?.width ?? fitted, height, geometry: { shape, skew } };
  }

  const edge = statement.size?.width ?? CUBE.edge;
  const depth = edge * CUBE.depthRatio;
  return {
    width: Math.max(edge + depth, text.width),
    height: edge + depth + CUBE.labelGap + text.height,
    geometry: { shape, edge, depth, labelTop: edge + depth + CUBE.labelGap },
  };
}

type Center = { x: number; y: number };

// 文を図形の外枠に置き換える。置き方は参照をたどって中心の座標を決め、全体を余白の内側へ寄せる
export function layout(document: Document): Scene {
  const statements = document.statements;
  const byId = new Map<string, ShapeStatement>();
  for (const statement of statements) {
    if (byId.has(statement.id)) {
      throw new ZuError(`「${statement.id}」という名前の図形がすでにあります`, statement.at);
    }
    byId.set(statement.id, statement);
  }

  const sizes = new Map(
    statements.map((statement) => [statement.id, sizeOf(statement, statement.label ?? statement.id)]),
  );
  const centers = new Map<string, Center>();
  const resolving = new Set<string>();

  function centerOf(statement: ShapeStatement, index: number): Center {
    const known = centers.get(statement.id);
    if (known) return known;
    if (resolving.has(statement.id)) {
      throw new ZuError(`「${statement.id}」の置き方が循環しています`, statement.at);
    }
    resolving.add(statement.id);

    const { placement } = statement;
    let center: Center;
    if (placement?.kind === "at") {
      center = { x: placement.x, y: placement.y };
    } else {
      // 置き方がなければ、直前の図形の右に置く
      const previous = index > 0 ? statements[index - 1] : undefined;
      const base = placement ? byId.get(placement.of) : previous;
      if (placement && !base) {
        throw new ZuError(`「${placement.of}」という図形はありません`, placement.at);
      }
      if (!base) {
        center = { x: 0, y: 0 };
      } else {
        const from = centerOf(base, statements.indexOf(base));
        const self = sizes.get(statement.id)!;
        const other = sizes.get(base.id)!;
        const gap = placement?.gap ?? DEFAULT_GAP;
        const across = (self.width + other.width) / 2 + gap;
        const down = (self.height + other.height) / 2 + gap;
        const direction = placement?.direction ?? "right";
        center = {
          left: { x: from.x - across, y: from.y },
          right: { x: from.x + across, y: from.y },
          above: { x: from.x, y: from.y - down },
          below: { x: from.x, y: from.y + down },
        }[direction];
      }
    }

    resolving.delete(statement.id);
    centers.set(statement.id, center);
    return center;
  }

  const boxes = statements.map((statement, index) => {
    const { x, y } = centerOf(statement, index);
    const { width, height } = sizes.get(statement.id)!;
    return { x: x - width / 2, y: y - height / 2, width, height };
  });

  // いちばん左上の図形が余白のすぐ内側に来るようずらす
  const shiftX = PADDING - Math.min(Infinity, ...boxes.map((box) => box.x));
  const shiftY = PADDING - Math.min(Infinity, ...boxes.map((box) => box.y));

  const shapes = statements.map((statement, index) => {
    const box = boxes[index]!;
    return {
      id: statement.id,
      label: statement.label ?? statement.id,
      box: { ...box, x: box.x + shiftX, y: box.y + shiftY },
      geometry: sizes.get(statement.id)!.geometry,
    };
  });

  if (shapes.length === 0) return { width: PADDING * 2, height: PADDING * 2, shapes };
  const right = Math.max(...shapes.map(({ box }) => box.x + box.width));
  const bottom = Math.max(...shapes.map(({ box }) => box.y + box.height));
  return { width: right + PADDING, height: bottom + PADDING, shapes };
}
