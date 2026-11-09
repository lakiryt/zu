// エディタの状態。正本は .zu の文字で、図やパネルの操作は文字を書き換えてから読み直す。
// 変わったことは listen で受け取る("text" は文字が変わった、"selection" は選んでいるものだけが変わった)
import { ZuError, layout, parse } from "../src/index.ts";
import type { Document, Scene } from "../src/index.ts";
import { EditError } from "./edit.ts";
import type { Pick } from "./edit.ts";
import { History } from "./history.ts";

// 選んでいるもの。図形と線を、選んだ順に並べる(Shift で足す)。線でつなぐときは、先に選んだほうから引く
export type Selection = Pick[];

export const NOTHING: Selection = [];

export const samePick = (a: Pick, b: Pick) =>
  a.kind === "shape" ? b.kind === "shape" && a.id === b.id : b.kind === "line" && a.index === b.index;

export const shapePick = (id: string): Pick => ({ kind: "shape", id });
export const linePick = (index: number): Pick => ({ kind: "line", index });

export type Change = "text" | "selection";

// 文字を打っている間の書き換えは、この間(ミリ秒)をあけずに続く限り、履歴の一つにまとめる
const TYPING_PAUSE = 800;

export class Editor {
  text: string;
  // 最後に読めた文字の構文と配置。文字に誤りがあるあいだ(broken)は、その前の図を残す
  document: Document | null = null;
  scene: Scene | null = null;
  broken = false;
  error = "";
  selection: Selection = NOTHING;
  // Shift を押したままのように、選ぶたびに足していく(タッチの画面には Shift がないので、ボタンで切り替える)
  adding = false;
  fileName = "diagram.zu";
  readonly history = new History();

  #listeners: ((change: Change) => void)[] = [];
  #say: (message: string) => void;
  #typing: ReturnType<typeof setTimeout> | null = null;

  constructor(text: string, say: (message: string) => void) {
    this.text = text;
    this.#say = say;
  }

  listen(listener: (change: Change) => void) {
    this.#listeners.push(listener);
  }

  say(message: string) {
    this.#say(message);
  }

  // 文字を読み直し、選んでいるもののうち消えたものを外して、皆に知らせる
  reload() {
    try {
      this.document = parse(this.text);
      this.scene = layout(this.document);
      this.broken = false;
      this.error = "";
    } catch (error) {
      if (!(error instanceof ZuError)) throw error;
      this.broken = true;
      this.error = error.message;
    }
    this.selection = this.#reconcile(this.selection);
    this.#emit("text");
  }

  // 図やパネルからの書き換え。誤りになる書き換えは取り消して理由を出す。
  // 書き換えがなくても知らせる(ドラッグで少しずらした見た目を描き直すため)
  commit(next: string, selection: Selection = this.selection) {
    if (next !== this.text) {
      try {
        layout(parse(next));
      } catch (error) {
        if (!(error instanceof ZuError)) throw error;
        this.say(`できませんでした: ${error.reason}`);
        this.#emit("text");
        return;
      }
      this.history.record(this.text);
      this.text = next;
    }
    this.selection = selection;
    this.reload();
  }

  // 書き換えを作る処理を試し、できなければ理由を出す(図は描き直して元に戻す)
  attempt(make: () => string, selection?: Selection) {
    let next: string;
    try {
      next = make();
    } catch (error) {
      if (!(error instanceof ZuError || error instanceof EditError)) throw error;
      this.say(error instanceof ZuError ? error.reason : error.message);
      this.#emit("text");
      return;
    }
    this.commit(next, selection);
  }

  // 開いたファイルなど、誤りがあってもそのまま入れるもの
  replaceAll(next: string) {
    this.history.record(this.text);
    this.text = next;
    this.reload();
  }

  // 文字の欄で打ったもの。打ち始めの文字を履歴に残し、続けて打つあいだは一つにまとめる
  type(next: string) {
    if (this.#typing === null) this.history.record(this.text);
    if (this.#typing !== null) clearTimeout(this.#typing);
    this.#typing = setTimeout(() => (this.#typing = null), TYPING_PAUSE);
    this.text = next;
    this.reload();
  }

  undo() {
    const previous = this.history.undo(this.text);
    if (previous === undefined) return;
    this.text = previous;
    this.reload();
  }

  redo() {
    const next = this.history.redo(this.text);
    if (next === undefined) return;
    this.text = next;
    this.reload();
  }

  select(selection: Selection) {
    this.selection = this.#reconcile(selection);
    this.#emit("selection");
  }

  setAdding(adding: boolean) {
    this.adding = adding;
    this.#emit("selection");
  }

  // 選んでいる図形の名前(選んだ順)
  get selectedShapes() {
    return this.selection.flatMap((pick) => (pick.kind === "shape" ? [pick.id] : []));
  }

  // 選んでいる線の番号(選んだ順)
  get selectedLines() {
    return this.selection.flatMap((pick) => (pick.kind === "line" ? [pick.index] : []));
  }

  // 線を1本だけ選んでいれば、その番号
  get selectedLine() {
    const [only, ...rest] = this.selection;
    return only?.kind === "line" && rest.length === 0 ? only.index : null;
  }

  #reconcile(selection: Selection): Selection {
    const scene = this.scene;
    if (!scene) return NOTHING;
    return selection.filter((pick) =>
      pick.kind === "shape" ? scene.shapes.some((shape) => shape.id === pick.id) : pick.index < scene.lines.length,
    );
  }

  #emit(change: Change) {
    for (const listener of this.#listeners) listener(change);
  }
}
