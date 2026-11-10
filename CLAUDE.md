# zu

図形を文字で書いて SVG にする記述言語の試作。言語の仕様は [SPEC.md](SPEC.md)、経緯と未決事項は [docs/handoff.md](docs/handoff.md) を読んでから作業する。見た目や書き方に迷ったら [docs/design/principles.md](docs/design/principles.md)(鉛筆で描けるか、矢印の先が分かるか、細かい設定なしで整うか、など)に照らす。

## 構成

構文(`src/syntax/`)→ 配置(`src/layout/`)→ 描画(`src/svg/`)の3段。各段は前の段の結果だけを受け取り、後ろの段を知らない。

- `src/syntax/`: 字句解析と構文解析。座標や大きさの計算をしない
- `src/layout/`: 構文木から図形の外枠(座標と大きさ)と、描くのに要る寸法を決める。SVG を知らない。`layout.ts` が入口で、大きさ(`size.ts`)、位置(`position.ts`)、線(`lines.ts`。中まで伸ばす端は `into.ts`、ラベルの置き場所は `labels.ts`)、木の項目と線(`tree.ts`)、注釈(`annotations.ts`)、図の下の文(`captions.ts`)に分かれる。点と枠の計算は `geometry.ts`
- `src/svg/`: 配置済みの図形を SVG の文字列にする。大きさや位置を計算し直さない
- `src/errors.ts`: どの段の誤りも `ZuError`(行と列)で報告する
- `src/index.ts`: 公開する入口。ほかのプロジェクトは GitHub から入れ、ここ(ビルド後は `dist/index.js`)から読み込む。公開するものを変えたら README も直す
- `cli.ts`: ファイルを読んで SVG を書く入口
- `editor/`: ブラウザのエディタ(Vite で束ねる)。3段を使う側で、`src/index.ts` の公開するものだけを使う。`src/` から editor を参照しない。状態は `state.ts` の `Editor` に集め、各欄(`canvas.ts`、`panel.ts`、`toolbar.ts`)は変化を受けて描き直す。DOM を使わない部分(`edit.ts`、`relocate.ts`、`snap.ts`、`history.ts`、`state.ts`)は `tests/editor.test.ts` で試す
- エディタは **Law図**(ローズ)の名前で出す。ロゴは `editor/public/favicon.svg`、色や PNG の作り直し方は [docs/design/brand.md](docs/design/brand.md)。言語の名前と拡張子は zu と `.zu` のまま

## コマンド

```
npm install          # 型チェック用の TypeScript を入れる
npm test             # tests/*.test.ts
npm run typecheck
npm run build:lib    # dist/ にライブラリ(JS と型定義)を書き出す。npm install でも走る(prepare)
node cli.ts examples/agency.zu examples/agency.svg
npm run dev          # エディタ(Vite)
npm run build        # editor/dist に書き出す(Vercel はこれを出す)
```

## ルール

- 実行時の依存パッケージを足さない(エディタも含む。Vite は開発用)。Node 24 で .ts をそのまま動かす(`erasableSyntaxOnly` に収まる書き方にする)。`src/` の import は `.ts` を付けて書く(ライブラリのビルドで `.js` に書き換わる)
- 言語の語(図形の名前、キーワード)は特定の分野に寄せない。法律の図にも使うが、`text`、`cube` のように見た目で名付ける
- 文法や意味を変えたら SPEC.md も直す。例(`examples/`)の SVG も出し直す
- 書き方、見た目、公開するものを変えたら、CHANGELOG.md の「未公開」に書き足す(互換を壊すなら印を付けて直し方を添える)。版の付け方と出し方は [docs/design/versioning.md](docs/design/versioning.md)
- 誤りの文言、コメント、文書は日本語
- テストは段ごとに `tests/` に書く。見た目を変えたら、SVG をブラウザで開いて確かめる
- エディタは、数を書かない操作を既定にする。数の指定は「高度な設定」と Alt+ドラッグに留める([docs/design/editor.md](docs/design/editor.md))
