import { ParsedFile, ParserResult } from "../types/parser.types";

export async function parseJavaScript(files: ParsedFile[]): Promise<ParserResult> {
  return {
    framework: "javascript",
    files,
    metadata: { parsedAt: new Date().toISOString() },
  };
}
