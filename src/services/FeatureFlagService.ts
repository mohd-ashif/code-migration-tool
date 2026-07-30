import { queryDatabase } from "../lib/database";
import { logger } from "../utils/logger";
import { createHash } from "crypto";

export interface FeatureFlag {
  id: string;
  key: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number;
  rules?: {
    plans?: string[];
    workspaces?: string[];
    users?: string[];
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

export class FeatureFlagService {
  /**
   * Evaluate if a feature flag is enabled for a given context
   */
  public static async isFeatureEnabled(context: {
    featureKey: string;
    userId?: string;
    workspaceId?: string;
    planId?: string;
  }): Promise<boolean> {
    try {
      const rows = await queryDatabase(
        `SELECT * FROM feature_flags WHERE key = $1 LIMIT 1`,
        [context.featureKey]
      );

      if (!rows || rows.length === 0) {
        return false;
      }

      const flag = rows[0];
      if (!flag.enabled) {
        return false;
      }

      const rules = flag.rules || {};

      // Target check: Specific user targeting
      if (rules.users && Array.isArray(rules.users) && context.userId) {
        if (rules.users.includes(context.userId)) return true;
      }

      // Target check: Specific workspace targeting
      if (rules.workspaces && Array.isArray(rules.workspaces) && context.workspaceId) {
        if (rules.workspaces.includes(context.workspaceId)) return true;
      }

      // Target check: Plan targeting
      if (rules.plans && Array.isArray(rules.plans) && context.planId) {
        if (!rules.plans.includes(context.planId)) return false;
      }

      // Rollout percentage deterministic check
      const rollout = flag.rollout_percentage ?? 100;
      if (rollout >= 100) return true;
      if (rollout <= 0) return false;

      // Hash deterministic bucket calculation (0 - 99)
      const seed = `${context.featureKey}:${context.userId || context.workspaceId || "anon"}`;
      const hash = createHash("md5").update(seed).digest("hex");
      const bucket = parseInt(hash.substring(0, 4), 16) % 100;

      return bucket < rollout;
    } catch (err: any) {
      logger.error(`Error evaluating feature flag [${context.featureKey}]: ${err.message}`);
      return false;
    }
  }

  /**
   * List all feature flags
   */
  public static async listFlags(): Promise<FeatureFlag[]> {
    const rows = await queryDatabase(`SELECT * FROM feature_flags ORDER BY created_at ASC`);
    return rows.map((r: any) => ({
      id: r.id,
      key: r.key,
      description: r.description,
      enabled: r.enabled,
      rolloutPercentage: r.rollout_percentage,
      rules: r.rules,
      createdAt: new Date(r.created_at),
      updatedAt: new Date(r.updated_at),
    }));
  }

  /**
   * Create or update a feature flag
   */
  public static async saveFlag(data: {
    key: string;
    description?: string;
    enabled: boolean;
    rolloutPercentage?: number;
    rules?: any;
  }): Promise<FeatureFlag> {
    const query = `
      INSERT INTO feature_flags (key, description, enabled, rollout_percentage, rules)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (key) DO UPDATE
      SET description = EXCLUDED.description,
          enabled = EXCLUDED.enabled,
          rollout_percentage = EXCLUDED.rollout_percentage,
          rules = EXCLUDED.rules,
          updated_at = NOW()
      RETURNING *
    `;

    const rows = await queryDatabase(query, [
      data.key,
      data.description || null,
      data.enabled,
      data.rolloutPercentage ?? 100,
      data.rules ? JSON.stringify(data.rules) : null,
    ]);

    const r = rows[0];
    return {
      id: r.id,
      key: r.key,
      description: r.description,
      enabled: r.enabled,
      rolloutPercentage: r.rollout_percentage,
      rules: r.rules,
      createdAt: new Date(r.created_at),
      updatedAt: new Date(r.updated_at),
    };
  }
}
