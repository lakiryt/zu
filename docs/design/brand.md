# 名前とロゴ(2026-11-08)

## 名前

- サイト(エディタ)の名前は **Law図**、読みは「ローズ」。ばら(rose)と掛けている
- 言語の名前は zu のまま、拡張子も `.zu` のまま。ライブラリの名前(package.json の `name`)も `zu` のまま
- 名前は法律に寄せたが、言語の語(図形の名前、キーワード)はこれまでどおり特定の分野に寄せない。法律の図に使うのは用途の一つで、語の選び方は変えない

### 拡張子 `.zu` が重なる言語

`.zu` を使う言語に Zimbu(Bram Moolenaar の言語、2009年ごろから。更新は止まっている)がある。Zura という言語もあるらしいが、確かめていない。どちらも広く使われてはいないので、`.zu` のままにした。

GitHub の言語判定(linguist、https://github.com/github-linguist/linguist の `lib/linguist/languages.yml`)には、Zimbu も `.zu` も載っていない(2026-11-08 に v4.0.0、v5〜v9.2 と今の main で確かめた)。GitHub では `.zu` はどの言語にも数えられず、色付けもされない。

GitHub で色付けや言語の内訳に載せるには linguist に言語を足す必要があり、それには多くのリポジトリで使われていることが求められる。今は考えない。

なお、ほかの拡張子の案も linguist ではどれも空いていた(`.zuz`、`.lawz`、`.rose`、`.roz`、`.lz`、`.rz` など)。ただし GitHub の外では、`.lz` は lzip、`.rz` は rzip という圧縮の形式で、`.zul` は ZK(Java の画面の部品)の書式。

## ロゴ

30案から 01「上から見た渦」を選んだ。ばら色の丸に白い渦が一本の形で、ばらを上から見たところ。16px のファビコンでも渦が見える。

- 案の一覧: https://claude.ai/artifact/Sam26drKV2M5ktkJef3NJH(非公開。持ち主だけが開ける)
- 色: ばら色 `#C42B4B`、白 `#FFFFFF`。エディタは強調と選択にこのばら色を使い、地はわずかに赤みのある灰色(`#F6F3F4`)にした
- 字: 「Law図」は明朝の太字で、「図」だけばら色にする。明朝の書体は端末の書体を使う(Web フォントは読み込まない)

## ファイル

| ファイル | 中身 |
| --- | --- |
| `editor/public/favicon.svg` | ロゴの正本(64×64)。ファビコン、見出しのロゴ、ほかの画像の元 |
| `editor/public/apple-touch-icon.png` | iPhone のホーム画面用(180×180、白地) |
| `editor/public/icon-512.png` | アプリとして入れるとき用(512×512、透明) |
| `editor/public/og.png` | SNS などで共有したときに出る画像(1200×630) |
| `editor/public/site.webmanifest` | アプリとしての名前、色、アイコン |
| `docs/brand/icon.html`、`docs/brand/og.html` | PNG を作るための台紙 |

PNG は台紙を Chrome で写して作る。ロゴや文言を変えたら作り直す(リポジトリの直下で、Git Bash から):

```
C="/c/Program Files/Google/Chrome/Application/chrome.exe"
B="file:///$(cygpath -m "$PWD")/docs/brand"
P="$(cygpath -w "$PWD")\\editor\\public"
"$C" --headless=new --hide-scrollbars --window-size=180,180 --screenshot="$P\\apple-touch-icon.png" "$B/icon.html?size=180&bg=%23ffffff&pad=0.08"
"$C" --headless=new --hide-scrollbars --default-background-color=00000000 --window-size=512,512 --screenshot="$P\\icon-512.png" "$B/icon.html?size=512&pad=0"
"$C" --headless=new --hide-scrollbars --window-size=1200,630 --screenshot="$P\\og.png" "$B/og.html"
```

## 検索と共有(SEO)

`editor/index.html` に書いたもの:

- 題名と説明文(`description`)
- canonical
- 共有用の情報(Open Graph と Twitter のカード)
- 構造化データ(schema.org の `WebApplication`)
- テーマの色、マニフェスト
- JavaScript が動かないときの説明文(`noscript`)

公開先の URL が要るもの(canonical、`og:url`、`og:image`、構造化データの `url`、サイトマップ)は、`editor/vite.config.ts` が組み立てのときに差し込む。

- URL は環境変数 `SITE_URL` から取る。なければ、Vercel が組み立てのときに渡す `VERCEL_PROJECT_PRODUCTION_URL` を使う
- 独自のドメインを使うなら、Vercel の環境変数に `SITE_URL`(例 `https://example.com`)を入れる
- URL が分からないとき(手元の `npm run dev` など)は、URL の要る行を消す
- `robots.txt` はいつも書き出し、`sitemap.xml` は URL が分かるときだけ書き出す

## 未決

- ファビコンを小さい大きさ向けに描き分けるか(今は 16px でも同じ図)
- 暗い色の画面(ダークモード)のエディタ。今は明るい色だけ
- 使い方を説明するページ。今はエディタの1枚だけなので、検索で拾われる文章が少ない
