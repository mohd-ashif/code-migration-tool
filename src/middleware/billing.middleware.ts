import { Response, NextFunction } from "express";
import { subscriptionRepository } from "../repositories/subscription.repository";
import { subscriptionPlanRepository } from "../repositories/subscription-plan.repository";
import { usageRepository } from "../repositories/usage.repository";
import { HttpError } from "./error.middleware";
import { logger } from "../utils/logger";

/**
 * Helper to get start and end dates of the current billing cycle
 */
export function getBillingPeriod(subscription: any) {
  if (subscription && subscription.status === "active" && subscription.startsAt && subscription.expiresAt) {
    return {
      start: new Date(subscription.startsAt),
      end: new Date(subscription.expiresAt),
    };
  }

  // Fallback for Free/unsubscribed workspaces: calendar month cycles
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1); // Exclude boundary
  return { start, end };
}

/**
 * Resolves the plan slug and ID for a workspace
 */
export async function resolveWorkspacePlan(workspaceId: string): Promise<{ planId: string; slug: string; subscription: any | null }> {
  // 1. Get active subscription
  const sub = await subscriptionRepository.findByWorkspaceId(workspaceId);
  if (sub && sub.status === "active") {
    const plan = await subscriptionPlanRepository.findById(sub.planId);
    if (plan) {
      return { planId: plan.id, slug: plan.slug, subscription: sub };
    }
  }

  // 2. Default fallback to 'free' plan
  const freePlan = await subscriptionPlanRepository.findBySlug("free");
  if (!freePlan) {
    throw new Error("Default Free plan config is missing in database.");
  }
  return { planId: freePlan.id, slug: "free", subscription: null };
}

/**
 * Middleware to restrict route access to specific subscription plan tiers (e.g. pro, team)
 */
export function requireSubscription(allowedPlans: string[]) {
  return async (req: any, res: Response, next: NextFunction) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) {
        throw new HttpError(400, "Workspace context required.");
      }

      const { slug } = await resolveWorkspacePlan(workspaceId);
      
      if (!allowedPlans.includes(slug)) {
        throw new HttpError(403, `This action requires a ${allowedPlans.join(" or ")} subscription. Current plan is ${slug}.`);
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Middleware to restrict access based on boolean plan features
 */
export function requireFeature(featureKey: string) {
  return async (req: any, res: Response, next: NextFunction) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) {
        throw new HttpError(400, "Workspace context required.");
      }

      const { planId } = await resolveWorkspacePlan(workspaceId);
      const features = await subscriptionPlanRepository.findPlanFeatures(planId);
      const feature = features.find(f => f.featureKey === featureKey);

      if (!feature || feature.featureValue === "false") {
        throw new HttpError(403, `Access denied. Feature '${featureKey}' is not included in your current plan.`);
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Middleware to enforce maximum usage limits (e.g., migrations count, storage size)
 */
export function requireUsageLimit(metric: string) {
  return async (req: any, res: Response, next: NextFunction) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) {
        throw new HttpError(400, "Workspace context required.");
      }

      const { planId, slug, subscription } = await resolveWorkspacePlan(workspaceId);
      const features = await subscriptionPlanRepository.findPlanFeatures(planId);
      
      // Determine the limit value configured for this plan
      // Limit keys in db follow: migrations_limit, storage_limit_bytes, team_members_limit, ai_requests_limit
      let limitKey = `${metric}_limit`;
      if (metric === "storage_bytes") limitKey = "storage_limit_bytes";
      
      const featureLimit = features.find(f => f.featureKey === limitKey);
      
      if (!featureLimit) {
        return next(); // If no limit config is found, default to unblocked
      }

      const limit = parseInt(featureLimit.featureValue, 10);
      if (limit === -1) {
        return next(); // Unlimited
      }

      // Query active usage counter
      const { start, end } = getBillingPeriod(subscription);
      const usageRecord = await usageRepository.findUsage(workspaceId, metric, start, end);
      const currentUsage = usageRecord ? parseInt(usageRecord.value.toString(), 10) : 0;

      if (currentUsage >= limit) {
        throw new HttpError(402, `Monthly usage limit reached for ${metric} (${currentUsage}/${limit}). Please upgrade your plan to continue.`);
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
