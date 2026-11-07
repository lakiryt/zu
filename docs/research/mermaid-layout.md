# 調査: Mermaid は配置と大きさをどう扱っているか(2026-11-07)

zu を「できるだけ数値に頼らない」書き方にするための参考として調べた。Mermaid の公式文書と GitHub の issue、discussion を検索で確かめた。実際の描画は確かめていない(描画で確かめたことは [handoff.md](../handoff.md) の「Mermaid で試したこと」にある)。

## まとめ

Mermaid は基本的に座標も大きさも書かせない。書けるのは「向き」「まとまり」「隣との関係」だけで、残りは自動で決める。

| 図の種類 | 置き方 | 大きさ・間隔 |
| --- | --- | --- |
| flowchart | 完全に自動(dagre / ELK)。書けるのは向き(`TD`/`LR`)と `subgraph` によるまとめだけ | 図形はラベルに合わせて自動。間隔は設定(`nodeSpacing`、`rankSpacing`)で図全体に一律 |
| block-beta | 格子。`columns 3` で列の数を決め、書いた順に左上から詰める。`space:2` で空きのマス | 幅はマスの数(`a:2` で2マス分)。列の幅はその列でいちばん広い図形に合わせる。入れ子の `block` の中で別の `columns` を持てる |
| architecture-beta | 線の端に辺を書く(`db:R -- L:server` で db の右辺と server の左辺をつなぐ)。辺の向きから並びが決まる。`db:T -- L:server` は直角に曲がる線 | 自動 |

## 座標の固定について

- flowchart で図形の座標を固定する機能は、何年も前から求められているが入っていない。[#1500](https://github.com/mermaid-js/mermaid/issues/1500) は [#820]、[#548]、[#274] の出し直しで、繰り返し出ている
- [#418](https://github.com/mermaid-js/mermaid/issues/418)(2016年)は、線でつないだ図形を同じ段に置きたい(線のせいで片方が下がるのを避けたい)という要望
- [#5420](https://github.com/mermaid-js/mermaid/issues/5420)(2024年3月)は ELK での位置指定の要望。検索した時点ではトリアージ中だった
- [discussion #7722](https://github.com/orgs/mermaid-js/discussions/7722) は、ドラッグで位置を直せるようにする提案。本体には線に `data-source`/`data-target` を付けるだけにし、ドラッグの UI は Live Editor か別のパッケージで作る方向。取り込まれたかどうかは確かめていない
- [discussion #7997](https://github.com/orgs/mermaid-js/discussions/7997) によると、`L`/`R`/`T`/`B` の辺の指定は architecture-beta の文法にしかなく、flowchart では効かない

## zu にとっての意味

- flowchart の「全部自動」は、思う位置に置けないので zu の目的に合わない(handoff の結論と同じ)
- block-beta の格子は、揃えが自動で効く点が良い。ただし間隔を調整しにくく、詰めると線のラベルが重なった
- architecture-beta の「隣との関係で決める」は、zu の `below a` とほぼ同じ考え方
- 間隔を図全体の設定にする(flowchart の `nodeSpacing`)のは、一つ一つの文から数値を追い出す一つのやり方

検討の続きは [design/placement.md](../design/placement.md)。

## 出典

- [Mermaid: Block Diagrams](https://mermaid.js.org/syntax/block)
- [Mermaid: Architecture Diagrams](https://mermaid.js.org/syntax/architecture)
- [mermaid-js/mermaid #1500](https://github.com/mermaid-js/mermaid/issues/1500)
- [mermaid-js/mermaid #418](https://github.com/mermaid-js/mermaid/issues/418)
- [mermaid-js/mermaid #5420](https://github.com/mermaid-js/mermaid/issues/5420)
- [mermaid-js discussion #7722](https://github.com/orgs/mermaid-js/discussions/7722)
- [mermaid-js discussion #7997](https://github.com/orgs/mermaid-js/discussions/7997)

[#820]: https://github.com/mermaid-js/mermaid/issues/820
[#548]: https://github.com/mermaid-js/mermaid/issues/548
[#274]: https://github.com/mermaid-js/mermaid/issues/274
