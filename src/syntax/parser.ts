// 字句の列を文の列にする。1行に1文で、行の途中で誤りがあればその位置を報告する
import { ZuError } from "../errors.ts";
import { ANNOTATION_KINDS, AXES, BEND_SIDES, DIRECTIONS, JUSTIFICATIONS, SCALES, SHAPES } from "./ast.ts";
import type {
  AlignStatement,
  AnnotationStatement,
  Bend,
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
  TreeBrace,
  TreeItem,
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
  item: "木の項目(- …)",
  open: "括弧の始まり({)",
  close: "括弧の終わり(})",
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
    if (peek().type === "item") throw new ZuError("木の項目(- …)は tree の文の次の行から書きます", peek().at);
    if (peek().type === "open" || peek().type === "close") {
      throw new ZuError("括弧({ と })は tree の項目の行の間に書きます", peek().at);
    }
    const head = expect("word", "図形の種類");
    // 2つ目が線の記号なら線の文(図形の種類や align という名前の図形も結べる)
    if (peek().type === "arrow") return line(head);
    // 2つ目が says か note で、3つ目が文字列なら注釈。図形の種類で始まる文は図形の文として読む
    // (text says "x" は「says という名前の text」)
    const second = peek();
    if (
      !oneOf(SHAPES, head.value) &&
      second.type === "word" &&
      oneOf(ANNOTATION_KINDS, second.value) &&
      tokens[index + 1]?.type === "string"
    ) {
      return annotation(head, second.value);
    }
    if (head.value === "align") return align(head);
    if (head.value === "caption") return caption(head);
    if (!oneOf(SHAPES, head.value)) {
      throw new ZuError(`「${head.value}」という図形はありません(${SHAPES.join("、")})`, head.at);
    }
    return shape(head, head.value);
  }

  // a ---> b "ラベル" on as f bend left into b: 2つの図形(か線)を線で結ぶ。on でラベルを線に重ね、
  // as で線に名前を付け、bend で曲げ、into に挙げた図形には線を中まで伸ばす
  function line(head: Token): LineStatement {
    const { style, start, end } = readArrow(next().value)!;
    const to = expect("word", "結ぶ先の図形の名前");
    const label = peek().type === "string" ? next().value : null;
    let labelOn = false;
    if (peekWord("on")) {
      if (label === null) throw new ZuError("on はラベル(\"…\")の後に書きます", peek().at);
      next();
      labelOn = true;
    }
    const ends: [LineEnd, LineEnd] = [
      { id: head.value, at: head.at, head: start, into: false },
      { id: to.value, at: to.at, head: end, into: false },
    ];
    // as と bend はどちらを先に書いてもよい。into は残りの語を読むので最後
    let id: string | null = null;
    let bend: Bend | null = null;
    while (peekWord("as") || peekWord("bend")) {
      const option = next();
      if (option.value === "as") {
        if (id !== null) throw new ZuError("as は1つの線に1つまでです", option.at);
        id = expect("word", "線の名前").value;
        continue;
      }
      if (bend !== null) throw new ZuError("bend は1つの線に1つまでです", option.at);
      const side = expect("word", "曲げる向き(left か right)");
      if (!oneOf(BEND_SIDES, side.value)) {
        throw new ZuError(`曲げる向きは left か right です(「${side.value}」がありました)`, side.at);
      }
      const scale = peek().type === "word" && oneOf(SCALES, peek().value) ? (next().value as Bend["scale"]) : null;
      bend = { side: side.value, scale };
    }
    if (!atLineEnd()) {
      if (!peekWord("into")) {
        throw new ZuError(
          `線の文には${describe(peek())}を書けません(ラベルは "…"、ラベルを線に重ねるのは on、名前は as、曲げ方は bend、中まで伸ばすのは into で書きます)`,
          peek().at,
        );
      }
      next();
      do {
        const target = expect("word", "中まで伸ばす図形の名前");
        if ((target.value === "as" || target.value === "bend") && !ends.some((end) => end.id === target.value)) {
          throw new ZuError(`${target.value} は into より前に書きます`, target.at);
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
    return { kind: "line", style, from, to: toEnd, label, labelOn, id, bend, at: head.at, end: last().end };
  }

  // a says "売ります" above right: 図形 a に紐づく注釈。置き場所は上下と左右の語で書く(書かなければ自動)
  function annotation(head: Token, kind: AnnotationStatement["annotation"]): AnnotationStatement {
    next();
    const text = expect("string", '注釈の文("…")').value;
    let spot: AnnotationStatement["spot"] = null;
    if (!atLineEnd()) {
      const first = expect("word", "置き場所(above、below、left、right)");
      const vertical = first.value === "above" || first.value === "below" ? first.value : null;
      let horizontal: "left" | "right" | null = first.value === "left" || first.value === "right" ? first.value : null;
      if (!vertical && !horizontal) {
        throw new ZuError(`注釈の置き場所は above、below、left、right で書きます(「${first.value}」がありました)`, first.at);
      }
      if (vertical && !atLineEnd()) {
        const side = expect("word", "左右(left か right)");
        if (side.value !== "left" && side.value !== "right") {
          throw new ZuError(`斜めは above right のように、上下の後に left か right を書きます(「${side.value}」がありました)`, side.at);
        }
        horizontal = side.value;
      }
      if (!atLineEnd()) throw new ZuError(`注釈の文には${describe(peek())}を書けません`, peek().at);
      spot = { vertical, horizontal };
    }
    return { kind: "annotation", annotation: kind, target: head.value, targetAt: head.at, text, spot, at: head.at, end: last().end };
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
        // text の大きさは字で決まり、木は項目で決まり、立方体は正面の一辺だけで決まる
        if (kind === "text") throw new ZuError("text には size を書けません(大きさは字で決まります)", option.at);
        if (kind === "tree") throw new ZuError("tree には size を書けません(大きさは項目で決まります)", option.at);
        const next = peek();
        size = sizeOption();
        if (kind === "cube" && size.kind === "numbers" && size.height !== null) {
          throw new ZuError("cube の size は一辺を1つだけ書きます", next.at);
        }
      } else {
        throw new ZuError(`「${option.value}」は使えません(at、left、right、above、below、size)`, option.at);
      }
    }

    if (kind === "tree") {
      const { items, braces } = treeItems(head);
      return {
        kind: "shape",
        shape: kind,
        id,
        label,
        placement,
        size,
        items,
        ...(braces.length > 0 ? { braces } : {}),
        at: head.at,
        end: last().end,
      };
    }
    return { kind: "shape", shape: kind, id, label, placement, size, at: head.at, end: last().end };
  }

  // 「- 」や「}」の後の文字。引用符で書いたときは、続く文字列の字句から読む
  function markText(mark: Token) {
    if (mark.value !== "" || peek().type !== "string") return { text: mark.value, at: mark.at };
    const string = next();
    return { text: string.value, at: string.at };
  }

  // tree の文の次の行から続く「- 文字」の行と、兄弟を括る「{」「}」の行。空行とコメントの行は挟んでよい。
  // 前の項目より深く字下げした項目はその子、同じ深さなら兄弟。浅くしたら、同じ深さの祖先の兄弟になる。
  // 括弧は、括る項目と同じ深さに字下げし、同じ親の続いた兄弟を括る
  function treeItems(head: Token): { items: TreeItem[]; braces: TreeBrace[] } {
    const roots: TreeItem[] = [];
    const rootBraces: TreeBrace[] = [];
    // 今の項目と、その祖先(上の段から)。indent は字下げの字数
    const path: { indent: number; item: TreeItem }[] = [];
    // 開いている括弧。owner は括る兄弟の親(null は上の段)、first は最初に括る兄弟の番号
    const open: { owner: TreeItem | null; indent: number; first: number; at: SourcePosition }[] = [];
    const childrenOf = (owner: TreeItem | null) => (owner ? owner.children : roots);

    // indent の深さに書いた行が入る兄弟の並びの親(null は上の段)。浅くした分の祖先は path から外す
    function ownerFor(indent: number, at: SourcePosition): TreeItem | null {
      const current = path.at(-1);
      if (current && indent > current.indent) return current.item;
      while (path.length > 0 && path.at(-1)!.indent > indent) path.pop();
      if (path.length > 0 && path.at(-1)!.indent !== indent) {
        throw new ZuError("字下げが、同じ段のほかの項目と合いません", at);
      }
      if (current && path.length === 0) throw new ZuError("最初の項目より浅く字下げした項目は書けません", at);
      return path.at(-2)?.item ?? null;
    }
    // indent より深い所で開いた括弧は、もう閉じられない
    function unclosed(indent: number) {
      const deeper = open.find((brace) => brace.indent > indent);
      if (deeper) throw new ZuError("括弧({)が閉じていません(同じ深さに「}」の行を書きます)", deeper.at);
    }

    for (;;) {
      let ahead = index;
      while (tokens[ahead]!.type === "newline") ahead += 1;
      const type = tokens[ahead]!.type;
      if (type !== "item" && type !== "open" && type !== "close") break;
      index = ahead;
      const mark = next();
      const indent = mark.at.column - 1;
      unclosed(indent);

      if (type === "open") {
        if (!atLineEnd()) throw new ZuError(`「{」の行には${describe(peek())}を書けません`, peek().at);
        const owner = ownerFor(indent, mark.at);
        open.push({ owner, indent, first: childrenOf(owner).length, at: mark.at });
        continue;
      }

      const { text, at } = markText(mark);
      if (!atLineEnd()) throw new ZuError(`${type === "item" ? "項目" : "括弧"}の文字の後には${describe(peek())}を書けません`, peek().at);

      if (type === "close") {
        const brace = open.at(-1);
        if (!brace || brace.indent !== indent) throw new ZuError("この「}」と同じ深さで開いた括弧({)がありません", mark.at);
        const owner = ownerFor(indent, mark.at);
        if (owner !== brace.owner) throw new ZuError("括弧は同じ親の兄弟だけを括れます", mark.at);
        const last = childrenOf(owner).length - 1;
        if (last < brace.first) throw new ZuError("括弧の中に項目がありません", brace.at);
        open.pop();
        const placed = { first: brace.first, last, label: text === "" ? null : text, at: brace.at };
        if (owner) (owner.braces ??= []).push(placed);
        else rootBraces.push(placed);
        continue;
      }

      if (text === "") throw new ZuError("項目の文字が必要です", at);
      const owner = ownerFor(indent, mark.at);
      if (open.some((brace) => brace.owner === owner && brace.indent !== indent)) {
        throw new ZuError("項目の字下げが、括弧({)と合いません", mark.at);
      }
      const item: TreeItem = { label: text, children: [], at: mark.at };
      if (path.at(-1)?.indent === indent) path.pop();
      childrenOf(owner).push(item);
      path.push({ indent, item });
    }
    unclosed(-1);
    if (roots.length === 0) throw new ZuError("tree の次の行から、項目を「- 文字」の形で書きます", head.at);
    return { items: roots, braces: rootBraces };
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
