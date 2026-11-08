import { ZuError } from "../errors.ts";
import { AXES, CAPTION_ALIGNS, DIRECTIONS, SCALES, SHAPES } from "./ast.ts";
import type {
  AlignStatement,
  Axis,
  CaptionAlign,
  CaptionStatement,
  Direction,
  Document,
  LineStatement,
  Placement,
  Scale,
  Shape,
  ShapeStatement,
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

const isShape = (value: string): value is Shape => (SHAPES as readonly string[]).includes(value);
const isScale = (value: string): value is Scale => (SCALES as readonly string[]).includes(value);
const isCaptionAlign = (value: string): value is CaptionAlign => (CAPTION_ALIGNS as readonly string[]).includes(value);
const isAxis = (value: string): value is Axis => (AXES as readonly string[]).includes(value);
const isDirection = (value: string): value is Direction =>
  (DIRECTIONS as readonly string[]).includes(value);

// 字句の列を文の列にする。1行に1文で、行の途中で誤りがあればその位置を報告する
export function parse(source: string): Document {
  const tokens = tokenize(source);
  let index = 0;

  const peek = () => tokens[index]!;
  const next = () => tokens[index++]!;
  const atLineEnd = () => peek().type === "newline" || peek().type === "eof";

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
    if (!isShape(head.value)) {
      throw new ZuError(`「${head.value}」という図形はありません(${SHAPES.join("、")})`, head.at);
    }
    return shape(head, head.value);
  }

  // a ---> b "ラベル" into b: 2つの図形を線で結ぶ。into に挙げた図形には、線を中まで伸ばす
  function line(head: Token): LineStatement {
    const arrow = readArrow(next().value)!;
    const to = expect("word", "結ぶ先の図形の名前");
    const label = peek().type === "string" ? next().value : null;
    const from = { id: head.value, at: head.at, into: false };
    const end = { id: to.value, at: to.at, into: false };
    if (!atLineEnd()) {
      const option = peek();
      if (option.type !== "word" || option.value !== "into") {
        throw new ZuError(`線の文には${describe(option)}を書けません(ラベルは "…"、中まで伸ばすのは into で書きます)`, option.at);
      }
      next();
      do {
        const target = expect("word", "中まで伸ばす図形の名前");
        // 同じ名前を2回挙げたら、まだ into でない側を選ぶ(a --- a は配置の段で誤りにする)
        const side = [from, end].find((side) => side.id === target.value && !side.into);
        if (!side) {
          const twice = [from, end].some((side) => side.id === target.value);
          throw new ZuError(
            twice ? `「${target.value}」は2回挙げています` : `「${target.value}」はこの線で結ぶ図形ではありません`,
            target.at,
          );
        }
        side.into = true;
      } while (!atLineEnd());
    }
    return {
      kind: "line",
      from,
      to: end,
      arrow,
      label,
      at: head.at,
      end: tokens[index - 1]!.end,
    };
  }

  // caption "文" right size small: 図全体の下に置く文。揃えと字の大きさは語で書く
  function caption(head: Token): CaptionStatement {
    const text = expect("string", "文(\"…\")").value;
    let align: CaptionAlign | null = null;
    let size: CaptionStatement["size"] = null;
    while (!atLineEnd()) {
      const option = expect("word", "揃え(left、center、right)か size");
      if (isCaptionAlign(option.value)) {
        if (align) throw new ZuError("揃えは1つの文に1つまでです", option.at);
        align = option.value;
      } else if (option.value === "size") {
        if (size) throw new ZuError("size は1つの文に1つまでです", option.at);
        const word = expect("word", `大きさ(${SCALES.join("、")})`);
        if (!isScale(word.value)) {
          throw new ZuError(`文の大きさは ${SCALES.join("、")} で書きます(「${word.value}」がありました)`, word.at);
        }
        size = word.value;
      } else {
        throw new ZuError(`「${option.value}」は使えません(left、center、right、size)`, option.at);
      }
    }
    return { kind: "caption", text, align, size, at: head.at, end: tokens[index - 1]!.end };
  }

  // align row a b c: 挙げた図形を同じ段(column なら同じ列)に揃える
  function align(head: Token): AlignStatement {
    const axis = expect("word", "揃え方(row か column)");
    if (!isAxis(axis.value)) {
      throw new ZuError(`揃え方は row か column です(「${axis.value}」がありました)`, axis.at);
    }
    const members: AlignStatement["members"] = [];
    while (!atLineEnd()) {
      const token = expect("word", "揃える図形の名前");
      members.push({ id: token.value, at: token.at });
    }
    if (members.length < 2) throw new ZuError("揃える図形を2つ以上書きます", peek().at);
    return { kind: "align", axis: axis.value, members, at: head.at, end: tokens[index - 1]!.end };
  }

  function shape(head: Token, shapeName: Shape): ShapeStatement {
    const id = expect("word", "図形の名前").value;
    const label = peek().type === "string" ? next().value : null;
    let placement: Placement | null = null;
    let size: ShapeStatement["size"] = null;

    while (!atLineEnd()) {
      const option = peek();
      if (option.type !== "word") throw new ZuError(`${describe(option)}は置けません`, option.at);
      next();

      if (option.value === "at" || isDirection(option.value)) {
        if (placement) throw new ZuError("置き方は1つの図形に1つまでです", option.at);
        if (option.value === "at") {
          const x = number("x 座標");
          skipComma();
          placement = { kind: "at", x, y: number("y 座標") };
        } else {
          // 「right of a」とも「below a」とも書ける。of という名前の図形は「below of of」と書く
          const after = tokens[index + 1];
          if (peek().type === "word" && peek().value === "of" && after?.type === "word") next();
          const of = expect("word", "基準にする図形の名前").value;
          let gap: number | null = null;
          if (peek().type === "word" && peek().value === "by") {
            next();
            gap = number("間の大きさ");
          }
          placement = { kind: "beside", direction: option.value as Direction, of, gap, at: option.at };
        }
      } else if (option.value === "size") {
        if (size) throw new ZuError("size は1つの図形に1つまでです", option.at);
        if (peek().type === "word") {
          const word = next();
          if (!isScale(word.value)) {
            throw new ZuError(`大きさは数か ${SCALES.join("、")} で書きます(「${word.value}」がありました)`, word.at);
          }
          size = word.value;
          continue;
        }
        const width = number("大きさ");
        skipComma();
        const height = peek().type === "number" ? number("高さ") : null;
        size = { width, height };
      } else {
        throw new ZuError(`「${option.value}」は使えません(at、left、right、above、below、size)`, option.at);
      }
    }

    return { kind: "shape", shape: shapeName, id, label, placement, size, at: head.at, end: tokens[index - 1]!.end };
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
