// 元に戻す・やり直すための文字の履歴。DOM を知らないので Node でも試せる
export class History {
  #past: string[] = [];
  #future: string[] = [];

  get canUndo() {
    return this.#past.length > 0;
  }

  get canRedo() {
    return this.#future.length > 0;
  }

  // 書き換える前の文字を覚える。新しく書き換えたら、やり直しの先は捨てる
  record(before: string) {
    this.#past.push(before);
    this.#future = [];
  }

  // 戻した先の文字。戻れなければ undefined
  undo(current: string) {
    const previous = this.#past.pop();
    if (previous !== undefined) this.#future.push(current);
    return previous;
  }

  redo(current: string) {
    const next = this.#future.pop();
    if (next !== undefined) this.#past.push(current);
    return next;
  }
}
