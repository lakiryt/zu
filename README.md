# zu

図形を文字で書いて SVG にする記述言語の試作。ブラウザのエディタは **Law図**(ローズ)の名前で出す(名前とロゴは [docs/design/brand.md](docs/design/brand.md))。仕様は [SPEC.md](SPEC.md)、ここまでの検討は [docs/handoff.md](docs/handoff.md)。

```
text a "本人(A)"
text c "相手方(C)" right of a
text b "代理人(B)" below a
parallelogram land "甲土地" below c
cube item "絵画" right of c
align row b land

a ---> b "代理権の授与"
b <-.-> c "意思表示"
a ===>> c "効果帰属"
```

## ほかのプロジェクトで使う

GitHub から入れる。入れるときに `dist/` へ JS と型定義を書き出す(`prepare`)。実行時の依存はなく、Node でもブラウザでも動く。

```
npm install github:lakiryt/zu#v0.6.1
```

`#v0.6.1` のように版(タグ)を指して入れる。指さないと master の最新が入り、書き方や見た目の変更が知らないうちに届く。版ごとの変更は [CHANGELOG.md](CHANGELOG.md)、版の付け方は [docs/design/versioning.md](docs/design/versioning.md)。

```ts
import { render, ZuError } from "zu";

try {
  const svg = render('text a "本人"\ntext b "代理人" below a\na ---> b "代理権の授与"');
} catch (error) {
  if (error instanceof ZuError) console.error(error.line, error.column, error.reason);
}
```

`render` は3段(`parse` → `layout` → `toSvg`)をまとめたもの。途中の結果(構文木 `Document`、配置 `Scene`)が要るときは各段を個別に呼ぶ。公開しているものは [src/index.ts](src/index.ts) にまとめてある。

## 手元で動かす

Node.js 24 以上で、このリポジトリの中ではビルドせずに .ts のまま動く(TypeScript と Node の型定義は型チェックとライブラリのビルドに使う)。

```
npm install                                           # 開発用の道具を入れる(dist/ も書き出す)
node cli.ts examples/agency.zu examples/agency.svg   # SVG に変換する。出力を省くと標準出力
npm test                                              # テスト
npm run typecheck                                     # 型チェック(エディタも含む)
npm run build:lib                                     # ライブラリを dist/ に書き出す
npm run dev                                           # エディタを手元で開く(Vite)
npm run build                                         # エディタを editor/dist に書き出す
```

## エディタ

`editor/` はブラウザで動く視覚的なエディタ(Law図)。左の文字と右の図のどちらからでも編集でき、図の操作は .zu の文字を書き換える。Vercel では `vercel.json` の設定で `editor/dist` を静的サイトとして出す。独自のドメインで出すときは、環境変数 `SITE_URL` に URL を入れる(canonical、共有の画像、サイトマップに使う)。考え方は [docs/design/editor.md](docs/design/editor.md)。

- ドラッグ: ほかの図形の上下左右に寄せて置く(`below c` のような関係を書く。数は書かない。ほかの図形は動かない)
- Alt+ドラッグ: 数で置く(関係のある図形はその線の上で間を、ない図形は座標を書く)
- Shift+クリックで複数選び、「段を揃える」「列を揃える」で `align` を足す。まとめてドラッグすると互いの位置を保って動く
- 2つ選んで「線でつなぐ」で線を引く。線をクリックすると、種類、両端の印、ラベルを変えられる
- 数を書いている図形には、右上に橙の点が付く

## 構成

処理は3段に分かれ、各段は前の段の結果だけを受け取る。

| 段 | 場所 | 入力 → 出力 |
| --- | --- | --- |
| 構文 | `src/syntax/` | 文字列 → 字句(`lexer.ts`)→ 構文木(`parser.ts`、型は `ast.ts`)。`print.ts` は文を文字に戻す |
| 配置 | `src/layout/` | 構文木 → 図形の外枠と線(`layout.ts` が入口)。大きさは `size.ts`、位置(置き方と揃え)は `position.ts`、線は `lines.ts`(中まで伸ばす端は `into.ts`、ラベルの置き場所は `labels.ts`)、木の項目と線は `tree.ts`、図形の注釈は `annotations.ts`、図の下の文は `captions.ts`、文字の大きさの見積もりは `measure.ts`、点と枠の計算は `geometry.ts` |
| 描画 | `src/svg/` | 配置 → SVG の文字列 |

誤りはどの段でも `ZuError`(行と列を持つ)で報告する。

図形を足すときは、`ast.ts` の `SHAPES`、`size.ts` の大きさの計算と `Geometry`、`svg.ts` の描き方に足す(足りないと型エラーになる)。エディタの `names.ts` の `SHAPE_NAMES` にも足す。

エディタ(`editor/`)の中身:

| ファイル | 役目 |
| --- | --- |
| `main.ts` | 入口。各欄を作り、文字の欄、キーボード、ファイルをつなぐ |
| `state.ts` | `Editor`。文字(正本)、読んだ結果、選んでいるもの、履歴。変化を各欄に知らせる |
| `canvas.ts` / `panel.ts` / `toolbar.ts` | 図の欄(選ぶ、ドラッグ)、右の欄、上の道具 |
| `actions.ts` | 欄をまたいで使う操作(図形を足す、線を引く、揃える、消す、動かす) |
| `about.ts` | 「Law図 について」の窓の開け閉めと例の図。本文は `index.html` に書く |
| `edit.ts` / `relocate.ts` / `snap.ts` | 文字の書き換え、ほかの図形を動かさない付け替え、吸着先の計算。DOM を使わない |
| `index.html` / `style.css` / `public/` | ページ、見た目、ロゴと共有用の画像。検索と共有の情報は `index.html` に書き、公開先の URL は `vite.config.ts` が差し込む |
