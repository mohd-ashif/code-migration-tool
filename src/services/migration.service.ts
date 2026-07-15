import { MigrationRequest, MigrationResult } from "../types/migration.types";
import { runCodemod } from "./codemod.service";
import { runIsolatedMigration, validateProject } from "./sandbox.service";
import { createArchive, extractArchive } from "./zip.service";
import { logger } from "../utils/logger";
import { exec } from "child_process";

export async function migrateProject(
  request: MigrationRequest,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal
): Promise<MigrationResult> {
  if (signal?.aborted) {
    throw new Error("Job aborted");
  }

  const jobId = request.jobId || `job-${Date.now()}`;
  const sourceFramework = request.sourceFramework ?? "javascript";
  let migratedFiles = [] as any[];
  let sandboxSuccess = false;
  let sandboxLog = "";

  // 1. Attempt Svelte Isolated Migration inside Docker Sandbox
  const dockerPromise = new Promise<boolean>((resolve) => {
    exec("docker info", { timeout: 2000 }, (err) => {
      resolve(!err);
    });
  });

  const isDockerAvailable = false; // Disable Docker sandbox on local developer machine to prevent hangs

  if (isDockerAvailable) {
    logger.info(`Docker detected. Initiating isolated sandbox migration for ${jobId}...`);
    try {
      if (onProgress) onProgress(10);

      // Package original files to ZIP
      const reactZip = await createArchive(request.projectFiles);
      if (onProgress) onProgress(20);

      // Run Svelte Migration completely inside Docker container
      const sandboxRes = await runIsolatedMigration(reactZip, jobId);
      sandboxSuccess = sandboxRes.success;
      sandboxLog = sandboxRes.output || "";

      if (sandboxRes.success && sandboxRes.zippedBuffer) {
        if (onProgress) onProgress(80);
        // Extract Svelte files from compiled sandbox ZIP
        migratedFiles = await extractArchive(sandboxRes.zippedBuffer);
        logger.info(`Isolated sandbox migration completed successfully for ${jobId}.`);
        if (onProgress) onProgress(100);
      } else {
        logger.warn(`Docker sandbox migration returned failure state: ${sandboxRes.errors.join(", ")}`);
      }
    } catch (e: any) {
      logger.error(`Exception triggered during sandbox execution: ${e.message}`);
    }
  }

  // 2. Local Fallback compilation if Docker sandbox failed or is missing
  if (!sandboxSuccess || migratedFiles.length === 0) {
    logger.info(`Running standard migration pipeline on host as fallback for ${jobId}...`);
    
    migratedFiles = await runCodemod(
      request.projectFiles,
      sourceFramework,
      request.targetFramework,
      onProgress,
      signal
    );

    // Validate using standard Svelte project build validation
    const validation = await validateProject(migratedFiles, jobId);
    
    return {
      success: true,
      targetFramework: request.targetFramework,
      migratedFiles,
      metadata: {
        fileCount: migratedFiles.length,
        origin: request.sourceFramework || "unknown",
        sandbox: {
          isolated: false,
          validation: {
            success: validation.success,
            stage: validation.stage,
            errors: validation.errors,
          }
        }
      },
    };
  }

  return {
    success: true,
    targetFramework: request.targetFramework,
    migratedFiles,
    metadata: {
      fileCount: migratedFiles.length,
      origin: request.sourceFramework || "unknown",
      sandbox: {
        isolated: true,
        success: true,
        output: sandboxLog,
      }
    },
  };
}
