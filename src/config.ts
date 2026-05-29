import dotenv from "dotenv";
import { logger } from "./utils/logger";

dotenv.config();
const envFile = `.env.${process.env.NODE_ENV || "development"}`;
dotenv.config({ path: envFile, override: true });

export interface AppConfig {
  NODE_ENV: string;
  PORT: number;
  API_KEY: string;
  DATABASE_URL: string;
  REDIS_URL: string;
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
  OPENAI_API_KEY: string;
}

export const config: AppConfig = {
  NODE_ENV: process.env.NODE_ENV?.trim() || "development",
  PORT: Number(process.env.PORT ?? 4000),
  API_KEY: process.env.API_KEY?.trim() || "",
  DATABASE_URL: process.env.DATABASE_URL?.trim() || "",
  REDIS_URL: process.env.REDIS_URL?.trim() || "",
  SUPABASE_URL: process.env.SUPABASE_URL?.trim() || "",
  SUPABASE_KEY: process.env.SUPABASE_KEY?.trim() || "",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY?.trim() || "",
};

export function validateEnv() {
  const missing = [] as string[];

  if (!config.PORT) {
    missing.push("PORT");
  }

  if (!config.API_KEY) {
    logger.warn("API_KEY is not set. Authentication middleware will allow all requests.");
  }

  if (!config.DATABASE_URL && !config.SUPABASE_URL) {
    logger.warn("No database provider configured. Set DATABASE_URL or SUPABASE_URL to enable persistence.");
  }

  if (!config.SUPABASE_URL || !config.SUPABASE_KEY) {
    logger.warn("Supabase is not fully configured. SUPABASE_URL and SUPABASE_KEY are required together.");
  }

  if (!config.OPENAI_API_KEY) {
    logger.info("OPENAI_API_KEY is not set. AI features will run in stub mode.");
  }

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  logger.info(`Loaded environment: ${config.NODE_ENV}`);
}
