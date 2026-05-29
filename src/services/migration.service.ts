import { MigrationRequest, MigrationResult } from "../types/migration.types";
import { runCodemod } from "./codemod.service";

export async function migrateProject(request: MigrationRequest): Promise<MigrationResult> {
  const sourceFramework = request.sourceFramework ?? "javascript";
  const migratedFiles = await runCodemod(request.projectFiles, sourceFramework, request.targetFramework);

  return {
    success: true,
    targetFramework: request.targetFramework,
    migratedFiles,
    metadata: {
      fileCount: migratedFiles.length,
      origin: request.sourceFramework || "unknown",
    },
  };
}
