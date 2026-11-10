// 文字の欄の上で選べるサンプル。どれも examples/ の .zu で、一つに一つの書き方を見せる
import agency from "../examples/agency.zu?raw";
import annotations from "../examples/annotations.zu?raw";
import exchange from "../examples/exchange.zu?raw";
import property from "../examples/property.zu?raw";
import revocation from "../examples/revocation.zu?raw";
import tree from "../examples/tree.zu?raw";

export type Sample = { name: string; file: string; source: string };

// 最初のものは、初めて開いたときに出す
export const SAMPLES: Sample[] = [
  { name: "代理(置き方と線)", file: "agency.zu", source: agency },
  { name: "物の置き方(土地、動産、into)", file: "property.zu", source: property },
  { name: "線に向ける線(詐害行為取消)", file: "revocation.zu", source: revocation },
  { name: "曲げた線(同時履行)", file: "exchange.zu", source: exchange },
  { name: "注釈(吹き出しと注記)", file: "annotations.zu", source: annotations },
  { name: "木(箇条書きの分類)", file: "tree.zu", source: tree },
];
