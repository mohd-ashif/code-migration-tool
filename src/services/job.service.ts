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
import { isValidTransition, isJobPausable, isJobResumable, isJobCancellable, isJobRetriable, MigrationJobStatus } from "./state-machine";

export interface JobRecord {
  id: string;
  status: MigrationJobStatus | any;
  progress?: number;
  stage?: string;
  activeFile?: string;
  speed?: string;
  result?: MigrationResult | null;
  message?: string | null;
  request?: MigrationRequest | null;
  workspaceId?: string | null;
  userId?: string | null;
  retryOfJobId?: string | null;
  originalJobId?: string | null;
  attemptCount?: number;
}

const jobStore = new Map<string, JobRecord>();

export async function persistJobToDb(
  id: string,
  request: MigrationRequest,
  workspaceId?: string,
  userId?: string,
  retryOfJobId?: string,
  originalJobId?: string,
  attemptCount = 1
) {
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
      status: "QUEUED",
      request,
      progress: 0,
      workspaceId: workspaceId || "00000000-0000-0000-0000-000000000001",
      userId: userId || "00000000-0000-0000-0000-000000000000",
      projectName,
      projectSize,
      sourceFramework: request.sourceFramework,
      targetFramework: request.targetFramework,
    });

    await migrationRepo.update(id, {
      currentStage: "QUEUED",
      attemptCount,
      retryOfJobId,
      originalJobId,
      inputFileCount: files.length,
      inputSizeBytes: projectSize,
      queuedAt: new Date(),
    });

    await migrationRepo.createEvent({
      jobId: id,
      eventType: "job.queued",
      stage: "QUEUED",
      progress: 0,
      message: "Migration job enqueued.",
      metadata: { source: request.sourceFramework, target: request.targetFramework, attempt: attemptCount },
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

export function enqueueMigrationJob(
  request: MigrationRequest,
  workspaceId?: string,
  userId?: string,
  retryOfJobId?: string,
  originalJobId?: string,
  attemptCount = 1
): JobRecord {
  const id = request.jobId ?? uuidv4();
  const job: JobRecord = {
    id,
    status: "QUEUED",
    stage: "QUEUED",
    progress: 0,
    result: null,
    message: null,
    request,
    workspaceId,
    userId,
    retryOfJobId,
    originalJobId,
    attemptCount,
  };
  jobStore.set(id, job);

  persistJobToDb(id, request, workspaceId, userId, retryOfJobId, originalJobId, attemptCount);

  const submission: MigrationRequest = { ...request, jobId: id };

  wsService.broadcast({
    event: "job.queued",
    type: "status",
    jobId: id,
    status: "QUEUED",
    stage: "QUEUED",
    progress: 0,
    message: "Migration task added to queue."
  });

  if (!config.REDIS_URL) {
    logger.info(`No Redis configured. Running migration job ${id} synchronously in the background.`);
    (async () => {
      const { migrateProject } = require("./migration.service");
      try {
        await updateJobProgress(id, 10, "PARSING", undefined, undefined, "Analyzing codebase AST...");
        const result = await migrateProject(
          submission,
          async (progressPercent: number) => {
            await updateJobProgress(id, progressPercent, "MIGRATING", undefined, undefined, `Processing file transformations (${progressPercent}%)...`);
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

  if (originalJob && (originalJob.status === "COMPLETED" || originalJob.status === "FAILED" || originalJob.status === "CANCELLED" || originalJob.status === "completed" || originalJob.status === "failed" || originalJob.status === "cancelled")) {
    return;
  }

  const currentStage = stage || originalJob?.stage || "MIGRATING";
  const updatedStatus = originalJob?.status === "PAUSED" || originalJob?.status === "paused" ? "PAUSED" : "MIGRATING";

  const updatedRecord: JobRecord = {
    id: jobId,
    status: updatedStatus,
    progress,
    stage: currentStage,
    activeFile: activeFile || originalJob?.activeFile,
    speed: speed || originalJob?.speed,
    result: originalJob?.result ?? null,
    message: originalJob?.message ?? null,
    request: originalJob?.request,
  };

  jobStore.set(jobId, updatedRecord);

  // Broadcast WebSocket update
  wsService.broadcast({
    event: "job.progress",
    type: "progress",
    jobId,
    status: updatedStatus,
    stage: currentStage,
    progress,
    file: activeFile,
    speed,
    message: logMessage || `[Processing] Progress: ${progress}% ${activeFile ? `(${activeFile})` : ""}`,
    log: logMessage || `[Processing] Progress: ${progress}% ${activeFile ? `(${activeFile})` : ""}`,
  });

  if (!dbPool) return;
  try {
    const migrationRepo = new MigrationRepository();
    await migrationRepo.update(jobId, {
      status: updatedStatus as any,
      currentStage,
      progress,
      startedAt: originalJob?.stage === "QUEUED" ? new Date() : undefined,
    });
  } catch (err) {
    logger.error(`Failed to update job ${jobId} progress to ${progress}%: ${err}`);
  }
}

export async function pauseJob(jobId: string, workspaceId?: string): Promise<boolean> {
  let job = jobStore.get(jobId);
  const migrationRepo = new MigrationRepository();

  if (!job && dbPool) {
    const dbJob = await migrationRepo.findByIdInternal(jobId);
    if (dbJob) {
      job = { id: dbJob.id, status: dbJob.status, progress: dbJob.progress, request: dbJob.request, workspaceId: dbJob.workspace_id || undefined };
    }
  }

  if (!job || !isJobPausable(job.status)) return false;

  job.status = "PAUSED";
  job.stage = "PAUSED";
  jobStore.set(jobId, job);

  wsService.broadcast({
    event: "job.paused",
    type: "paused",
    jobId,
    status: "PAUSED",
    stage: "PAUSED",
    progress: job.progress,
    message: "Job paused by user request."
  });

  if (dbPool) {
    try {
      await migrationRepo.update(jobId, { status: "PAUSED" as any, currentStage: "PAUSED", pausedAt: new Date() });
      await migrationRepo.createEvent({
        jobId,
        eventType: "job.paused",
        stage: "PAUSED",
        progress: job.progress,
        message: "Job paused by user request."
      });
    } catch {
      // Ignore
    }
  }

  return true;
}

export async function resumeJob(jobId: string, workspaceId?: string): Promise<boolean> {
  let job = jobStore.get(jobId);
  const migrationRepo = new MigrationRepository();

  if (!job && dbPool) {
    const dbJob = await migrationRepo.findByIdInternal(jobId);
    if (dbJob) {
      job = { id: dbJob.id, status: dbJob.status, progress: dbJob.progress, request: dbJob.request, workspaceId: dbJob.workspace_id || undefined };
    }
  }

  if (!job || !isJobResumable(job.status)) return false;

  job.status = "MIGRATING";
  job.stage = "MIGRATING";
  jobStore.set(jobId, job);

  wsService.broadcast({
    event: "job.resumed",
    type: "resumed",
    jobId,
    status: "MIGRATING",
    stage: "MIGRATING",
    progress: job.progress,
    message: "Job resumed by user request."
  });

  if (dbPool) {
    try {
      await migrationRepo.update(jobId, { status: "MIGRATING" as any, currentStage: "MIGRATING" });
      await migrationRepo.createEvent({
        jobId,
        eventType: "job.resumed",
        stage: "MIGRATING",
        progress: job.progress,
        message: "Job resumed by user request."
      });
    } catch {
      // Ignore
    }
  }

  return true;
}

export async function cancelJob(jobId: string, workspaceId?: string): Promise<boolean> {
  let job = jobStore.get(jobId);
  const migrationRepo = new MigrationRepository();

  if (!job && dbPool) {
    const dbJob = await migrationRepo.findByIdInternal(jobId);
    if (dbJob) {
      job = { id: dbJob.id, status: dbJob.status, progress: dbJob.progress, request: dbJob.request, workspaceId: dbJob.workspace_id || undefined };
    }
  }

  if (!job || !isJobCancellable(job.status)) return false;

  // Signal active worker controller if running
  if (activeJobs.has(jobId)) {
    activeJobs.get(jobId)?.abort();
  }

  job.status = "CANCELLED";
  job.stage = "CANCELLED";
  jobStore.set(jobId, job);

  wsService.broadcast({
    event: "job.cancelled",
    type: "status",
    jobId,
    status: "CANCELLED",
    stage: "CANCELLED",
    progress: job.progress,
    message: "Job cancelled by user request."
  });

  if (dbPool) {
    try {
      await migrationRepo.update(jobId, { status: "CANCELLED" as any, currentStage: "CANCELLED", cancelledAt: new Date() });
      await migrationRepo.createEvent({
        jobId,
        eventType: "job.cancelled",
        stage: "CANCELLED",
        progress: job.progress,
        message: "Job cancelled by user request."
      });
    } catch {
      // Ignore
    }
  }

  // Cleanup temp storage for this job
  try {
    const tempDir = path.join(__dirname, "..", "..", "tmp", "migrations", jobId);
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup error
  }

  return true;
}

export async function retryJob(jobId: string, workspaceId?: string, userId?: string): Promise<JobRecord | null> {
  let job = jobStore.get(jobId);
  const migrationRepo = new MigrationRepository();

  let dbRecord: any = null;
  if (dbPool) {
    dbRecord = await migrationRepo.findByIdInternal(jobId);
  }

  const req = job?.request || dbRecord?.request;
  const status = job?.status || dbRecord?.status;

  if (!req || !isJobRetriable(status)) return null;

  const effectiveWorkspaceId = workspaceId || job?.workspaceId || dbRecord?.workspace_id;
  const effectiveUserId = userId || job?.userId || dbRecord?.user_id;
  const originalId = dbRecord?.originalJobId || jobId;
  const attemptCount = (dbRecord?.attemptCount || 1) + 1;

  // Create linked new attempt job
  const newJob = enqueueMigrationJob(
    req,
    effectiveWorkspaceId,
    effectiveUserId,
    jobId,
    originalId,
    attemptCount
  );

  return newJob;
}

export async function markJobCompleted(jobId: string, result: MigrationResult) {
  const originalJob = jobStore.get(jobId);
  jobStore.set(jobId, { id: jobId, status: "COMPLETED", progress: 100, stage: "COMPLETED", result, message: null, request: originalJob?.request });

  wsService.broadcast({
    event: "job.completed",
    type: "complete",
    jobId,
    status: "COMPLETED",
    stage: "COMPLETED",
    progress: 100,
    processedFiles: result.migratedFiles?.length || 0,
    totalFiles: result.migratedFiles?.length || 0,
    log: "Migration completed successfully! Summary report generated.",
    message: "Migration completed successfully! Summary report generated.",
    data: result,
  });

  if (!dbPool) return;
  try {
    const migrationRepo = new MigrationRepository();
    const updatedJob = await migrationRepo.update(jobId, {
      status: "COMPLETED" as any,
      currentStage: "COMPLETED",
      result,
      progress: 100,
      completedAt: new Date(),
      outputFileCount: result.migratedFiles?.length || 0,
      warningsCount: result.warnings?.length || 0,
      errorsCount: result.errors?.length || 0,
    });

    await migrationRepo.createEvent({
      jobId,
      eventType: "job.completed",
      stage: "COMPLETED",
      progress: 100,
      message: "Migration job completed successfully.",
      metadata: { files: result.migratedFiles?.length || 0, warnings: result.warnings?.length || 0 }
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

export async function markJobFailed(jobId: string, message?: string, errorCode?: string) {
  const originalJob = jobStore.get(jobId);
  jobStore.set(jobId, { id: jobId, status: "FAILED", progress: originalJob?.progress || 0, stage: "FAILED", result: null, message: message ?? null, request: originalJob?.request });

  wsService.broadcast({
    event: "job.failed",
    type: "failed",
    jobId,
    status: "FAILED",
    stage: "FAILED",
    progress: originalJob?.progress || 0,
    log: `Migration failed: ${message || "Unknown error"}`,
    message: message || "Migration task failed.",
  });

  if (!dbPool) return;
  try {
    const migrationRepo = new MigrationRepository();
    await migrationRepo.update(jobId, {
      status: "FAILED" as any,
      currentStage: "FAILED",
      message: message ?? null,
      errorCode: errorCode || "MIGRATION_FAILED",
      errorMessage: message ?? null,
      failedAt: new Date(),
    });

    await migrationRepo.createEvent({
      jobId,
      eventType: "job.failed",
      stage: "FAILED",
      progress: originalJob?.progress || 0,
      message: message || "Migration task failed.",
      metadata: { errorCode: errorCode || "MIGRATION_FAILED" }
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
      const dbRecord = workspaceId
        ? await migrationRepo.findById(jobId, undefined as any, workspaceId) || await migrationRepo.findByIdInternal(jobId)
        : await migrationRepo.findByIdInternal(jobId);

      if (dbRecord) {
        return {
          id: dbRecord.id,
          status: dbRecord.status as any,
          stage: dbRecord.currentStage || (dbRecord.status as string),
          progress: dbRecord.progress,
          result: dbRecord.result,
          message: dbRecord.message,
          request: dbRecord.request,
          workspaceId: dbRecord.workspace_id || undefined,
          userId: dbRecord.user_id || undefined,
          attemptCount: dbRecord.attemptCount,
          retryOfJobId: dbRecord.retryOfJobId || undefined,
          originalJobId: dbRecord.originalJobId || undefined,
        };
      }
    } catch (err) {
      logger.error(`Failed to fetch job ${jobId} from DB: ${err}`);
    }
  }

  job = jobStore.get(jobId);
  return job;
}

