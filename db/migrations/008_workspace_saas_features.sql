-- 1. Alter workspaces table
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS plan_id VARCHAR(50) DEFAULT 'free';
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS storage_used BIGINT DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS storage_limit BIGINT DEFAULT 104857600; -- 100MB
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS migration_count INTEGER DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'UTC';
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS country VARCHAR(50);

-- Create index on owner_id if not exists
CREATE INDEX IF NOT EXISTS idx_workspaces_owner_id ON workspaces (owner_id) WHERE deleted_at IS NULL;

-- 2. Alter workspace_members table
ALTER TABLE workspace_members ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
ALTER TABLE workspace_members ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE workspace_members ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE workspace_members ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- 3. Alter workspace_invitations table
ALTER TABLE workspace_invitations ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';

-- 4. Create workspace_activity_logs table
CREATE TABLE IF NOT EXISTS workspace_activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_activity_logs_workspace_id ON workspace_activity_logs (workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_activity_logs_created_at ON workspace_activity_logs (created_at DESC);

-- 5. Alter migration_jobs table to add created_by
ALTER TABLE migration_jobs ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- 6. Alter api_keys table to add workspace_id
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_api_keys_workspace_id ON api_keys (workspace_id) WHERE deleted_at IS NULL;
