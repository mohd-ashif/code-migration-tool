import { migrateReactCodeToSvelte, migrateReactProjectToSvelte } from "../react-to-svelte/index";
import { ParsedFile } from "../../types/parser.types";

/**
 * Transforms React component code to Svelte using the AST-based compiler.
 */
export function transformReactToSvelte(
  sourceCode: string,
  filePath: string
): { content: string; path: string } {
  const content = migrateReactCodeToSvelte(sourceCode, filePath);
  const newPath = filePath.replace(/\.[a-zA-Z]+$/, ".svelte");
  return { content, path: newPath };
}

/**
 * Project-wide migration of React files to Svelte.
 */
export function migrateReactProject(files: ParsedFile[]): ParsedFile[] {
  return migrateReactProjectToSvelte(files);
}
