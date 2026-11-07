# zu

図形を文字で書いて SVG にする記述言語の試作。言語の仕様は [SPEC.md](SPEC.md)、経緯と未決事項は [docs/handoff.md](docs/handoff.md) を読んでから作業する。

## 構成

構文(`src/syntax/`)→ 配置(`src/layout/`)→ 描画(`src/svg/`)の3段。各段は前の段の結果だけを受け取り、後ろの段を知らない。

- `src/syntax/`: 字句解析と構文解析。座標や大きさの計算をしない
- `src/layout/`: 構文木から図形の外枠(座標と大きさ)と、描くのに要る寸法を決める。SVG を知らない
- `src/svg/`: 配置済みの図形を SVG の文字列にする。大きさや位置を計算し直さない
- `src/errors.ts`: どの段の誤りも `ZuError`(行と列)で報告する
- `cli.ts`: ファイルを読んで SVG を書く入口

## コマンド

```
npm install          # 型チェック用の TypeScript を入れる
npm test             # tests/*.test.ts
npm run typecheck
node cli.ts examples/agency.zu examples/agency.svg
```

## ルール

- 実行時の依存パッケージを足さない。Node 24 で .ts をそのまま動かす(`erasableSyntaxOnly` に収まる書き方にする)
- 言語の語(図形の名前、キーワード)は特定の分野に寄せない。法律の図にも使うが、`text`、`cube` のように見た目で名付ける
- 文法や意味を変えたら SPEC.md も直す。例(`examples/`)の SVG も出し直す
- 誤りの文言、コメント、文書は日本語
- テストは段ごとに `tests/` に書く。見た目を変えたら、SVG をブラウザで開いて確かめる
