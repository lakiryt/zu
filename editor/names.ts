// 画面に出す日本語の名前
import type { Direction, Head, LineStyle, Scale, Shape } from "../src/index.ts";

export const SHAPE_NAMES: Record<Shape, string> = { text: "文字", parallelogram: "平行四辺形", cube: "立方体" };
export const DIRECTION_NAMES: Record<Direction, string> = { left: "左", right: "右", above: "上", below: "下" };
export const STYLE_NAMES: Record<LineStyle, string> = { solid: "実線", dotted: "点線", double: "二重線" };
export const HEAD_NAMES: Record<Head, string> = {
  none: "なし",
  open: "矢印(V字)",
  filled: "矢印(塗りつぶし)",
  dot: "丸",
};
export const SCALE_NAMES: Record<Scale | "numbers", string> = {
  small: "小",
  medium: "中",
  large: "大",
  numbers: "数で指定(高度な設定)",
};
