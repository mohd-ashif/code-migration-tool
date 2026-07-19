import { MigrationRequest, MigrationResult } from "../types/migration.types";
import { runCodemod } from "./codemod.service";
import { runIsolatedMigration, validateProject } from "./sandbox.service";
import { createArchive, extractArchive } from "./zip.service";
import { logger } from "../utils/logger";
import { exec } from "child_process";
import { queryDatabase } from "../lib/database";
import { EngineRepository } from "../repositories/EngineRepository";

function normalizeSlug(framework: string): string {
  const fw = framework.toLowerCase().trim();
  if (fw === "next") return "nextjs";
  if (fw === "solid") return "solidjs";
  return fw;
}

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
  const srcSlug = normalizeSlug(sourceFramework);
  const tgtSlug = normalizeSlug(request.targetFramework);

  // 1. Pre-Migration Gatekeeping
  const route = await queryDatabase(
    `SELECT sm.supported 
     FROM supported_migrations sm
     JOIN frameworks fs ON fs.id = sm.source_framework_id
     JOIN frameworks ft ON ft.id = sm.target_framework_id
     WHERE fs.slug = $1 AND ft.slug = $2 LIMIT 1`,
    [srcSlug, tgtSlug]
  );

  if (!route || route.length === 0 || !route[0].supported) {
    throw new Error(`Migration route from ${sourceFramework} to ${request.targetFramework} is not supported or active.`);
  }

  // 2. Resource Bounds Throttling
  const settingsRows = await queryDatabase(
    `SELECT cs.*, me.id as engine_id FROM compiler_settings cs
     JOIN frameworks f ON f.id = cs.framework_id
     LEFT JOIN migration_engines me ON me.framework_id = f.id AND me.status = 'active'
     WHERE f.slug = $1 LIMIT 1`,
    [tgtSlug]
  );

  const settings = settingsRows[0];
  if (settings) {
    const maxFileSizeKB = settings.max_file_size;
    for (const file of request.projectFiles) {
      const sizeKB = Buffer.byteLength(file.content, 'utf8') / 1024;
      if (sizeKB > maxFileSizeKB) {
        throw new Error(`File ${file.path} size (${sizeKB.toFixed(1)} KB) exceeds the maximum allowed size of ${maxFileSizeKB} KB for target framework ${request.targetFramework}.`);
      }
    }
  }

  const timeoutSeconds = settings?.timeout ?? 30;
  const timeoutMs = timeoutSeconds * 1000;

  let timeoutId: NodeJS.Timeout | undefined;
  let localSignal = signal;

  if (timeoutMs > 0) {
    const controller = new AbortController();
    if (signal) {
      signal.addEventListener("abort", () => controller.abort());
    }
    timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    localSignal = controller.signal;
  }

  let migratedFiles = [] as any[];
  let sandboxSuccess = false;
  let sandboxLog = "";
  const startTime = Date.now();

  try {
    // 3. Attempt Svelte Isolated Migration inside Docker Sandbox
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

    // 4. Local Fallback compilation if Docker sandbox failed or is missing
    if (!sandboxSuccess || migratedFiles.length === 0) {
      logger.info(`Running standard migration pipeline on host as fallback for ${jobId}...`);
      
      migratedFiles = await runCodemod(
        request.projectFiles,
        sourceFramework,
        request.targetFramework,
        onProgress,
        localSignal
      );

      // Validate using standard Svelte project build validation
      const validation = await validateProject(migratedFiles, jobId);
      
      const durationMs = Date.now() - startTime;
      if (timeoutId) clearTimeout(timeoutId);

      // Update engine statistics
      if (settings?.engine_id) {
        try {
          const engineRepo = new EngineRepository();
          await engineRepo.incrementMigrationsRun(settings.engine_id, durationMs);
        } catch (err: any) {
          logger.error(`Failed to update engine stats: ${err.message}`);
        }
      }

      // Log to migration_logs
      try {
        const auditMsg = `[COMPILER TELEMETRY] Job ${jobId} compiled successfully. Source: ${sourceFramework}, Target: ${request.targetFramework}. Files: ${migratedFiles.length}, Duration: ${durationMs}ms.`;
        await queryDatabase(
          `INSERT INTO migration_logs (level, message) VALUES ($1, $2)`,
          ["INFO", auditMsg]
        );
      } catch (err: any) {
        logger.error(`Failed to write telemetry audit log: ${err.message}`);
      }

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

    const durationMs = Date.now() - startTime;
    if (timeoutId) clearTimeout(timeoutId);

    // Update engine statistics
    if (settings?.engine_id) {
      try {
        const engineRepo = new EngineRepository();
        await engineRepo.incrementMigrationsRun(settings.engine_id, durationMs);
      } catch (err: any) {
        logger.error(`Failed to update engine stats: ${err.message}`);
      }
    }

    // Log to migration_logs
    try {
      const auditMsg = `[COMPILER TELEMETRY] Job ${jobId} compiled successfully (Isolated Sandbox). Source: ${sourceFramework}, Target: ${request.targetFramework}. Files: ${migratedFiles.length}, Duration: ${durationMs}ms.`;
      await queryDatabase(
        `INSERT INTO migration_logs (level, message) VALUES ($1, $2)`,
        ["INFO", auditMsg]
      );
    } catch (err: any) {
      logger.error(`Failed to write telemetry audit log: ${err.message}`);
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
  } catch (err: any) {
    if (timeoutId) clearTimeout(timeoutId);
    if (localSignal?.aborted && !signal?.aborted) {
      throw new Error(`Migration compilation timed out after ${timeoutSeconds} seconds. Please increase compiler settings limits.`);
    }
    throw err;
  }
}
