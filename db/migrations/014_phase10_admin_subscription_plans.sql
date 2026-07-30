-- Migration: 014 Phase 10 Admin-Managed Subscription Plan Extensions & Versioning

-- 1. Extend subscription_plans table
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'ACTIVE';
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS is_recommended BOOLEAN DEFAULT FALSE;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS razorpay_monthly_plan_id VARCHAR(100);
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS razorpay_yearly_plan_id VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_status ON subscription_plans (status);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_is_public ON subscription_plans (is_public);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_display_order ON subscription_plans (display_order ASC);

-- 2. Create subscription_plan_versions table
CREATE TABLE IF NOT EXISTS subscription_plan_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    monthly_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    yearly_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(10) DEFAULT 'INR',
    entitlements JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (plan_id, version)
);

CREATE INDEX IF NOT EXISTS idx_plan_versions_plan ON subscription_plan_versions (plan_id, version DESC);

-- 3. Extend subscriptions table for entitlement version snapshots
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_version_id UUID REFERENCES subscription_plan_versions(id) ON DELETE SET NULL;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS entitlements_snapshot JSONB;

-- Seed initial version 1 snapshots for existing plans if needed
DO $$
DECLARE
    plan_rec RECORD;
    features_json JSONB;
BEGIN
    FOR plan_rec IN SELECT * FROM subscription_plans LOOP
        SELECT jsonb_object_agg(feature_key, feature_value) INTO features_json
        FROM subscription_features
        WHERE plan_id = plan_rec.id;

        IF features_json IS NULL THEN
            features_json := '{}'::jsonb;
        END IF;

        INSERT INTO subscription_plan_versions (plan_id, version, monthly_price, yearly_price, currency, entitlements)
        VALUES (plan_rec.id, COALESCE(plan_rec.version, 1), plan_rec.monthly_price, plan_rec.yearly_price, COALESCE(plan_rec.currency, 'INR'), features_json)
        ON CONFLICT (plan_id, version) DO NOTHING;
    END LOOP;
END $$;
