import { createClient, RedisClientType } from "redis";
import { config } from "../config";
import { logger } from "../utils/logger";

export const redisClient: RedisClientType | null = config.REDIS_URL ? createClient({ url: config.REDIS_URL }) : null;

if (redisClient) {
  redisClient.on("error", (err) => {
    logger.error(`Redis socket error: ${err.message || err}`);
  });
}

export async function connectRedis() {
  if (!redisClient) {
    logger.info("Redis URL is not configured. Skipping Redis connection.");
    return;
  }

  if (!redisClient.isOpen) {
    await redisClient.connect();
    logger.info("Redis client connected.");
  }
}

export async function disconnectRedis() {
  if (!redisClient || !redisClient.isOpen) {
    return;
  }

  await redisClient.disconnect();
  logger.info("Redis client disconnected.");
}
