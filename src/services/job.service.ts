import { v4 as uuidv4 } from "uuid";
import { MigrationRequest, MigrationResult } from "../types/migration.types";
import { enqueueMigration, migrationQueue } from "../queues/migration.queue";
import { activeJobs } from "../queues/workers/migration.worker";
import { queryDatabase, dbPool } from "../lib/database";
import { logger } from "../utils/logger";
import { config } from "../config";

export interface JobRecord {
  id: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  progress?: number;
  result?: MigrationResult | null;
  message?: string | null;
  request?: MigrationRequest | null;
}

const jobStore = new Map<string, JobRecord>();

export async function persistJobToDb(id: string, request: MigrationRequest) {
  if (!dbPool) return;
  try {
    await queryDatabase(
      "INSERT INTO migration_jobs (id, status, request, progress) VALUES ($1::uuid, $2::varchar, $3::jsonb, $4::integer) ON CONFLICT (id) DO NOTHING",
      [id, "pending", JSON.stringify(request), 0]
    );
  } catch (err) {
    logger.error(`Failed to persist job ${id}: ${err}`);
  }
}

export function enqueueMigrationJob(request: MigrationRequest): JobRecord {
  const id = request.jobId ?? uuidv4();
  const job: JobRecord = { id, status: "pending", progress: 0, result: null, message: null, request };
  jobStore.set(id, job);

  // persist to DB if configured
  persistJobToDb(id, request);

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
    await queryDatabase(
      "UPDATE migration_jobs SET status = 'processing'::varchar, progress = $1::integer, updated_at = NOW() WHERE id = $2::uuid",
      [progress, jobId]
    );
  } catch (err) {
    logger.error(`Failed to update job ${jobId} progress to ${progress}%: ${err}`);
  }
}

export async function markJobCompleted(jobId: string, result: MigrationResult) {
  const originalJob = jobStore.get(jobId);
  jobStore.set(jobId, { id: jobId, status: "completed", progress: 100, result, message: null, request: originalJob?.request });
  if (!dbPool) return;
  try {
    await queryDatabase(
      "UPDATE migration_jobs SET status = $1::varchar, result = $2::jsonb, progress = 100, updated_at = NOW() WHERE id = $3::uuid",
      ["completed", JSON.stringify(result), jobId]
    );
  } catch (err) {
    logger.error(`Failed to update job ${jobId} as completed: ${err}`);
  }
}

export async function markJobFailed(jobId: string, message?: string) {
  const originalJob = jobStore.get(jobId);
  jobStore.set(jobId, { id: jobId, status: "failed", result: null, message: message ?? null, request: originalJob?.request });
  if (!dbPool) return;
  try {
    await queryDatabase(
      "UPDATE migration_jobs SET status = $1::varchar, message = $2::text, updated_at = NOW() WHERE id = $3::uuid",
      ["failed", message ?? null, jobId]
    );
  } catch (err) {
    logger.error(`Failed to update job ${jobId} as failed: ${err}`);
  }
}

export async function getJobResult(jobId: string): Promise<JobRecord | undefined> {
  let job: JobRecord | undefined;

  // prefer DB if available
  if (dbPool) {
    try {
      const rows = await queryDatabase(
        "SELECT id, status, request, result, message, progress FROM migration_jobs WHERE id = $1::uuid",
        [jobId]
      );
      if (rows && rows.length) {
        const r = rows[0] as any;
        job = {
          id: r.id,
          status: r.status,
          request: r.request ?? null,
          result: r.result ?? null,
          message: r.message ?? null,
          progress: r.progress ?? 0,
        };
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
  if (config.REDIS_URL && job && (job.status === "pending" || job.status === "processing")) {
    try {
      const bullJob = await migrationQueue.getJob(jobId);
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

export async function listJobs(): Promise<JobRecord[]> {
  if (dbPool) {
    try {
      const rows = await queryDatabase("SELECT id, status, result, message, progress FROM migration_jobs ORDER BY created_at DESC LIMIT 50");
      if (rows) {
        return rows.map((r: any) => ({
          id: r.id,
          status: r.status,
          result: r.result ?? null,
          message: r.message ?? null,
          progress: r.progress ?? 0,
        }));
      }
    } catch (err) {
      logger.error(`Failed to list jobs from DB: ${err}`);
    }
  }
  return Array.from(jobStore.values());
}

export async function cancelJob(jobId: string): Promise<boolean> {
  let cancelled = false;

  // 1. Abort active execution if running in our worker
  const controller = activeJobs.get(jobId);
  if (controller) {
    controller.abort();
    logger.info(`Abort signal sent to active job ${jobId}`);
    cancelled = true;
  }

  // 2. Remove job from BullMQ queue (handles waiting / delayed states)
  if (config.REDIS_URL) {
    try {
      const bullJob = await migrationQueue.getJob(jobId);
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
        await queryDatabase(
          "UPDATE migration_jobs SET status = 'cancelled'::varchar, message = $1::text, updated_at = NOW() WHERE id = $2::uuid",
          ["Job cancelled by user", jobId]
        );
      } catch (err) {
        logger.error(`Failed to update job ${jobId} status to cancelled: ${err}`);
      }
    }
    return true;
  }

  return false;
}
