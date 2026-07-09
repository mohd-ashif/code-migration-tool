import * as ts from "typescript";

export function parseSourceFile(sourceCode: string, filePath: string): ts.SourceFile {
  return ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true);
}
