import { v4 as uuidv4 } from "uuid";
import { createHash } from "crypto";
import * as path from "path";
import * as fs from "fs";
import { MigrationRequest, MigrationResult } from "../types/migration.types";
import { enqueueMigration, migrationQueue } from "../queues/migration.queue";
import { activeJobs } from "../queues/workers/migration.worker";
import { queryDatabase, dbPool } from "../lib/database";
import { logger } from "../utils/logger";
import { config } from "../config";
import { createArchive } from "./zip.service";
import { MigrationRepository } from "../repositories/MigrationRepository";
import { UploadRepository } from "../repositories/UploadRepository";
import { MigrationReportService } from "./MigrationReportService";
import { wsService } from "./ws.service";

export interface JobRecord {
  id: string;
  status: "pending" | "processing" | "paused" | "completed" | "failed" | "cancelled";
  progress?: number;
  stage?: string;
  activeFile?: string;
  speed?: string;
  result?: MigrationResult | null;
  message?: string | null;
  request?: MigrationRequest | null;
}

const jobStore = new Map<string, JobRecord>();

export async function persistJobToDb(id: string, request: MigrationRequest, workspaceId?: string, userId?: string) {
  if (!dbPool) return;
  try {
    let projectName = `Project_${request.sourceFramework || "unknown"}_to_${request.targetFramework}`;
    let projectSize = 0;

    const files = request.projectFiles || [];
    for (const f of files) {
      projectSize += Buffer.byteLength(f.content || "", "utf8");
      if (f.path === "package.json") {
        try {
          const pkg = JSON.parse(f.content);
          if (pkg.name) {
            projectName = pkg.name;
          }
        } catch {
          // Ignore
        }
      }
    }

    const migrationRepo = new MigrationRepository();
    await migrationRepo.create({
      id,
      status: "pending",
      request,
      progress: 0,
      workspaceId: workspaceId || "00000000-0000-0000-0000-000000000001",
      userId: userId || "00000000-0000-0000-0000-000000000000",
      projectName,
      projectSize,
      sourceFramework: request.sourceFramework,
      targetFramework: request.targetFramework,
    });

    const archiveBuffer = await createArchive(files);
    const uploadsDir = path.join(__dirname, "..", "..", "scratch", "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const relativePath = path.join("scratch", "uploads", `project-${id}.zip`);
    const storagePath = path.join(__dirname, "..", "..", relativePath);
    fs.writeFileSync(storagePath, archiveBuffer);

    const checksum = createHash("sha256").update(archiveBuffer).digest("hex");

    const uploadRepo = new UploadRepository();
    await uploadRepo.create({
      workspaceId: workspaceId || "00000000-0000-0000-0000-000000000001",
      userId: userId || "00000000-0000-0000-0000-000000000000",
      jobId: id,
      originalFilename: `${projectName}.zip`,
      storagePath: relativePath,
      size: projectSize,
      checksum,
    });
  } catch (err) {
    logger.error(`Failed to persist job ${id}: ${err}`);
  }
}

export function enqueueMigrationJob(request: MigrationRequest, workspaceId?: string, userId?: string): JobRecord {
  const id = request.jobId ?? uuidv4();
  const job: JobRecord = { id, status: "pending", progress: 0, result: null, message: null, request };
  jobStore.set(id, job);

  persistJobToDb(id, request, workspaceId, userId);

  const submission: MigrationRequest = { ...request, jobId: id };

  wsService.broadcast({
    type: "status",
    jobId: id,
    progress: 0,
    stage: "Queued",
    message: "Migration task added to queue."
  });

  if (!config.REDIS_URL) {
    logger.info(`No Redis configured. Running migration job ${id} synchronously in the background.`);
    (async () => {
      const { migrateProject } = require("./migration.service");
      try {
        await updateJobProgress(id, 10, "Initializing", undefined, undefined, "Analyzing codebase AST...");
        const result = await migrateProject(
          submission,
          async (progressPercent: number) => {
            await updateJobProgress(id, progressPercent, "Transforming", undefined, undefined, `Processing file transformations (${progressPercent}%)...`);
          }
        );
        await markJobCompleted(id, result);
      } catch (err: any) {
        logger.error(`Job ${id} failed: ${err.message}`);
        await markJobFailed(id, err.message);
      }
    })();
  } else {
    enqueueMigration(submission);
  }

  return job;
}

export async function updateJobProgress(
  jobId: string,
  progress: number,
  stage?: string,
  activeFile?: string,
  speed?: string,
  logMessage?: string
) {
  const originalJob = jobStore.get(jobId);

  if (originalJob && (originalJob.status === "completed" || originalJob.status === "failed" || originalJob.status === "cancelled")) {
    return;
  }

  const updatedRecord: JobRecord = {
    id: jobId,
    status: originalJob?.status === "paused" ? "paused" : "processing",
    progress,
    stage: stage || originalJob?.stage || "Processing",
    activeFile: activeFile || originalJob?.activeFile,
    speed: speed || originalJob?.speed,
    result: originalJob?.result ?? null,
    message: originalJob?.message ?? null,
    request: originalJob?.request,
  };

  jobStore.set(jobId, updatedRecord);

  // Broadcast WebSocket update
  wsService.broadcast({
    type: "progress",
    jobId,
    progress,
    stage: updatedRecord.stage,
    file: activeFile,
    speed,
    log: logMessage || `[Processing] Progress: ${progress}% ${activeFile ? `(${activeFile})` : ""}`,
  });

  if (!dbPool) return;
  try {
    const migrationRepo = new MigrationRepository();
    await migrationRepo.update(jobId, {
      status: updatedRecord.status as any,
      progress,
    });
  } catch (err) {
    logger.error(`Failed to update job ${jobId} progress to ${progress}%: ${err}`);
  }
}

export async function pauseJob(jobId: string): Promise<boolean> {
  const job = jobStore.get(jobId);
  if (!job || job.status !== "processing") return false;

  job.status = "paused";
  jobStore.set(jobId, job);

  wsService.broadcast({
    type: "paused",
    jobId,
    progress: job.progress,
    stage: "Paused",
    message: "Job paused by user request."
  });

  if (dbPool) {
    try {
      const migrationRepo = new MigrationRepository();
      await migrationRepo.update(jobId, { status: "paused" as any });
    } catch {
      // Ignore
    }
  }

  return true;
}

export async function resumeJob(jobId: string): Promise<boolean> {
  const job = jobStore.get(jobId);
  if (!job || job.status !== "paused") return false;

  job.status = "processing";
  jobStore.set(jobId, job);

  wsService.broadcast({
    type: "resumed",
    jobId,
    progress: job.progress,
    stage: "Processing",
    message: "Job resumed by user request."
  });

  if (dbPool) {
    try {
      const migrationRepo = new MigrationRepository();
      await migrationRepo.update(jobId, { status: "processing" });
    } catch {
      // Ignore
    }
  }

  return true;
}

export async function cancelJob(jobId: string): Promise<boolean> {
  const job = jobStore.get(jobId);
  if (!job) return false;

  job.status = "cancelled";
  jobStore.set(jobId, job);

  wsService.broadcast({
    type: "status",
    jobId,
    progress: job.progress,
    stage: "Cancelled",
    message: "Job cancelled by user request."
  });

  if (dbPool) {
    try {
      const migrationRepo = new MigrationRepository();
      await migrationRepo.update(jobId, { status: "cancelled" as any });
    } catch {
      // Ignore
    }
  }

  return true;
}

export async function retryJob(jobId: string): Promise<JobRecord | null> {
  const job = jobStore.get(jobId);
  if (!job || !job.request) return null;

  return enqueueMigrationJob(job.request);
}

export async function markJobCompleted(jobId: string, result: MigrationResult) {
  const originalJob = jobStore.get(jobId);
  jobStore.set(jobId, { id: jobId, status: "completed", progress: 100, stage: "Complete", result, message: null, request: originalJob?.request });

  wsService.broadcast({
    type: "complete",
    jobId,
    progress: 100,
    stage: "Completed",
    log: "Migration completed successfully! Summary report generated.",
    data: result,
  });

  if (!dbPool) return;
  try {
    const migrationRepo = new MigrationRepository();
    const updatedJob = await migrationRepo.update(jobId, {
      status: "completed",
      result,
      progress: 100,
      completedAt: new Date(),
    });

    if (updatedJob && updatedJob.user_id && updatedJob.workspace_id) {
      const reportService = new MigrationReportService();
      await reportService.generateAndStoreReport(jobId, updatedJob.user_id, updatedJob.workspace_id);
      logger.info(`Automatically generated report for completed job ${jobId}`);
    }
  } catch (err) {
    logger.error(`Failed to update job ${jobId} as completed: ${err}`);
  }
}

export async function markJobFailed(jobId: string, message?: string) {
  const originalJob = jobStore.get(jobId);
  jobStore.set(jobId, { id: jobId, status: "failed", progress: originalJob?.progress || 0, stage: "Failed", result: null, message: message ?? null, request: originalJob?.request });

  wsService.broadcast({
    type: "failed",
    jobId,
    progress: originalJob?.progress || 0,
    stage: "Failed",
    log: `Migration failed: ${message || "Unknown error"}`,
    message: message || "Migration task failed.",
  });

  if (!dbPool) return;
  try {
    const migrationRepo = new MigrationRepository();
    await migrationRepo.update(jobId, {
      status: "failed",
      message: message ?? null,
      completedAt: new Date(),
    });
  } catch (err) {
    logger.error(`Failed to update job ${jobId} as failed: ${err}`);
  }
}

export async function getJobResult(jobId: string, workspaceId?: string): Promise<JobRecord | undefined> {
  let job: JobRecord | undefined;

  if (dbPool) {
    try {
      const migrationRepo = new MigrationRepository();
      const dbRecord = await migrationRepo.findByIdInternal(jobId);

      if (dbRecord) {
        return {
          id: dbRecord.id,
          status: dbRecord.status as any,
          progress: dbRecord.progress,
          result: dbRecord.result,
          message: dbRecord.message,
          request: dbRecord.request,
        };
      }
    } catch (err) {
      logger.error(`Failed to fetch job ${jobId} from DB: ${err}`);
    }
  }

  job = jobStore.get(jobId);
  return job;
}
