# zu

図形を文字で書いて SVG にする記述言語の試作。仕様は [SPEC.md](SPEC.md)、ここまでの検討は [docs/handoff.md](docs/handoff.md)。

```
text a "本人(A)" at 0 0
text c "相手方(C)" right of a by 240
parallelogram land "甲土地" below c by 100
cube item "絵画" right of c by 60
```

## 使い方

Node.js 24 以上で、ビルドせずに動く。実行時に使う外部のパッケージはない(TypeScript と Node の型定義は型チェックにだけ使う)。

```
npm install                                           # 型チェックを使うときだけ
node cli.ts examples/agency.zu examples/agency.svg   # SVG に変換する。出力を省くと標準出力
npm test                                              # テスト
npm run typecheck                                     # 型チェック
```

## 構成

処理は3段に分かれ、各段は前の段の結果だけを受け取る。

| 段 | 場所 | 入力 → 出力 |
| --- | --- | --- |
| 構文 | `src/syntax/` | 文字列 → 字句(`lexer.ts`)→ 構文木(`parser.ts`、型は `ast.ts`) |
| 配置 | `src/layout/` | 構文木 → 外枠の座標と大きさ(`layout.ts`)。文字の大きさの見積もりは `measure.ts` |
| 描画 | `src/svg/` | 配置 → SVG の文字列 |

`src/index.ts` の `render` が3段をつなぐ。誤りはどの段でも `ZuError`(行と列を持つ)で報告する。

図形を足すときは、`ast.ts` の `SHAPES`、`layout.ts` の大きさの計算と `Geometry`、`svg.ts` の描き方に足す(足りないと型エラーになる)。
