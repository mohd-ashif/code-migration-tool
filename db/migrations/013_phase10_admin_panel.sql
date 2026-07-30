-- Migration: Phase 10 Admin Panel Schema Extensions

-- 1. Extend users table for system roles and account status
ALTER TABLE users ADD COLUMN IF NOT EXISTS system_role VARCHAR(50) DEFAULT 'USER';
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'ACTIVE';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_system_role ON users (system_role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

-- Ensure initial admin user has SUPER_ADMIN role (system user or owner)
UPDATE users SET system_role = 'SUPER_ADMIN' WHERE id = '00000000-0000-0000-0000-000000000000'::uuid;

-- 2. Extend workspaces table for workspace status
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'ACTIVE';
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_workspaces_status ON workspaces (status);

-- 3. Create admin_audit_logs Table for immutable mutation tracking
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(255),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
    metadata JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_user ON admin_audit_logs (admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_resource ON admin_audit_logs (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON admin_audit_logs (action, created_at DESC);

-- 4. Create feature_flags Table
CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    rollout_percentage INTEGER NOT NULL DEFAULT 100,
    rules JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_feature_flags_updated_at ON feature_flags;
CREATE TRIGGER update_feature_flags_updated_at
    BEFORE UPDATE ON feature_flags
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Seed initial system feature flags
INSERT INTO feature_flags (key, description, enabled, rollout_percentage)
VALUES 
    ('dependency_graph', 'Interactive React Flow dependency graph visualization', true, 100),
    ('ai_self_healing', 'Automated OpenAI self-healing diagnostics', true, 100),
    ('folder_upload', 'Browser folder drag-and-drop and directory parsing', true, 100),
    ('api_access', 'Personal user API keys generation', true, 100),
    ('advanced_reports', 'Detailed PDF & JSON compiler reports', true, 100),
    ('new_migration_engine', 'Experimental high-throughput AST compiler engine', false, 0)
ON CONFLICT (key) DO NOTHING;
