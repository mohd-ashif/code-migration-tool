-- Migration: 015 Phase 10 Enterprise Admin Usage, AI Cost Center, Quality & Failures

-- 1. Workspace Quota Overrides Table
CREATE TABLE IF NOT EXISTS workspace_quota_overrides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    metric VARCHAR(100) NOT NULL,
    override_value NUMERIC(15, 2) NOT NULL,
    reason TEXT NOT NULL,
    granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quota_overrides_workspace ON workspace_quota_overrides(workspace_id);
CREATE INDEX IF NOT EXISTS idx_quota_overrides_expires ON workspace_quota_overrides(expires_at);

-- 2. AI Usage Micro-Ledger Table
CREATE TABLE IF NOT EXISTS ai_usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    migration_job_id UUID REFERENCES migration_jobs(id) ON DELETE CASCADE,
    feature_key VARCHAR(100) NOT NULL DEFAULT 'ai_code_migration',
    model_name VARCHAR(100) NOT NULL DEFAULT 'claude-3-5-sonnet',
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    provider_cost NUMERIC(10, 4) DEFAULT 0.0000,
    latency_ms INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'success',
    self_healing_attempt BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_workspace ON ai_usage_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created ON ai_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_model ON ai_usage_logs(model_name);

-- 3. Migration Failure Fingerprint Groups Table
CREATE TABLE IF NOT EXISTS migration_failure_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fingerprint VARCHAR(64) UNIQUE NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'unknown',
    error_message TEXT NOT NULL,
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    occurrence_count INTEGER DEFAULT 1,
    status VARCHAR(50) DEFAULT 'unresolved',
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    internal_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_failure_groups_category ON migration_failure_groups(category);
CREATE INDEX IF NOT EXISTS idx_failure_groups_status ON migration_failure_groups(status);
CREATE INDEX IF NOT EXISTS idx_failure_groups_last_seen ON migration_failure_groups(last_seen_at DESC);
