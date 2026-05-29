import { ParsedFile } from "../types/parser.types";
import { SourceFramework, TargetFramework } from "../types/migration.types";
import { transformAngularToReact } from "../codemods/angular/angular-class-to-function";
import { transformVueSFCToJSX } from "../codemods/vue/vue-sfc-to-jsx";
import { transformJSToTS } from "../codemods/javascript/js-to-ts";
import { transformReactToNext } from "../codemods/react/react-to-next";

export const supportedMigrationPairs: Array<{ source: SourceFramework; target: TargetFramework }> = [
  { source: "angular", target: "react" },
  { source: "vue", target: "react" },
  { source: "javascript", target: "typescript" },
  { source: "react", target: "typescript" },
  { source: "react", target: "next" },
];

export function isSupportedMigrationPair(source: SourceFramework, target: TargetFramework): boolean {
  return supportedMigrationPairs.some((pair) => pair.source === source && pair.target === target);
}

export async function runCodemod(
  projectFiles: ParsedFile[],
  sourceFramework: SourceFramework,
  targetFramework: TargetFramework
): Promise<ParsedFile[]> {
  return projectFiles.map((file) => {
    let content = file.content;
    let path = file.path;

    if (sourceFramework === "angular" && targetFramework === "react") {
      content = transformAngularToReact(content);
    } else if (sourceFramework === "vue" && targetFramework === "react") {
      content = transformVueSFCToJSX(content);
    } else if (sourceFramework === "javascript" && targetFramework === "typescript") {
      const result = transformJSToTS(content, path);
      content = result.content;
      path = result.path;
    } else if (sourceFramework === "react" && targetFramework === "typescript") {
      const result = transformJSToTS(content, path);
      content = result.content;
      path = result.path;
    } else if (sourceFramework === "react" && targetFramework === "next") {
      content = transformReactToNext(content);
    }

    return { ...file, content, path };
  });
}
