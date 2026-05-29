-- Migration: Create core tables for migration tool

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS migration_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  request JSONB NOT NULL,
  result JSONB,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),



  .0
  0
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_migration_jobs_status ON migration_jobs (status);
CREATE INDEX IF NOT EXISTS idx_migration_jobs_created_at ON migration_jobs (created_at DESC);

-- Optional logs table
CREATE TABLE IF NOT EXISTS migration_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES migration_jobs(id) ON DELETE CASCADE,
  level VARCHAR(16) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_migration_logs_job_id ON migration_logs (job_id);
