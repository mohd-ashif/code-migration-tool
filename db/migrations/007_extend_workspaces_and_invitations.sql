-- Add columns
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS slug VARCHAR(255);
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Backfill slugs for existing workspaces (replacing spaces/special characters with hyphens)
UPDATE workspaces
SET slug = TRIM(BOTH '-' FROM LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g')))
WHERE slug IS NULL;

-- Fallback for empty slugs
UPDATE workspaces
SET slug = 'workspace-' || SUBSTRING(id::text, 1, 8)
WHERE slug IS NULL OR slug = '';

-- Apply constraints
ALTER TABLE workspaces ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_slug_active ON workspaces (slug) WHERE deleted_at IS NULL;

-- Create invitations table
CREATE TABLE IF NOT EXISTS workspace_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  token VARCHAR(255) UNIQUE NOT NULL,
  invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_invitations_active
ON workspace_invitations (workspace_id, email)
WHERE accepted_at IS NULL AND deleted_at IS NULL;
