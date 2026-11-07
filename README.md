# zu

図形を文字で書いて SVG にする記述言語の試作。仕様は [SPEC.md](SPEC.md)、ここまでの検討は [docs/handoff.md](docs/handoff.md)。

```
text a "本人(A)"
text c "相手方(C)" right of a by 240
text b "代理人(B)" below a
parallelogram land "甲土地" below c
cube item "絵画" right of c
align row b land
```

## 使い方

Node.js 24 以上で、ビルドせずに動く。実行時に使う外部のパッケージはない(TypeScript と Node の型定義は型チェックにだけ使う)。

```
npm install                                           # 型チェックを使うときだけ
node cli.ts examples/agency.zu examples/agency.svg   # SVG に変換する。出力を省くと標準出力
npm test                                              # テスト
npm run typecheck                                     # 型チェック(エディタも含む)
npm run dev                                           # エディタを手元で開く(Vite)
npm run build                                         # エディタを editor/dist に書き出す
```

## エディタ

`editor/` はブラウザで動く視覚的なエディタ。左の文字と右の図のどちらからでも編集でき、図の操作は .zu の文字を書き換える。Vercel では `vercel.json` の設定で `editor/dist` を静的サイトとして出す。考え方は [docs/design/editor.md](docs/design/editor.md)。

- ドラッグ: ほかの図形の上下左右に寄せて置く(`below c` のような関係を書く。数は書かない)
- Alt+ドラッグ: 数で置く(関係のある図形はその線の上で間を、ない図形は座標を書く)
- Shift+クリックで複数選び、「段を揃える」「列を揃える」で `align` を足す
- 数を書いている図形には、右上に橙の点が付く

## 構成

処理は3段に分かれ、各段は前の段の結果だけを受け取る。

| 段 | 場所 | 入力 → 出力 |
| --- | --- | --- |
| 構文 | `src/syntax/` | 文字列 → 字句(`lexer.ts`)→ 構文木(`parser.ts`、型は `ast.ts`) |
| 配置 | `src/layout/` | 構文木 → 外枠の座標と大きさ(`layout.ts`)。文字の大きさの見積もりは `measure.ts` |
| 描画 | `src/svg/` | 配置 → SVG の文字列 |

`src/index.ts` の `render` が3段をつなぐ。`src/syntax/print.ts` は構文木の文を文字に戻す(エディタが文を書き換えるのに使う)。誤りはどの段でも `ZuError`(行と列を持つ)で報告する。

図形を足すときは、`ast.ts` の `SHAPES`、`layout.ts` の大きさの計算と `Geometry`、`svg.ts` の描き方に足す(足りないと型エラーになる)。
