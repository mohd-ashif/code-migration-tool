-- Database Migration 017: Enable Dependency Graph feature for Free Plan
DO $$
DECLARE
    free_plan_id UUID;
BEGIN
    SELECT id INTO free_plan_id FROM subscription_plans WHERE slug = 'free' LIMIT 1;
    
    IF free_plan_id IS NOT NULL THEN
        -- Update or insert dependency_graph feature for free plan
        INSERT INTO subscription_features (plan_id, feature_key, feature_value)
        VALUES (free_plan_id, 'dependency_graph', 'true')
        ON CONFLICT (plan_id, feature_key) DO UPDATE
        SET feature_value = 'true';

        -- Update entitlements snapshot in subscription_plan_versions
        UPDATE subscription_plan_versions
        SET entitlements = jsonb_set(entitlements, '{dependency_graph}', '"true"')
        WHERE plan_id = free_plan_id;
    END IF;
END $$;
