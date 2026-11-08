// 図全体の下に置く文(caption)の場所を決める。図形と線をすべて置いた後に、その下へ書いた順に積む
import type { CaptionStatement, Justify, Scale } from "../syntax/ast.ts";
import type { Box } from "./geometry.ts";
import { FONT_SIZE, measureText } from "./measure.ts";

// box は文の外枠。justify は外枠の中で行をどちらに寄せるか
export type PlacedCaption = { text: string; justify: Justify; fontSize: number; box: Box };

// 大きさの語ごとの字の大きさ。medium は図の中の字と同じ
const FONT_SIZES: Record<Scale, number> = { small: 12, medium: FONT_SIZE, large: 20 };
// 図と最初の文の間、文どうしの間
const CAPTION = { gap: FONT_SIZE, spacing: FONT_SIZE * 0.25 };

// figure は図形と線の範囲(なければ null)。文はその幅の中で揃え、広い文があれば幅を広げる
export function placeCaptions(statements: CaptionStatement[], figure: Box | null): PlacedCaption[] {
  const measured = statements.map((statement) => {
    const fontSize = FONT_SIZES[statement.size ?? "medium"];
    return { statement, fontSize, ...measureText(statement.text, fontSize) };
  });
  const left = figure?.x ?? 0;
  const width = Math.max(figure?.width ?? 0, ...measured.map(({ width }) => width));
  let y = figure ? figure.y + figure.height + CAPTION.gap : 0;

  return measured.map(({ statement, fontSize, width: own, height }) => {
    const justify = statement.justify ?? "left";
    const room = width - own;
    const x = left + (justify === "left" ? 0 : justify === "right" ? room : room / 2);
    const box = { x, y, width: own, height };
    y += height + CAPTION.spacing;
    return { text: statement.text, justify, fontSize, box };
  });
}
