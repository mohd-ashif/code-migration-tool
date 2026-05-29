import { ParsedFile, ParserResult } from "../types/parser.types";

export async function parseVue(files: ParsedFile[]): Promise<ParserResult> {
  return {
    framework: "vue",
    files,
    metadata: { parsedAt: new Date().toISOString() },
  };
}
