import { Worker } from "bullmq";
import { queueConnection } from "../migration.queue";
import { migrateProject } from "../../services/migration.service";
import { markJobCompleted, markJobFailed } from "../../services/job.service";
import { logger } from "../../utils/logger";

// Track active jobs to support cancellation
export const activeJobs = new Map<string, AbortController>();

export const migrationWorker = queueConnection
  ? new Worker(
      "migration-jobs",
      async (job: any) => {
        const request = job.data;
        const jobId = job.opts.jobId || job.id;
        if (!jobId) {
          throw new Error("Job ID is missing.");
        }

        logger.info(`Starting migration worker job ${jobId}`);

        const controller = new AbortController();
        activeJobs.set(jobId, controller);

        try {
          const result = await migrateProject(
            request,
            async (progressPercent: number) => {
              await job.updateProgress(progressPercent);
            },
            controller.signal
          );
          
          // Update final DB status (completed)
          await markJobCompleted(jobId, result);
          return result;
        } catch (error: any) {
          if (controller.signal.aborted || error?.message === "Job aborted") {
            logger.warn(`Job ${jobId} was aborted/cancelled.`);
            throw new Error("Job aborted");
          }
          throw error;
        } finally {
          activeJobs.delete(jobId);
        }
      },
      {
        connection: queueConnection as any,
        concurrency: 2,
      }
    )
  : null;

if (migrationWorker) {
  migrationWorker.on("completed", (job: any) => {
    logger.info(`Migration worker successfully completed job ${job.id}`);
  });

  migrationWorker.on("failed", (job: any, error: any) => {
    logger.error(`Migration worker failed for job ${job?.id ?? "(no-id)"}: ${error.message}`);
    // If the error was not an abort, mark it failed in the DB
    if (job?.id && error?.message !== "Job aborted") {
      markJobFailed(job.id, error.message);
    }
  });
} else {
  logger.info("Redis is disabled. Skipping BullMQ Worker initialization.");
}
