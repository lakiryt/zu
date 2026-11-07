// 使い方: node zu/cli.ts <入力.zu> [出力.svg]
// 出力を省くと標準出力に書く
import { readFileSync, writeFileSync } from "node:fs";
import { ZuError, render } from "./src/index.ts";

const [input, output] = process.argv.slice(2);
if (!input) {
  console.error("使い方: node zu/cli.ts <入力.zu> [出力.svg]");
  process.exit(2);
}

try {
  const svg = render(readFileSync(input, "utf8"));
  if (output) writeFileSync(output, svg);
  else process.stdout.write(svg);
} catch (error) {
  if (!(error instanceof ZuError)) throw error;
  console.error(`${input}: ${error.message}`);
  process.exit(1);
}
