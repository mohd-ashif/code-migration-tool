import { queryDatabase } from "../lib/database";
import { logger } from "../utils/logger";

export interface WorkspaceEntitlements {
  planId: string;
  planSlug: string;
  planName: string;
  version: number;
  status: string;
  entitlements: Record<string, any>;
}

export class EntitlementService {
  /**
   * Resolves active workspace subscription entitlements from database snapshot or plan features
   */
  static async getWorkspaceEntitlements(workspaceId: string): Promise<WorkspaceEntitlements> {
    try {
      const rows = await queryDatabase(
        `SELECT 
           s.id as subscription_id, s.status, s.entitlements_snapshot,
           p.id as plan_id, p.slug as plan_slug, p.name as plan_name, p.version as plan_version,
           v.entitlements as version_entitlements
         FROM subscriptions s
         JOIN subscription_plans p ON p.id = s.plan_id
         LEFT JOIN subscription_plan_versions v ON v.id = s.plan_version_id
         WHERE s.workspace_id = $1::uuid AND s.status IN ('active', 'trialing')
         ORDER BY s.created_at DESC
         LIMIT 1`,
        [workspaceId]
      );

      if (rows && rows.length > 0) {
        const sub = rows[0];
        let entitlements = sub.entitlements_snapshot || sub.version_entitlements;

        if (!entitlements || Object.keys(entitlements).length === 0) {
          entitlements = await this.fetchPlanFeaturesFromDb(sub.plan_id);
        }

        return {
          planId: sub.plan_id,
          planSlug: sub.plan_slug,
          planName: sub.plan_name,
          version: sub.plan_version || 1,
          status: sub.status,
          entitlements: entitlements || {},
        };
      }

      // Default Fallback: Query Free plan definition
      const freePlanRows = await queryDatabase(
        `SELECT id, slug, name, version FROM subscription_plans WHERE slug = 'free' LIMIT 1`
      );

      if (freePlanRows && freePlanRows.length > 0) {
        const freePlan = freePlanRows[0];
        const entitlements = await this.fetchPlanFeaturesFromDb(freePlan.id);
        return {
          planId: freePlan.id,
          planSlug: freePlan.slug,
          planName: freePlan.name,
          version: freePlan.version || 1,
          status: "active",
          entitlements,
        };
      }
    } catch (err: any) {
      logger.error(`EntitlementService error resolving workspace ${workspaceId}: ${err.message}`);
    }

    // Default safe fallback if database is empty or uninitialized
    return {
      planId: "free",
      planSlug: "free",
      planName: "Free",
      version: 1,
      status: "active",
      entitlements: {
        migrations_limit: "5",
        storage_limit_bytes: "104857600",
        team_members_limit: "1",
        ai_requests_limit: "10",
        api_access: "false",
        dependency_graph: "true",
        custom_reports: "false",
      },
    };
  }

  /**
   * Helper to fetch key/value feature maps from subscription_features table
   */
  private static async fetchPlanFeaturesFromDb(planId: string): Promise<Record<string, string>> {
    const rows = await queryDatabase(
      `SELECT feature_key, feature_value FROM subscription_features WHERE plan_id = $1::uuid`,
      [planId]
    );
    const map: Record<string, string> = {};
    for (const r of rows) {
      map[r.feature_key] = r.feature_value;
    }
    return map;
  }

  /**
   * Evaluates if a feature boolean toggle is allowed for workspace
   */
  static async canUseFeature(workspaceId: string, featureKey: string): Promise<boolean> {
    const res = await this.getWorkspaceEntitlements(workspaceId);
    const val = res.entitlements[featureKey];

    if (val === undefined || val === null) return false;
    if (typeof val === "boolean") return val;
    if (typeof val === "string") return val.toLowerCase() === "true" || val === "1";
    return Boolean(val);
  }

  /**
   * Evaluates numeric limit for workspace entitlement (returns Infinity if -1/unlimited)
   */
  static async getLimit(workspaceId: string, limitKey: string): Promise<number> {
    const res = await this.getWorkspaceEntitlements(workspaceId);
    const rawVal = res.entitlements[limitKey];

    if (rawVal === undefined || rawVal === null) return 0;
    const num = parseInt(String(rawVal), 10);
    if (isNaN(num)) return 0;
    return num === -1 ? Infinity : num;
  }

  /**
   * Checks current workspace usage against plan limits
   */
  static async checkUsage(
    workspaceId: string,
    metric: string,
    requestedAmount = 1
  ): Promise<{ allowed: boolean; current: number; limit: number }> {
    const limit = await this.getLimit(workspaceId, `${metric}_limit`);
    if (limit === Infinity) {
      return { allowed: true, current: 0, limit: Infinity };
    }

    const usageRows = await queryDatabase(
      `SELECT value FROM usage_tracking 
       WHERE workspace_id = $1::uuid AND metric = $2 
       AND billing_period_start <= NOW() AND billing_period_end >= NOW()
       LIMIT 1`,
      [workspaceId, metric]
    );

    const current = usageRows && usageRows.length > 0 ? parseInt(usageRows[0].value, 10) : 0;
    const allowed = current + requestedAmount <= limit;

    return { allowed, current, limit };
  }
}
