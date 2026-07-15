import Redis from "ioredis";
import { Queue } from "bullmq";
import { config } from "../config";
import { MigrationRequest } from "../types/migration.types";
import { logger } from "../utils/logger";

const redisUrl = config.REDIS_URL;

export const queueConnection = redisUrl
  ? new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      connectTimeout: 15000, // 15s timeout
      tls: redisUrl.startsWith("rediss://") ? { rejectUnauthorized: false } : undefined,
    })
  : null;

if (queueConnection) {
  logger.info(`Initializing BullMQ connection to Redis URL: ${redisUrl.split("@").pop()}`);
  
  queueConnection.on("connect", () => {
    logger.info("Redis queue connection established successfully.");
  });

  queueConnection.on("error", (err: any) => {
    logger.error(`Redis queue connection error: ${err}`);
  });
} else {
  logger.info("Redis URL is not configured. Skipping BullMQ Redis initialization.");
}

export const migrationQueue = queueConnection
  ? new Queue("migration-jobs", {
      connection: queueConnection as any,
    })
  : null;

export async function enqueueMigration(request: MigrationRequest) {
  const jobId = request.jobId;
  
  if (!migrationQueue) {
    logger.info(`Redis URL is not configured. Skipping queue add for job ${jobId ?? "(no-id)"}.`);
    return;
  }

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
