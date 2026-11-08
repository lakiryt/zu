// 描画環境なしで文字の大きさを見積もる。全角の字は1字ぶん、それ以外は0.6字ぶんとする
export const FONT_SIZE = 16;
export const LINE_HEIGHT = 1.4;

const NARROW_RATIO = 0.6;
// 漢字、かな、全角記号、ハングルなど、1字ぶんの幅を取る字
const WIDE =
  /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{20000}-\u{3fffd}]/u;

export function labelLines(label: string) {
  return label.split("\n");
}

// fontSize は字の大きさ。書かなければ図の中の字の大きさ
export function measureText(label: string, fontSize = FONT_SIZE) {
  const lines = labelLines(label);
  const widths = lines.map(
    (line) => [...line].reduce((sum, char) => sum + (WIDE.test(char) ? 1 : NARROW_RATIO), 0) * fontSize,
  );
  return { width: Math.max(0, ...widths), height: lines.length * fontSize * LINE_HEIGHT };
}
