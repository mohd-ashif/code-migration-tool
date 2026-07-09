import Redis from "ioredis";
import { Queue } from "bullmq";
import { config } from "../config";
import { MigrationRequest } from "../types/migration.types";
import { logger } from "../utils/logger";

const redisUrl = config.REDIS_URL || "redis://127.0.0.1:6379";

logger.info(`Initializing BullMQ connection to Redis URL: ${redisUrl.split("@").pop()}`); // Log host safely

export const queueConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

queueConnection.on("connect", () => {
  logger.info("Redis queue connection established successfully.");
});

queueConnection.on("error", (err: any) => {
  logger.error(`Redis queue connection error: ${err}`);
});

export const migrationQueue = new Queue("migration-jobs", {
  connection: queueConnection as any,
});

export async function enqueueMigration(request: MigrationRequest) {
  const jobId = request.jobId;
  logger.info(`Adding job ${jobId ?? "(no-id)"} to BullMQ migration queue`);
  
  try {
    await migrationQueue.add("migrate", request, {
      jobId,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });
    logger.info(`Successfully added job ${jobId} to BullMQ queue.`);
  } catch (err: any) {
    logger.error(`Failed to add job ${jobId} to BullMQ queue: ${err.message}`);
    if (jobId) {
      const { markJobFailed } = require("../services/job.service");
      await markJobFailed(jobId, `Failed to queue migration task: ${err.message}`);
    }
  }
}
