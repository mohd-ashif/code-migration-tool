import dotenv from "dotenv";
import path from "path";
import { logger } from "./utils/logger";

dotenv.config({ override: true });
const envFile = `.env.${process.env.NODE_ENV || "development"}`;
dotenv.config({ path: envFile, override: true });

export interface AppConfig {
  NODE_ENV: string;
  PORT: number;
  FRONTEND_URL: string;
  API_KEY: string;
  DATABASE_URL: string;
  REDIS_URL: string;
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
  OPENAI_API_KEY: string;
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  SMTP_HOST?: string;
  SMTP_PORT?: number;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM?: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_REDIRECT_URI: string;
  RAZORPAY_KEY_ID: string;
  RAZORPAY_KEY_SECRET: string;
  RAZORPAY_WEBHOOK_SECRET: string;
  CLOUDINARY_CLOUD_NAME: string;
  CLOUDINARY_API_KEY: string;
  CLOUDINARY_API_SECRET: string;
  CLOUDINARY_FOLDER: string;
  MAX_UPLOAD_SIZE_MB: number;
  MAX_EXTRACTED_SIZE_MB: number;
  MAX_PROJECT_FILES: number;
  MIGRATION_WORKER_CONCURRENCY: number;
  AI_WORKER_CONCURRENCY: number;
}

export const config: AppConfig = {
  NODE_ENV: process.env.NODE_ENV?.trim() || "development",
  PORT: Number(process.env.PORT ?? 4000),
  FRONTEND_URL: (process.env.FRONTEND_URL?.trim() || "https://code-migration-tool-frontend-neon.vercel.app").replace(/\/+$/, ""),
  API_KEY: process.env.API_KEY?.trim() || "",
  DATABASE_URL: process.env.DATABASE_URL?.trim() || "",
  REDIS_URL: process.env.REDIS_URL?.trim() || "",
  SUPABASE_URL: process.env.SUPABASE_URL?.trim() || "",
  SUPABASE_KEY: process.env.SUPABASE_KEY?.trim() || "",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY?.trim() || "",
  JWT_SECRET: process.env.JWT_SECRET?.trim() || "default-secret-key-for-migration-tool-jwt-12345",
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET?.trim() || "default-refresh-secret-key-for-migration-tool-jwt-12345",
  SMTP_HOST: process.env.SMTP_HOST?.trim(),
  SMTP_PORT: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
  SMTP_USER: process.env.SMTP_USER?.trim(),
  SMTP_PASS: process.env.SMTP_PASS?.trim(),
  SMTP_FROM: process.env.SMTP_FROM?.trim(),
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID?.trim() || "default-google-client-id",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET?.trim() || "default-google-client-secret",
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI?.trim() || "https://code-migration-tool.onrender.com/api/auth/google/callback",
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID?.trim() || "default-github-client-id",
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET?.trim() || "default-github-client-secret",
  GITHUB_REDIRECT_URI: process.env.GITHUB_REDIRECT_URI?.trim() || "https://code-migration-tool.onrender.com/api/auth/github/callback",
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID?.trim() || "",
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET?.trim() || "",
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || "",
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME?.trim() || "",
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY?.trim() || "",
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET?.trim() || "",
  CLOUDINARY_FOLDER: process.env.CLOUDINARY_FOLDER?.trim() || "invoices",
  MAX_UPLOAD_SIZE_MB: Number(process.env.MAX_UPLOAD_SIZE_MB ?? 100),
  MAX_EXTRACTED_SIZE_MB: Number(process.env.MAX_EXTRACTED_SIZE_MB ?? 500),
  MAX_PROJECT_FILES: Number(process.env.MAX_PROJECT_FILES ?? 5000),
  MIGRATION_WORKER_CONCURRENCY: Number(process.env.MIGRATION_WORKER_CONCURRENCY ?? 4),
  AI_WORKER_CONCURRENCY: Number(process.env.AI_WORKER_CONCURRENCY ?? 2),
};

export function validateEnv() {
  const missing = [] as string[];

  if (!config.PORT) {
    missing.push("PORT");
  }

  if (config.CLOUDINARY_CLOUD_NAME && config.CLOUDINARY_API_KEY && config.CLOUDINARY_API_SECRET) {
    logger.info(`Cloudinary storage service configured for cloud: ${config.CLOUDINARY_CLOUD_NAME}`);
  } else {
    logger.warn("Cloudinary storage is incomplete. PDF invoices will fallback to local storage.");
  }

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  logger.info(`Loaded environment: ${config.NODE_ENV}`);
}
