-- Database Migration 009: SaaS Billing and Subscription Schema

-- 1. Create subscription_plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    monthly_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    yearly_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(10) DEFAULT 'INR',
    trial_days INTEGER DEFAULT 0,
    display_order INTEGER DEFAULT 0,
    is_public BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create subscription_features table
CREATE TABLE IF NOT EXISTS subscription_features (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
    feature_key VARCHAR(100) NOT NULL,
    feature_value VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (plan_id, feature_key)
);

-- 3. Create subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES subscription_plans(id),
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, trialing, past_due, cancelled, unpaid, suspended
    billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly', -- monthly, yearly
    trial_start TIMESTAMPTZ,
    trial_end TIMESTAMPTZ,
    starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ, -- Next renewal date
    cancel_at TIMESTAMPTZ,
    renew_at TIMESTAMPTZ,
    payment_provider VARCHAR(50) DEFAULT 'razorpay',
    provider_subscription_id VARCHAR(100) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Create workspace_subscriptions table
CREATE TABLE IF NOT EXISTS workspace_subscriptions (
    workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE
);

-- 5. Create payment_methods table
CREATE TABLE IF NOT EXISTS payment_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL DEFAULT 'razorpay',
    provider_customer_id VARCHAR(100),
    card_brand VARCHAR(50),
    card_last4 VARCHAR(4),
    upi_id VARCHAR(150),
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Create billing_addresses table
CREATE TABLE IF NOT EXISTS billing_addresses (
    workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    company_name VARCHAR(200),
    gst_number VARCHAR(15), -- 15-digit GSTIN format
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    pin_code VARCHAR(10) NOT NULL,
    country VARCHAR(100) DEFAULT 'India',
    phone VARCHAR(20),
    email VARCHAR(150),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Create payments table
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    gateway VARCHAR(50) NOT NULL DEFAULT 'razorpay',
    transaction_id VARCHAR(100) UNIQUE NOT NULL,
    order_id VARCHAR(100),
    amount NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'INR',
    status VARCHAR(50) NOT NULL, -- captured, failed, refunded, authorized
    payment_method VARCHAR(50), -- card, upi, netbanking, wallet
    invoice_id UUID, -- Will link to invoices table later via constraint if needed
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    subtotal NUMERIC(10, 2) NOT NULL,
    cgst NUMERIC(10, 2) DEFAULT 0.00,
    sgst NUMERIC(10, 2) DEFAULT 0.00,
    igst NUMERIC(10, 2) DEFAULT 0.00,
    discount NUMERIC(10, 2) DEFAULT 0.00,
    total NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'INR',
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- paid, failed, pending, cancelled
    pdf_url TEXT,
    billing_details JSONB, -- Address snapshot at checkout
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Alter payments table to reference invoices
ALTER TABLE payments ADD CONSTRAINT fk_payment_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;

-- 9. Create invoice_items table
CREATE TABLE IF NOT EXISTS invoice_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Create coupons table
CREATE TABLE IF NOT EXISTS coupons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    discount_type VARCHAR(20) NOT NULL, -- percentage, fixed
    discount_value NUMERIC(10, 2) NOT NULL,
    duration VARCHAR(20) DEFAULT 'once', -- once, repeating, forever
    duration_in_months INTEGER,
    max_redemptions INTEGER,
    times_redeemed INTEGER DEFAULT 0,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Create coupon_redemptions table
CREATE TABLE IF NOT EXISTS coupon_redemptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Create usage_tracking table
CREATE TABLE IF NOT EXISTS usage_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    metric VARCHAR(50) NOT NULL, -- migrations, storage_bytes, downloads, reports, ai_requests, api_requests, projects
    value BIGINT DEFAULT 0,
    limit_value BIGINT,
    billing_period_start TIMESTAMPTZ NOT NULL,
    billing_period_end TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, metric, billing_period_start, billing_period_end)
);

-- 13. Create billing_logs table
CREATE TABLE IF NOT EXISTS billing_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. Create subscription_events table
CREATE TABLE IF NOT EXISTS subscription_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Triggers to update updated_at automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_subscription_plans_updated_at ON subscription_plans;
CREATE TRIGGER update_subscription_plans_updated_at BEFORE UPDATE ON subscription_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_methods_updated_at ON payment_methods;
CREATE TRIGGER update_payment_methods_updated_at BEFORE UPDATE ON payment_methods FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_billing_addresses_updated_at ON billing_addresses;
CREATE TRIGGER update_billing_addresses_updated_at BEFORE UPDATE ON billing_addresses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_usage_tracking_updated_at ON usage_tracking;
CREATE TRIGGER update_usage_tracking_updated_at BEFORE UPDATE ON usage_tracking FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- SEED DATA: Populate subscription plans and features
DO $$
DECLARE
    free_id UUID := uuid_generate_v4();
    pro_id UUID := uuid_generate_v4();
    team_id UUID := uuid_generate_v4();
    enterprise_id UUID := uuid_generate_v4();
BEGIN
    -- Insert Plans
    INSERT INTO subscription_plans (id, name, slug, description, monthly_price, yearly_price, display_order)
    VALUES 
        (free_id, 'Free', 'free', 'Perfect for individuals starting out', 0.00, 0.00, 0),
        (pro_id, 'Pro', 'pro', 'Advanced capabilities for professional developers', 999.00, 9999.00, 1),
        (team_id, 'Team', 'team', 'Collaborative tooling for high performing engineering teams', 2999.00, 29999.00, 2),
        (enterprise_id, 'Enterprise', 'enterprise', 'Tailored security, limits, and infrastructure', 0.00, 0.00, 3)
    ON CONFLICT (slug) DO NOTHING;

    -- Retrieve IDs in case they already existed
    SELECT id INTO free_id FROM subscription_plans WHERE slug = 'free';
    SELECT id INTO pro_id FROM subscription_plans WHERE slug = 'pro';
    SELECT id INTO team_id FROM subscription_plans WHERE slug = 'team';
    SELECT id INTO enterprise_id FROM subscription_plans WHERE slug = 'enterprise';

    -- Insert Free plan features
    INSERT INTO subscription_features (plan_id, feature_key, feature_value) VALUES
        (free_id, 'migrations_limit', '5'),
        (free_id, 'storage_limit_bytes', '104857600'), -- 100MB
        (free_id, 'team_members_limit', '1'),
        (free_id, 'ai_requests_limit', '10'),
        (free_id, 'api_access', 'false'),
        (free_id, 'dependency_graph', 'false'),
        (free_id, 'custom_reports', 'false')
    ON CONFLICT (plan_id, feature_key) DO NOTHING;

    -- Insert Pro plan features
    INSERT INTO subscription_features (plan_id, feature_key, feature_value) VALUES
        (pro_id, 'migrations_limit', '-1'), -- Unlimited
        (pro_id, 'storage_limit_bytes', '5368709120'), -- 5GB
        (pro_id, 'team_members_limit', '1'),
        (pro_id, 'ai_requests_limit', '1000'),
        (pro_id, 'api_access', 'true'),
        (pro_id, 'dependency_graph', 'true'),
        (pro_id, 'custom_reports', 'true')
    ON CONFLICT (plan_id, feature_key) DO NOTHING;

    -- Insert Team plan features
    INSERT INTO subscription_features (plan_id, feature_key, feature_value) VALUES
        (team_id, 'migrations_limit', '-1'), -- Unlimited
        (team_id, 'storage_limit_bytes', '53687091200'), -- 50GB
        (team_id, 'team_members_limit', '10'),
        (team_id, 'ai_requests_limit', '5000'),
        (team_id, 'api_access', 'true'),
        (team_id, 'dependency_graph', 'true'),
        (team_id, 'custom_reports', 'true')
    ON CONFLICT (plan_id, feature_key) DO NOTHING;

    -- Insert Enterprise plan features
    INSERT INTO subscription_features (plan_id, feature_key, feature_value) VALUES
        (enterprise_id, 'migrations_limit', '-1'),
        (enterprise_id, 'storage_limit_bytes', '-1'), -- Unlimited
        (enterprise_id, 'team_members_limit', '-1'),
        (enterprise_id, 'ai_requests_limit', '-1'),
        (enterprise_id, 'api_access', 'true'),
        (enterprise_id, 'dependency_graph', 'true'),
        (enterprise_id, 'custom_reports', 'true')
    ON CONFLICT (plan_id, feature_key) DO NOTHING;

    -- Insert default coupons
    INSERT INTO coupons (code, discount_type, discount_value, duration, max_redemptions, is_active)
    VALUES 
        ('WELCOME100', 'fixed', 100.00, 'once', 1000, true),
        ('FESTIVE25', 'percentage', 25.00, 'once', 500, true)
    ON CONFLICT (code) DO NOTHING;
END $$;
