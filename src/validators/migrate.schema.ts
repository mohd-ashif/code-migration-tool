import { ParsedFile } from "../types/parser.types";
import { SourceFramework, TargetFramework } from "../types/migration.types";

const targetFrameworks: TargetFramework[] = ["react", "next", "typescript", "vue"];
const sourceFrameworks: SourceFramework[] = ["angular", "vue", "react", "javascript", "typescript"];

export function validateMigrationRequest(body: any): body is {
  projectFiles: ParsedFile[];
  targetFramework: TargetFramework;
  sourceFramework?: SourceFramework;
} {
  return (
    body &&
    Array.isArray(body.projectFiles) &&
    body.projectFiles.every((file: any) => typeof file.path === "string" && typeof file.content === "string") &&
    typeof body.targetFramework === "string" &&
    targetFrameworks.includes(body.targetFramework) &&
    (body.sourceFramework === undefined || (typeof body.sourceFramework === "string" && sourceFrameworks.includes(body.sourceFramework)))
  );
}
