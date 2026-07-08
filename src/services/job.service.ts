import { v4 as uuidv4 } from "uuid";
import { MigrationRequest, MigrationResult } from "../types/migration.types";
import { enqueueMigration } from "../queues/migration.queue";
import { queryDatabase, dbPool } from "../lib/database";
import { logger } from "../utils/logger";

interface JobRecord {
  id: string;
  status: "pending" | "completed" | "failed";
  result?: MigrationResult | null;
  message?: string | null;
  request?: MigrationRequest | null;
}

const jobStore = new Map<string, JobRecord>();

export async function persistJobToDb(id: string, request: MigrationRequest) {
  if (!dbPool) return;
  try {
    await queryDatabase("INSERT INTO migration_jobs (id, status, request) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING", [id, "pending", request]);
  } catch (err) {
    logger.error(`Failed to persist job ${id}: ${err}`);
  }
}

export function enqueueMigrationJob(request: MigrationRequest): JobRecord {
  const id = request.jobId ?? uuidv4();
  const job: JobRecord = { id, status: "pending", result: null, message: null, request };
  jobStore.set(id, job);

  // persist to DB if configured
  persistJobToDb(id, request);

  // ensure the jobId is attached and emit to queue
  const submission: MigrationRequest = { ...request, jobId: id };
  enqueueMigration(submission);

  return job;
}

export async function markJobCompleted(jobId: string, result: MigrationResult) {
  const originalJob = jobStore.get(jobId);
  jobStore.set(jobId, { id: jobId, status: "completed", result, message: null, request: originalJob?.request });
  if (!dbPool) return;
  try {
    await queryDatabase("UPDATE migration_jobs SET status = $1, result = $2, updated_at = NOW() WHERE id = $3", ["completed", result, jobId]);
  } catch (err) {
    logger.error(`Failed to update job ${jobId} as completed: ${err}`);
  }
}

export async function markJobFailed(jobId: string, message?: string) {
  const originalJob = jobStore.get(jobId);
  jobStore.set(jobId, { id: jobId, status: "failed", result: null, message: message ?? null, request: originalJob?.request });
  if (!dbPool) return;
  try {
    await queryDatabase("UPDATE migration_jobs SET status = $1, message = $2, updated_at = NOW() WHERE id = $3", ["failed", message ?? null, jobId]);
  } catch (err) {
    logger.error(`Failed to update job ${jobId} as failed: ${err}`);
  }
}

export async function getJobResult(jobId: string): Promise<JobRecord | undefined> {
  // prefer DB if available
  if (dbPool) {
    try {
      const rows = await queryDatabase("SELECT id, status, request, result, message FROM migration_jobs WHERE id = $1", [jobId]);
      if (rows && rows.length) {
        const r = rows[0] as any;
        return { id: r.id, status: r.status, request: r.request ?? null, result: r.result ?? null, message: r.message ?? null };
      }
    } catch (err) {
      logger.error(`Failed to read job ${jobId} from DB: ${err}`);
    }
  }

  return jobStore.get(jobId);
}

export async function listJobs(): Promise<JobRecord[]> {
  if (dbPool) {
    try {
      const rows = await queryDatabase("SELECT id, status, result, message FROM migration_jobs ORDER BY created_at DESC LIMIT 50"); // Use created_at if updated_at doesn't exist, let's just use updated_at since it is in markJobCompleted
      if (rows) {
        return rows.map((r: any) => ({
          id: r.id,
          status: r.status,
          result: r.result ?? null,
          message: r.message ?? null
        }));
      }
    } catch (err) {
      logger.error(`Failed to list jobs from DB: ${err}`);
    }
  }
  return Array.from(jobStore.values());
}
