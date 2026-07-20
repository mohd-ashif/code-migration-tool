import { queryDatabase } from "../lib/database";
import { UsageTracking } from "../models/billing.model";

export class UsageRepository {
  async findUsage(
    workspaceId: string,
    metric: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<UsageTracking | null> {
    const rows = await queryDatabase(
      `SELECT id, workspace_id AS "workspaceId", metric, value, limit_value AS "limitValue",
              billing_period_start AS "billingPeriodStart", billing_period_end AS "billingPeriodEnd",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM usage_tracking
       WHERE workspace_id = $1::uuid AND metric = $2 AND billing_period_start = $3 AND billing_period_end = $4`,
      [workspaceId, metric, periodStart, periodEnd]
    );
    return rows[0] || null;
  }

  async listUsage(workspaceId: string, periodStart: Date, periodEnd: Date): Promise<UsageTracking[]> {
    const rows = await queryDatabase(
      `SELECT id, workspace_id AS "workspaceId", metric, value, limit_value AS "limitValue",
              billing_period_start AS "billingPeriodStart", billing_period_end AS "billingPeriodEnd",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM usage_tracking
       WHERE workspace_id = $1::uuid AND billing_period_start = $2 AND billing_period_end = $3`,
      [workspaceId, periodStart, periodEnd]
    );
    return rows;
  }

  async incrementUsage(
    workspaceId: string,
    metric: string,
    amount: number,
    limitValue: number | null,
    periodStart: Date,
    periodEnd: Date
  ): Promise<UsageTracking> {
    const rows = await queryDatabase(
      `INSERT INTO usage_tracking (workspace_id, metric, value, limit_value, billing_period_start, billing_period_end)
       VALUES ($1::uuid, $2, $3, $4, $5, $6)
       ON CONFLICT (workspace_id, metric, billing_period_start, billing_period_end) 
       DO UPDATE SET value = usage_tracking.value + EXCLUDED.value, limit_value = EXCLUDED.limit_value, updated_at = NOW()
       RETURNING id, workspace_id AS "workspaceId", metric, value, limit_value AS "limitValue", 
                 billing_period_start AS "billingPeriodStart", billing_period_end AS "billingPeriodEnd"`,
      [workspaceId, metric, amount, limitValue, periodStart, periodEnd]
    );
    return rows[0];
  }

  async resetUsage(
    workspaceId: string,
    metric: string,
    limitValue: number | null,
    periodStart: Date,
    periodEnd: Date
  ): Promise<UsageTracking> {
    const rows = await queryDatabase(
      `INSERT INTO usage_tracking (workspace_id, metric, value, limit_value, billing_period_start, billing_period_end)
       VALUES ($1::uuid, $2, 0, $4, $5, $6)
       ON CONFLICT (workspace_id, metric, billing_period_start, billing_period_end) 
       DO UPDATE SET value = 0, limit_value = EXCLUDED.limit_value, updated_at = NOW()
       RETURNING id, workspace_id AS "workspaceId", metric, value, limit_value AS "limitValue", 
                 billing_period_start AS "billingPeriodStart", billing_period_end AS "billingPeriodEnd"`,
      [workspaceId, metric, limitValue, periodStart, periodEnd]
    );
    return rows[0];
  }
}
export const usageRepository = new UsageRepository();
