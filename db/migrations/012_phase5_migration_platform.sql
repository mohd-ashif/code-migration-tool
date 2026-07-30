-- Migration: Phase 5 Migration Platform & Job Processing extensions

-- 1. Extend migration_jobs table with operational fields
ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS current_stage VARCHAR(50);
ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 1;
ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS max_attempts INTEGER DEFAULT 3;
ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;
ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS error_code VARCHAR(64);
ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS worker_id VARCHAR(128);
ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS input_file_count INTEGER DEFAULT 0;
ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS processed_file_count INTEGER DEFAULT 0;
ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS output_file_count INTEGER DEFAULT 0;
ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS input_size_bytes BIGINT DEFAULT 0;
ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS output_size_bytes BIGINT DEFAULT 0;
ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS retry_of_job_id UUID REFERENCES migration_jobs(id) ON DELETE SET NULL;
ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS original_job_id UUID REFERENCES migration_jobs(id) ON DELETE SET NULL;

-- 2. Create migration_job_events Table for important lifecycle events
CREATE TABLE IF NOT EXISTS migration_job_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES migration_jobs(id) ON DELETE CASCADE,
    event_type VARCHAR(64) NOT NULL,
    stage VARCHAR(64),
    progress INTEGER DEFAULT 0,
    message TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create Indexes
CREATE INDEX IF NOT EXISTS idx_migration_jobs_workspace_created ON migration_jobs (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_migration_jobs_user_created ON migration_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_migration_job_events_job_id ON migration_job_events (job_id, created_at ASC);
