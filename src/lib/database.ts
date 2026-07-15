import { Pool, QueryResultRow } from "pg";
import { config } from "../config";
import { logger } from "../utils/logger";

export const dbPool = config.DATABASE_URL ? new Pool({ connectionString: config.DATABASE_URL }) : null;

if (dbPool) {
  dbPool.on("error", (err) => {
    logger.error(`Unexpected database pool error: ${err.message || err}`);
  });
}

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

export async function initializeDatabase() {
  if (!dbPool) return;
  try {
    await queryDatabase("ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0");
    logger.info("Database schema initialized: checked 'progress' column in 'migration_jobs'.");
    
    // Clean up stale, orphaned jobs left over in database from previous backend crashes/restarts
    // 1. Recover jobs that completed successfully (have results) but were left with processing/pending status
    await queryDatabase(
      "UPDATE migration_jobs SET status = 'completed'::varchar, progress = 100 WHERE (status = 'processing'::varchar OR status = 'pending'::varchar) AND result IS NOT NULL"
    );
    
    // 2. Mark remaining stuck jobs (no results) as failed
    await queryDatabase(
      "UPDATE migration_jobs SET status = 'failed'::varchar, message = 'Server restarted during execution' WHERE (status = 'processing'::varchar OR status = 'pending'::varchar) AND result IS NULL"
    );
    logger.info("Database startup cleanup: stale jobs recovered and cleaned successfully.");
  } catch (err) {
    logger.error(`Failed to initialize database schema: ${err}`);
  }
}

export async function closeDatabase() {
  if (dbPool) {
    await dbPool.end();
    logger.info("Postgres database connection closed.");
  }
}
