import { Pool, QueryResultRow } from "pg";
import { config } from "../config";
import { logger } from "../utils/logger";

export const dbPool = config.DATABASE_URL ? new Pool({ connectionString: config.DATABASE_URL }) : null;

if (config.DATABASE_URL) {
  logger.info("Postgres database configured.");
} else {
  logger.warn("DATABASE_URL is not set. Postgres features are disabled.");
}

export async function queryDatabase<T extends QueryResultRow = any>(text: string, params?: unknown[]) {
  if (!dbPool) {
    throw new Error("DATABASE_URL is not defined in the environment.");
  }

  const result = await dbPool.query<T>(text, params);
  return result.rows;
}

export async function closeDatabase() {
  if (dbPool) {
    await dbPool.end();
    logger.info("Postgres database connection closed.");
  }
}
