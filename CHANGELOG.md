# 変更の記録

zu(言語とライブラリ)の版ごとの変更。版の付け方は [docs/design/versioning.md](docs/design/versioning.md)。エディタ(Law図)だけの変更は書かない。

## 未公開

### 追加

- 木の兄弟の項目を右から波括弧で括り、文を添えられるようにした。括る項目の前に `{` の行、後に `} 文` の行を書く(括る項目と同じ深さに字下げする)。入れ子にもできる。括弧は括った段のいちばん右に置く
- 構文木: `TreeItem` と `ShapeStatement` に括弧 `braces`(`TreeBrace[]`。あるときだけ)を足した。`TreeBrace` を公開する
- 字句: `TokenType` に括弧の始まりと終わり `"open"`、`"close"` を足した
- 配置: 木の `Geometry` に括弧 `braces`(`TreeBraceShape[]`)を足した。括弧の文は `nodes` に入る。`TreeBraceShape` を公開する

## 0.6.0 (2026-11-11)

### 互換を壊す変更

- `tree` を図形の種類にしたので、`tree` で始まる文は木の文として読む。`tree` という名前の図形に注釈を付けていた文(`tree says "x"`)は誤りになる。その図形の名前を変える(線の文 `tree ---> x` は今までどおり読める)

### 追加

- 図形 `tree`(木)を足した。`tree t` の次の行から、項目を `- 文字` の行で書き、字下げで入れ子にする。親は最初の子と同じ段に書き、枝分かれする線で子へつなぐ。ラベル(`tree t "物権"`)は根になり、書かなければ上の段の項目を左の括弧でまとめる
- 構文木: `SHAPES` と `Shape` に `"tree"` を、`ShapeStatement` に項目 `items`(`TreeItem[]`。tree のときだけ)を足した。図形の種類で場合分けしていれば、この場合を足す。`TreeItem` を公開する
- 字句: `TokenType` に木の項目の印 `"item"` を足した
- 配置: `Geometry` に `{ shape: "tree"; nodes; strokes }` を足した。`TreeNode` を公開する

## 0.5.1 (2026-11-09)

### 直し

- 線の脇に置くラベルが線から離れすぎて、どの線のラベルか分かりにくかったのを直した。下地を字にほぼぴったりにして、線から 3 の所に置く
- 曲げた線の矢先が占める範囲を大きく見積もり、近くのラベルを一段外へ押し出していたのを直した。範囲は矢じりの形で見積もる

## 0.5.0 (2026-11-08)

### 互換を壊す変更

- 線のラベルを、線に重ねずに線の脇に書くようにした(横向きの線なら上、縦向きなら右から試す)。これまでのように重ねるなら、ラベルの後に `on` を書く(`a ---> b "x" on`)
- 線に向けた線の端を、図形と同じく相手の手前で止め(線の中心から 10、線に重ねたラベルなら下地から 6)、触れないようにした。これまでのように触れさせるなら、`into` に線の名前を挙げる(`x ---> f into f`)。二重線へは2本の間まで入る
- 構文木: `LineStatement` に、ラベルを線に重ねるか `labelOn`(`boolean`)を足した。構文木を自分で組み立てるなら `labelOn: false` を添える

### 追加

- 図形に紐づく注釈を足した。`a says "売ります"` は吹き出し、`b note "無資力"` は図形のそばの小さな字。置き場所は自動で、`above right` のように語でも決められる
- 構文木: 文の種類に `AnnotationStatement`(`kind: "annotation"`)を足した。文の種類で場合分けしていれば、この場合を足す。`ANNOTATION_KINDS`、`AnnotationKind`、`Spot` を公開する
- 配置: `Scene` に `annotations`(`PlacedAnnotation[]`)を足した。`Tail` を公開する

## 0.4.2 (2026-11-08)

### 直し

- 0.4.1 で端を離したとき、曲げた線の端が逆の側へずれて、ほかの線をまたぐことがあったのを直した。端は線が入ってくる向きの順に並べる
- 端をずらした曲げた線の矢先が、図形でなく横を向いていたのを直した。ずらした端で図形のほうへ向くよう曲げ直す(弧は S 字にならず、曲げの強さも保つ)

## 0.4.1 (2026-11-08)

### 直し

- 同じ図形に近い向きから来る線の端が一点に重なり、二股に分かれた矢印に見えていたのを直した。端どうしを 14 以上離す。まっすぐな線の端はなるべく動かさず、曲げた線の端をずらす

## 0.4.0 (2026-11-08)

### 互換を壊す変更

- 構文木: `LineStatement` に線の名前 `id`(`string | null`)と曲げ方 `bend`(`Bend | null`)を足した。構文木を自分で組み立てるなら `id: null, bend: null` を添える
- 結べない名前の誤りの文言を「「x」という図形や線はありません」に変えた

### 追加

- 線に名前を付け(`b ---> c "詐害行為" as f`)、ほかの線をその線に向けられるようにした(`x ---> f "取消"`)。向けた線は相手の線の中点を狙い、線の上にラベルがあればラベルに当てる。同じ線に向けた端は線に沿って離す
- 線を弧に曲げる `bend left` / `bend right` を足した(進む向きから見た左右。TikZ と同じ)。`small`/`large` を添えるとふくらみが変わる
- 配置: `PlacedLine` に線の名前 `id` と、曲げた線の制御点 `control` を足した。`PlacedEnd.id` は線の名前のこともある。通り道の型 `Path` と、`BEND_SIDES`、`Bend`、`BendSide` を公開する

## 0.3.0 (2026-11-08)

### 互換を壊す変更

- ラベルを省いた `parallelogram` と `cube` は、名前をラベルにせず、ラベルなしで描くようになった(`text` は今まで通り名前を書く)。ラベルのない `cube` の外枠は立方体だけになり、下の図形や線が近づく。前のように名前を出すには、ラベルを書く
- `text` に `size` を書くと誤りになった(前は無視していた)。`cube` の `size` に数を2つ書くのも誤り(前は2つ目を無視していた)。消せば前と同じ
- 構文木を整理した
  - 線の両端の印を、`LineStatement.arrow` から各端(`from`、`to`)の `head` に移した。線の種類は `LineStatement.style`。端の型は `LineEndpoint` から `LineEnd` に名前を変えた
  - `ShapeStatement.size` は `{ kind: "scale", scale }` か `{ kind: "numbers", width, height }`。型の名前は `SizeOption` から `Size` に
  - 図の下の文の揃えは `CaptionStatement.justify`(前は `align`)。`CAPTION_ALIGNS`、`CaptionAlign` は `JUSTIFICATIONS`、`Justify` に
  - `Arrow` は公開しなくなった
- 配置: `PlacedLine` の端は `from`、`to`(`{ id, point, head }`、型は `PlacedEnd`)にまとめた(前は `from`、`to` が名前で、`start`、`end`、`arrow` が別にあった)。`PlacedCaption.align` は `justify` に

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
