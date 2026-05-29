import { detectFramework } from "../utils/detectFramework";
import { ParsedFile, ParserResult } from "../types/parser.types";
import { parseAngular } from "../parsers/angular.parser";
import { parseReact } from "../parsers/react.parser";
import { parseVue } from "../parsers/vue.parser";
import { parseJavaScript } from "../parsers/js.parser";
import { parseTypeScript } from "../parsers/typescript.parser";

export interface ParseInput {
  projectFiles: ParsedFile[];
  metadata?: Record<string, unknown>;
}

export async function parseProject(input: ParseInput): Promise<ParserResult> {
  const detected = detectFramework(input.projectFiles);

  switch (detected) {
    case "angular":
      return parseAngular(input.projectFiles);
    case "react":
      return parseReact(input.projectFiles);
    case "vue":
      return parseVue(input.projectFiles);
    case "typescript":
      return parseTypeScript(input.projectFiles);
    default:
      return parseJavaScript(input.projectFiles);
  }
}
