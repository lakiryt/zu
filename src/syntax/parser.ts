// 字句の列を文の列にする。1行に1文で、行の途中で誤りがあればその位置を報告する
import { ZuError } from "../errors.ts";
import { AXES, DIRECTIONS, JUSTIFICATIONS, SCALES, SHAPES } from "./ast.ts";
import type {
  AlignStatement,
  CaptionStatement,
  Direction,
  Document,
  LineEnd,
  LineStatement,
  Placement,
  Shape,
  ShapeStatement,
  Size,
  SourcePosition,
  Statement,
} from "./ast.ts";
import { readArrow } from "./arrow.ts";
import { tokenize } from "./lexer.ts";
import type { Token, TokenType } from "./lexer.ts";

const NAMES: Record<TokenType, string> = {
  word: "語",
  string: "文字列",
  number: "数",
  comma: "「,」",
  arrow: "線の記号",
  newline: "改行",
  eof: "ファイルの終わり",
};

const describe = (token: Token) =>
  token.type === "word" || token.type === "number" ? `「${token.value}」` : NAMES[token.type];

// 決まった語の並び(SHAPES など)に value が入っているか
const oneOf = <T extends string>(words: readonly T[], value: string): value is T =>
  (words as readonly string[]).includes(value);

export function parse(source: string): Document {
  const tokens = tokenize(source);
  let index = 0;

  const peek = () => tokens[index]!;
  const next = () => tokens[index++]!;
  const last = () => tokens[index - 1]!;
  const atLineEnd = () => peek().type === "newline" || peek().type === "eof";
  const peekWord = (value: string) => peek().type === "word" && peek().value === value;

  function expect(type: TokenType, what: string) {
    const token = peek();
    if (token.type !== type) throw new ZuError(`${what}が必要です(${describe(token)}がありました)`, token.at);
    return next();
  }

  function number(what: string) {
    return Number(expect("number", what).value);
  }

  // 数と数の間の「,」は書いても書かなくてもよい
  function skipComma() {
    if (peek().type === "comma") next();
  }

  function statement(): Statement {
    const head = expect("word", "図形の種類");
    // 2つ目が線の記号なら線の文(図形の種類や align という名前の図形も結べる)
    if (peek().type === "arrow") return line(head);
    if (head.value === "align") return align(head);
    if (head.value === "caption") return caption(head);
    if (!oneOf(SHAPES, head.value)) {
      throw new ZuError(`「${head.value}」という図形はありません(${SHAPES.join("、")})`, head.at);
    }
    return shape(head, head.value);
  }

  // a ---> b "ラベル" as f into b: 2つの図形(か線)を線で結ぶ。as で線に名前を付け、
  // into に挙げた図形には線を中まで伸ばす
  function line(head: Token): LineStatement {
    const { style, start, end } = readArrow(next().value)!;
    const to = expect("word", "結ぶ先の図形の名前");
    const label = peek().type === "string" ? next().value : null;
    const ends: [LineEnd, LineEnd] = [
      { id: head.value, at: head.at, head: start, into: false },
      { id: to.value, at: to.at, head: end, into: false },
    ];
    let id: string | null = null;
    if (peekWord("as")) {
      next();
      id = expect("word", "線の名前").value;
    }
    if (!atLineEnd()) {
      if (!peekWord("into")) {
        throw new ZuError(
          `線の文には${describe(peek())}を書けません(ラベルは "…"、名前は as、中まで伸ばすのは into で書きます)`,
          peek().at,
        );
      }
      next();
      do {
        const target = expect("word", "中まで伸ばす図形の名前");
        if (target.value === "as" && !ends.some((end) => end.id === "as")) {
          throw new ZuError("as(線の名前)は into より前に書きます", target.at);
        }
        // 同じ図形どうしを結んだ線(配置の段で誤りにする)でも、まだ into でない側を選ぶ
        const end = ends.find((end) => end.id === target.value && !end.into);
        if (!end) {
          const twice = ends.some((end) => end.id === target.value);
          throw new ZuError(
            twice ? `「${target.value}」は2回挙げています` : `「${target.value}」はこの線で結ぶ図形ではありません`,
            target.at,
          );
        }
        end.into = true;
      } while (!atLineEnd());
    }
    const [from, toEnd] = ends;
    return { kind: "line", style, from, to: toEnd, label, id, at: head.at, end: last().end };
  }

  // align row a b c: 挙げた図形を同じ段(column なら同じ列)に揃える
  function align(head: Token): AlignStatement {
    const axis = expect("word", "揃え方(row か column)");
    if (!oneOf(AXES, axis.value)) {
      throw new ZuError(`揃え方は row か column です(「${axis.value}」がありました)`, axis.at);
    }
    const members: AlignStatement["members"] = [];
    while (!atLineEnd()) {
      const token = expect("word", "揃える図形の名前");
      members.push({ id: token.value, at: token.at });
    }
    if (members.length < 2) throw new ZuError("揃える図形を2つ以上書きます", peek().at);
    return { kind: "align", axis: axis.value, members, at: head.at, end: last().end };
  }

  // caption "文" right size small: 図全体の下に置く文。揃えと字の大きさは語で書く
  function caption(head: Token): CaptionStatement {
    const text = expect("string", '文("…")').value;
    let justify: CaptionStatement["justify"] = null;
    let size: CaptionStatement["size"] = null;
    while (!atLineEnd()) {
      const option = expect("word", "揃え(left、center、right)か size");
      if (oneOf(JUSTIFICATIONS, option.value)) {
        if (justify) throw new ZuError("揃えは1つの文に1つまでです", option.at);
        justify = option.value;
      } else if (option.value === "size") {
        if (size) throw new ZuError("size は1つの文に1つまでです", option.at);
        const word = expect("word", `大きさ(${SCALES.join("、")})`);
        if (!oneOf(SCALES, word.value)) {
          throw new ZuError(`文の大きさは ${SCALES.join("、")} で書きます(「${word.value}」がありました)`, word.at);
        }
        size = word.value;
      } else {
        throw new ZuError(`「${option.value}」は使えません(left、center、right、size)`, option.at);
      }
    }
    return { kind: "caption", text, justify, size, at: head.at, end: last().end };
  }

  function shape(head: Token, kind: Shape): ShapeStatement {
    const id = expect("word", "図形の名前").value;
    const label = peek().type === "string" ? next().value : null;
    let placement: Placement | null = null;
    let size: Size | null = null;

    while (!atLineEnd()) {
      const option = peek();
      if (option.type !== "word") throw new ZuError(`${describe(option)}は置けません`, option.at);
      next();

      if (option.value === "at" || oneOf(DIRECTIONS, option.value)) {
        if (placement) throw new ZuError("置き方は1つの図形に1つまでです", option.at);
        placement = option.value === "at" ? at() : beside(option.value, option.at);
      } else if (option.value === "size") {
        if (size) throw new ZuError("size は1つの図形に1つまでです", option.at);
        // text の大きさは字で決まり、立方体は正面の一辺だけで決まる
        if (kind === "text") throw new ZuError("text には size を書けません(大きさは字で決まります)", option.at);
        const next = peek();
        size = sizeOption();
        if (kind === "cube" && size.kind === "numbers" && size.height !== null) {
          throw new ZuError("cube の size は一辺を1つだけ書きます", next.at);
        }
      } else {
        throw new ZuError(`「${option.value}」は使えません(at、left、right、above、below、size)`, option.at);
      }
    }

    return { kind: "shape", shape: kind, id, label, placement, size, at: head.at, end: last().end };
  }

  function at(): Placement {
    const x = number("x 座標");
    skipComma();
    return { kind: "at", x, y: number("y 座標") };
  }

  // 「right of a」とも「below a」とも書ける。of という名前の図形は「below of of」と書く
  function beside(direction: Direction, where: SourcePosition): Placement {
    if (peekWord("of") && tokens[index + 1]?.type === "word") next();
    const of = expect("word", "基準にする図形の名前").value;
    let gap: number | null = null;
    if (peekWord("by")) {
      next();
      gap = number("間の大きさ");
    }
    return { kind: "beside", direction, of, gap, at: where };
  }

  function sizeOption(): Size {
    if (peek().type === "word") {
      const word = next();
      if (!oneOf(SCALES, word.value)) {
        throw new ZuError(`大きさは数か ${SCALES.join("、")} で書きます(「${word.value}」がありました)`, word.at);
      }
      return { kind: "scale", scale: word.value };
    }
    const width = number("大きさ");
    skipComma();
    const height = peek().type === "number" ? number("高さ") : null;
    return { kind: "numbers", width, height };
  }

  const statements: Statement[] = [];
  while (peek().type !== "eof") {
    if (peek().type === "newline") {
      next();
      continue;
    }
    statements.push(statement());
    if (peek().type === "newline") next();
  }
  return { statements };
}
