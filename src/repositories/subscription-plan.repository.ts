import { queryDatabase } from "../lib/database";
import { SubscriptionPlan, SubscriptionFeature } from "../models/billing.model";

export class SubscriptionPlanRepository {
  async findAllActive(): Promise<SubscriptionPlan[]> {
    const rows = await queryDatabase(
      `SELECT id, name, slug, description, 
              monthly_price AS "monthlyPrice", yearly_price AS "yearlyPrice", 
              currency, trial_days AS "trialDays", display_order AS "displayOrder",
              is_public AS "isPublic", is_active AS "isActive", 
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM subscription_plans
       WHERE is_active = true
       ORDER BY display_order ASC`
    );
    return rows;
  }

  async findById(id: string): Promise<SubscriptionPlan | null> {
    const rows = await queryDatabase(
      `SELECT id, name, slug, description, 
              monthly_price AS "monthlyPrice", yearly_price AS "yearlyPrice", 
              currency, trial_days AS "trialDays", display_order AS "displayOrder",
              is_public AS "isPublic", is_active AS "isActive", 
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM subscription_plans
       WHERE id = $1::uuid`,
      [id]
    );
    return rows[0] || null;
  }

  async findBySlug(slug: string): Promise<SubscriptionPlan | null> {
    const rows = await queryDatabase(
      `SELECT id, name, slug, description, 
              monthly_price AS "monthlyPrice", yearly_price AS "yearlyPrice", 
              currency, trial_days AS "trialDays", display_order AS "displayOrder",
              is_public AS "isPublic", is_active AS "isActive", 
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM subscription_plans
       WHERE slug = $1 AND is_active = true`,
      [slug]
    );
    return rows[0] || null;
  }

  async findPlanFeatures(planId: string): Promise<SubscriptionFeature[]> {
    const rows = await queryDatabase(
      `SELECT id, plan_id AS "planId", feature_key AS "featureKey", 
              feature_value AS "featureValue", created_at AS "createdAt"
       FROM subscription_features
       WHERE plan_id = $1::uuid`,
      [planId]
    );
    return rows;
  }

  async savePlan(plan: Partial<SubscriptionPlan>): Promise<SubscriptionPlan> {
    const rows = await queryDatabase(
      `INSERT INTO subscription_plans (name, slug, description, monthly_price, yearly_price, currency, trial_days, display_order, is_public, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (slug) DO UPDATE 
       SET name = EXCLUDED.name, description = EXCLUDED.description, monthly_price = EXCLUDED.monthly_price, 
           yearly_price = EXCLUDED.yearly_price, display_order = EXCLUDED.display_order, is_active = EXCLUDED.is_active, updated_at = NOW()
       RETURNING id, name, slug, description, monthly_price AS "monthlyPrice", yearly_price AS "yearlyPrice", 
                 currency, trial_days AS "trialDays", display_order AS "displayOrder", is_public AS "isPublic", is_active AS "isActive"`,
      [
        plan.name,
        plan.slug,
        plan.description,
        plan.monthlyPrice || 0.00,
        plan.yearlyPrice || 0.00,
        plan.currency || 'INR',
        plan.trialDays || 0,
        plan.displayOrder || 0,
        plan.isPublic ?? true,
        plan.isActive ?? true
      ]
    );
    return rows[0];
  }

  async saveFeature(planId: string, featureKey: string, featureValue: string): Promise<SubscriptionFeature> {
    const rows = await queryDatabase(
      `INSERT INTO subscription_features (plan_id, feature_key, feature_value)
       VALUES ($1::uuid, $2, $3)
       ON CONFLICT (plan_id, feature_key) DO UPDATE 
       SET feature_value = EXCLUDED.feature_value
       RETURNING id, plan_id AS "planId", feature_key AS "featureKey", feature_value AS "featureValue"`,
      [planId, featureKey, featureValue]
    );
    return rows[0];
  }
}
export const subscriptionPlanRepository = new SubscriptionPlanRepository();
