import { ParsedFile, ParserResult } from "../types/parser.types";

export async function parseAngular(files: ParsedFile[]): Promise<ParserResult> {
  return {
    framework: "angular",
    files,
    metadata: { parsedAt: new Date().toISOString() },
  };
}
