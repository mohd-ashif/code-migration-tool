import { ParsedFile, ParserResult } from "../types/parser.types";

export async function parseReact(files: ParsedFile[]): Promise<ParserResult> {
  return {
    framework: "react",
    files,
    metadata: { parsedAt: new Date().toISOString() },
  };
}
