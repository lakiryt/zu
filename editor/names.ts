// 画面に出す日本語の名前
import type { AnnotationKind, BendSide, Direction, Head, Justify, LineStyle, Scale, Shape, Spot } from "../src/index.ts";

export const SHAPE_NAMES: Record<Shape, string> = { text: "文字", parallelogram: "平行四辺形", cube: "立方体", tree: "木" };
export const DIRECTION_NAMES: Record<Direction, string> = { left: "左", right: "右", above: "上", below: "下" };
export const STYLE_NAMES: Record<LineStyle, string> = { solid: "実線", dotted: "点線", double: "二重線" };
export const HEAD_NAMES: Record<Head, string> = {
  none: "なし",
  open: "矢印(V字)",
  filled: "矢印(塗りつぶし)",
  dot: "丸",
};
export const JUSTIFY_NAMES: Record<Justify, string> = { left: "左詰め", center: "中央", right: "右詰め" };
export const SCALE_NAMES: Record<Scale, string> = { small: "小", medium: "中", large: "大" };
// 線の曲げ方。左右は、線の向き(from から to)に進むときの左右
export const BEND_NAMES: Record<BendSide | "none", string> = { none: "まっすぐ", left: "左へ曲げる", right: "右へ曲げる" };

export const ANNOTATION_NAMES: Record<AnnotationKind, string> = { says: "吹き出し(発言)", note: "注記" };

// 注釈の置き場所の選択肢。auto は自動
export const SPOTS = ["auto", "above", "below", "left", "right", "above right", "above left", "below right", "below left"] as const;
export type SpotName = (typeof SPOTS)[number];
export const SPOT_NAMES: Record<SpotName, string> = {
  auto: "自動",
  above: "上",
  below: "下",
  left: "左",
  right: "右",
  "above right": "右上",
  "above left": "左上",
  "below right": "右下",
  "below left": "左下",
};

export function spotName(spot: Spot | null): SpotName {
  if (!spot) return "auto";
  return [spot.vertical, spot.horizontal].filter((word) => word !== null).join(" ") as SpotName;
}

export function spotOf(name: SpotName): Spot | null {
  if (name === "auto") return null;
  const words = name.split(" ");
  const vertical = words.find((word) => word === "above" || word === "below") ?? null;
  const horizontal = words.find((word) => word === "left" || word === "right") ?? null;
  return { vertical: vertical as Spot["vertical"], horizontal: horizontal as Spot["horizontal"] };
}

// of の図形の direction に置く置き方。gap が null なら既定の間
export function describeBeside(of: string, direction: Direction, gap: number | null) {
  return `${of} の${DIRECTION_NAMES[direction]}${gap === null ? "" : `(間 ${gap})`}`;
}
