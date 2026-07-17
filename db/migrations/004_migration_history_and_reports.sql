-- Migration: Create migration reports and uploaded projects tables, and update migration_jobs

-- 1. Alter migration_jobs Table
ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS project_name VARCHAR(255);
ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS project_size BIGINT;
ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS source_framework VARCHAR(50);
ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS target_framework VARCHAR(50);
ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS warnings_count INTEGER DEFAULT 0;
ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS errors_count INTEGER DEFAULT 0;
ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS download_count INTEGER DEFAULT 0;
ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Ensure migration_jobs has updated_at trigger (using the function from 002 migration)
DROP TRIGGER IF EXISTS update_migration_jobs_updated_at ON migration_jobs;
CREATE TRIGGER update_migration_jobs_updated_at
    BEFORE UPDATE ON migration_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 2. Create migration_reports Table
CREATE TABLE IF NOT EXISTS migration_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES migration_jobs(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    summary TEXT,
    quality_score INTEGER,
    warnings JSONB,
    errors JSONB,
    ai_self_healing JSONB,
    compiler_output TEXT,
    dependency_graph JSONB,
    metrics JSONB,
    report_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_migration_reports_job_id ON migration_reports (job_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_migration_reports_workspace_id ON migration_reports (workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_migration_reports_user_id ON migration_reports (user_id) WHERE deleted_at IS NULL;

-- Trigger to automatically update updated_at for migration_reports
DROP TRIGGER IF EXISTS update_migration_reports_updated_at ON migration_reports;
CREATE TRIGGER update_migration_reports_updated_at
    BEFORE UPDATE ON migration_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 3. Create uploaded_projects Table
CREATE TABLE IF NOT EXISTS uploaded_projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    job_id UUID REFERENCES migration_jobs(id) ON DELETE SET NULL,
    original_filename VARCHAR(255) NOT NULL,
    storage_path VARCHAR(512) NOT NULL,
    size BIGINT,
    checksum VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uploaded_projects_workspace_id ON uploaded_projects (workspace_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_projects_user_id ON uploaded_projects (user_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_projects_job_id ON uploaded_projects (job_id);
