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

export interface JobRecord {
  id: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  progress?: number;
  result?: MigrationResult | null;
  message?: string | null;
  request?: MigrationRequest | null;
}

const jobStore = new Map<string, JobRecord>();

export async function persistJobToDb(id: string, request: MigrationRequest, workspaceId?: string, userId?: string) {
  if (!dbPool) return;
  try {
    // 1. Calculate project name and size
    let projectName = `Project_${request.sourceFramework || "unknown"}_to_${request.targetFramework}`;
    let projectSize = 0;

    const files = request.projectFiles || [];
    for (const f of files) {
      projectSize += Buffer.byteLength(f.content, "utf8");
      if (f.path === "package.json") {
        try {
          const pkg = JSON.parse(f.content);
          if (pkg.name) {
            projectName = pkg.name;
          }
        } catch (e) {
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

    // 2. Pack files and save to scratch uploads
    const archiveBuffer = await createArchive(files);
    const uploadsDir = path.join(__dirname, "..", "..", "scratch", "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const relativePath = path.join("scratch", "uploads", `project-${id}.zip`);
    const storagePath = path.join(__dirname, "..", "..", relativePath);
    fs.writeFileSync(storagePath, archiveBuffer);

    // Compute checksum
    const checksum = createHash("sha256").update(archiveBuffer).digest("hex");

    // Insert into uploaded_projects
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

  // persist to DB if configured
  persistJobToDb(id, request, workspaceId, userId);

  // ensure the jobId is attached and emit to queue
  const submission: MigrationRequest = { ...request, jobId: id };
  
  if (!config.REDIS_URL) {
    logger.info(`No Redis configured. Running migration job ${id} synchronously in the background.`);
    (async () => {
      const { migrateProject } = require("./migration.service");
      try {
        await updateJobProgress(id, 10);
        const result = await migrateProject(
          submission,
          async (progressPercent: number) => {
            await updateJobProgress(id, progressPercent);
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

export async function updateJobProgress(jobId: string, progress: number) {
  const originalJob = jobStore.get(jobId);
  
  if (originalJob && (originalJob.status === "completed" || originalJob.status === "failed")) {
    return;
  }

  jobStore.set(jobId, {
    id: jobId,
    status: "processing",
    progress,
    result: originalJob?.result ?? null,
    message: originalJob?.message ?? null,
    request: originalJob?.request,
  });

  if (!dbPool) return;
  try {
    const migrationRepo = new MigrationRepository();
    await migrationRepo.update(jobId, {
      status: "processing",
      progress,
    });
  } catch (err) {
    logger.error(`Failed to update job ${jobId} progress to ${progress}%: ${err}`);
  }
}

export async function markJobCompleted(jobId: string, result: MigrationResult) {
  const originalJob = jobStore.get(jobId);
  jobStore.set(jobId, { id: jobId, status: "completed", progress: 100, result, message: null, request: originalJob?.request });
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
  jobStore.set(jobId, { id: jobId, status: "failed", result: null, message: message ?? null, request: originalJob?.request });
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

  // prefer DB if available
  if (dbPool) {
    try {
      const queryStr = workspaceId
        ? "SELECT id, status, request, result, message, progress, workspace_id, user_id, created_at FROM migration_jobs WHERE id = $1::uuid AND workspace_id = $2::uuid AND deleted_at IS NULL"
        : "SELECT id, status, request, result, message, progress, workspace_id, user_id, created_at FROM migration_jobs WHERE id = $1::uuid AND deleted_at IS NULL";
      const params = workspaceId ? [jobId, workspaceId] : [jobId];
      const rows = await queryDatabase(queryStr, params);
      if (rows && rows.length) {
        const r = rows[0] as any;
        job = {
          id: r.id,
          status: r.status,
          request: r.request ?? null,
          result: r.result ?? null,
          message: r.message ?? null,
          progress: r.progress ?? 0,
          workspace_id: r.workspace_id ?? null,
          user_id: r.user_id ?? null,
          created_at: r.created_at ?? null,
        } as any;
      }
    } catch (err) {
      logger.error(`Failed to read job ${jobId} from DB: ${err}`);
    }
  }

  // Fallback to memory
  if (!job) {
    job = jobStore.get(jobId);
  }

  // Enrich progress dynamically from BullMQ if actively in progress or waiting
  const activeQueue = migrationQueue;
  if (config.REDIS_URL && activeQueue && job && (job.status === "pending" || job.status === "processing")) {
    try {
      const bullJob = await activeQueue.getJob(jobId);
      if (bullJob) {
        const progress = bullJob.progress;
        if (typeof progress === "number") {
          job.progress = progress;
        }
        const state = await bullJob.getState();
        if (state === "active") {
          job.status = "processing";
        }
      }
    } catch (err) {
      logger.error(`Failed to enrich job ${jobId} status from BullMQ: ${err}`);
    }
  }

  return job;
}

export async function listJobs(workspaceId?: string): Promise<JobRecord[]> {
  if (dbPool) {
    try {
      const queryStr = workspaceId
        ? "SELECT id, status, request, result, message, progress, workspace_id, user_id, created_at FROM migration_jobs WHERE workspace_id = $1::uuid AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50"
        : "SELECT id, status, request, result, message, progress, workspace_id, user_id, created_at FROM migration_jobs WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 50";
      const params = workspaceId ? [workspaceId] : [];
      const rows = await queryDatabase(queryStr, params);
      if (rows) {
        return rows.map((r: any) => ({
          id: r.id,
          status: r.status,
          request: r.request ?? null,
          result: r.result ?? null,
          message: r.message ?? null,
          progress: r.progress ?? 0,
          workspace_id: r.workspace_id ?? null,
          user_id: r.user_id ?? null,
          created_at: r.created_at ?? null,
        }));
      }
    } catch (err) {
      logger.error(`Failed to list jobs from DB: ${err}`);
    }
  }
  return Array.from(jobStore.values());
}

export async function cancelJob(jobId: string, workspaceId?: string): Promise<boolean> {
  let cancelled = false;

  // 1. Abort active execution if running in our worker
  const controller = activeJobs.get(jobId);
  if (controller) {
    controller.abort();
    logger.info(`Abort signal sent to active job ${jobId}`);
    cancelled = true;
  }

  // 2. Remove job from BullMQ queue (handles waiting / delayed states)
  const activeQueueForCancel = migrationQueue;
  if (config.REDIS_URL && activeQueueForCancel) {
    try {
      const bullJob = await activeQueueForCancel.getJob(jobId);
      if (bullJob) {
        await bullJob.remove();
        logger.info(`Removed job ${jobId} from BullMQ queue`);
        cancelled = true;
      }
    } catch (err) {
      logger.error(`Error removing job ${jobId} from BullMQ queue: ${err}`);
    }
  }

  // 3. Mark the job state as 'cancelled'
  const originalJob = jobStore.get(jobId);
  if (originalJob || cancelled) {
    jobStore.set(jobId, {
      id: jobId,
      status: "cancelled",
      message: "Job cancelled by user",
      result: null,
      request: originalJob?.request,
      progress: originalJob?.progress ?? 0,
    });

    if (dbPool) {
      try {
        const queryStr = workspaceId
          ? "UPDATE migration_jobs SET status = 'cancelled'::varchar, message = $1::text, updated_at = NOW() WHERE id = $2::uuid AND workspace_id = $3::uuid"
          : "UPDATE migration_jobs SET status = 'cancelled'::varchar, message = $1::text, updated_at = NOW() WHERE id = $2::uuid";
        const params = workspaceId ? ["Job cancelled by user", jobId, workspaceId] : ["Job cancelled by user", jobId];
        await queryDatabase(queryStr, params);
      } catch (err) {
        logger.error(`Failed to update job ${jobId} status to cancelled: ${err}`);
      }
    }
    return true;
  }

  return false;
}
