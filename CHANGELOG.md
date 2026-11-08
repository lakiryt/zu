# 変更の記録

zu(言語とライブラリ)の版ごとの変更。版の付け方は [docs/design/versioning.md](docs/design/versioning.md)。エディタ(Law図)だけの変更は書かない。

## 未公開

## 0.2.0 (2026-11-08)

### 足したもの

- 線の端を図形の中まで伸ばす `into`: `a ---o b into b`、両端なら `into a b`。同じ図形に刺さる端は互いに離して置き、刺さる線は図形の上に描く
- 大きさを語で書く `size small`/`medium`/`large`(`parallelogram` と `cube`)
- 図全体の下に置く文 `caption "…"`。既定は左詰めで、`center`/`right`、`size small`/`medium`/`large` で変える。`\n` で改行できる
- 公開するもの: `SCALES`、`CAPTION_ALIGNS`、型 `Scale`、`SizeOption`、`LineEndpoint`、`CaptionAlign`、`CaptionStatement`、`PlacedCaption`

### 互換を壊す変更

- **既定の大きさを小さくした**。`cube` の正面の一辺は 60 → 40、`parallelogram` は高さ 60 → 48、最小の幅 120 → 96。前の大きさにするには `size large` を書く
- 構文木: 線の端(`LineStatement` の `from`、`to`)に `into` が要るようになった。`ShapeStatement` の `size` は大きさの語(文字列)にもなる。`Statement` に `CaptionStatement` が加わった
- 配置: `Scene` に `captions` が、`PlacedLine` に `over`(図形の上に描く線か)が加わった

## 0.1.0

最初の版。図形 `text`、`parallelogram`、`cube`、置き方(`right of a` など、`at`)、揃え(`align row`/`column`)、線と矢印(`---`、`-.-`、`===` と `>`、`>>`、`o`)。
