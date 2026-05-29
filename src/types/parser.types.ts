export interface ParsedFile {
  path: string;
  content: string;
}

export interface ParserResult {
  framework: string;
  files: ParsedFile[];
  metadata: Record<string, unknown>;
}
