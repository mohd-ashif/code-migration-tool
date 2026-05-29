import { ParsedFile, ParserResult } from "../types/parser.types";

export async function parseTypeScript(files: ParsedFile[]): Promise<ParserResult> {
  return {
    framework: "typescript",
    files,
    metadata: { parsedAt: new Date().toISOString() },
  };
}
