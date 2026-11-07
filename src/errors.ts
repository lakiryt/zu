import type { SourcePosition } from "./syntax/ast.ts";

// 書いた図のどこが誤りかを、行と列(1から数える)で示す
export class ZuError extends Error {
  readonly line: number;
  readonly column: number;
  readonly reason: string;

  constructor(reason: string, { line, column }: SourcePosition) {
    super(`${line}行目 ${column}文字目: ${reason}`);
    this.name = "ZuError";
    this.reason = reason;
    this.line = line;
    this.column = column;
  }
}
