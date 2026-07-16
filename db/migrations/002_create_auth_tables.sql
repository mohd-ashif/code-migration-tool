-- Migration: Create authentication tables for SaaS platform

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Helper trigger function to update updated_at automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255), -- Nullable for users authenticating exclusively via OAuth providers
    is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Partial index to enforce unique email among active (non-soft-deleted) users
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_active_email ON users (email) WHERE deleted_at IS NULL;

-- Trigger to automatically update updated_at on modification
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- 2. Auth Providers Table (Google, GitHub, etc.)
CREATE TABLE IF NOT EXISTS auth_providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_name VARCHAR(50) NOT NULL, -- e.g., 'google', 'github'
    provider_user_id VARCHAR(255) NOT NULL, -- Unique ID from the OAuth provider
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Index for searching users' provider integrations
CREATE INDEX IF NOT EXISTS idx_auth_providers_user_id ON auth_providers (user_id) WHERE deleted_at IS NULL;
-- Unique index to prevent duplicate oauth mappings for active providers
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_providers_lookup ON auth_providers (provider_name, provider_user_id) WHERE deleted_at IS NULL;

-- Trigger
DROP TRIGGER IF EXISTS update_auth_providers_updated_at ON auth_providers;
CREATE TRIGGER update_auth_providers_updated_at
    BEFORE UPDATE ON auth_providers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- 3. Refresh Tokens Table
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(512) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Unique index to lookup tokens quickly
CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens (token) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expiry ON refresh_tokens (expires_at);

-- Trigger
DROP TRIGGER IF EXISTS update_refresh_tokens_updated_at ON refresh_tokens;
CREATE TRIGGER update_refresh_tokens_updated_at
    BEFORE UPDATE ON refresh_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- 4. Login History Table
CREATE TABLE IF NOT EXISTS login_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Retain history if user is soft-deleted or hard-deleted
    ip_address VARCHAR(45), -- Supports IPv4 and IPv6
    user_agent TEXT,
    login_status VARCHAR(50) NOT NULL, -- e.g., 'success', 'failed_password', 'failed_unverified_email'
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON login_history (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_login_history_status ON login_history (login_status);
CREATE INDEX IF NOT EXISTS idx_login_history_created_at ON login_history (created_at DESC);

-- Trigger
DROP TRIGGER IF EXISTS update_login_history_updated_at ON login_history;
CREATE TRIGGER update_login_history_updated_at
    BEFORE UPDATE ON login_history
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- 5. Email Verification Tokens Table
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_verification_tokens_token ON email_verification_tokens (token) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id ON email_verification_tokens (user_id) WHERE deleted_at IS NULL;

-- Trigger
DROP TRIGGER IF EXISTS update_email_verification_tokens_updated_at ON email_verification_tokens;
CREATE TRIGGER update_email_verification_tokens_updated_at
    BEFORE UPDATE ON email_verification_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- 6. Password Reset Tokens Table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens (token) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens (user_id) WHERE deleted_at IS NULL;

-- Trigger
DROP TRIGGER IF EXISTS update_password_reset_tokens_updated_at ON password_reset_tokens;
CREATE TRIGGER update_password_reset_tokens_updated_at
    BEFORE UPDATE ON password_reset_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
