import { Request, Response, NextFunction } from "express";
import { enqueueMigrationJob } from "../services/job.service";
import { detectFramework } from "../utils/detectFramework";
import { isSupportedMigrationPair, supportedMigrationPairs } from "../services/codemod.service";
import { SourceFramework, TargetFramework } from "../types/migration.types";
import { usageRepository } from "../repositories/usage.repository";
import { resolveWorkspacePlan, getBillingPeriod } from "../middleware/billing.middleware";
import { subscriptionPlanRepository } from "../repositories/subscription-plan.repository";
import { logger } from "../utils/logger";

const targetFrameworks: TargetFramework[] = ["react", "next", "typescript", "vue", "svelte", "nuxt", "solid", "qwik"];

const frameworkLabels: Record<string, string> = {
  angular: "Angular",
  vue: "Vue",
  react: "React",
  javascript: "JavaScript",
  typescript: "TypeScript",
  next: "Next.js",
  svelte: "Svelte",
  nuxt: "Nuxt.js",
  solid: "SolidJS",
  qwik: "Qwik",
};

function getValidTargetsForSource(source: SourceFramework): TargetFramework[] {
  return supportedMigrationPairs
    .filter((pair) => pair.source === source)
    .map((pair) => pair.target);
}

function formatPairList(pairs: Array<{ source: string; target: string }>): string {
  return pairs
    .map((p) => `${frameworkLabels[p.source] ?? p.source} → ${frameworkLabels[p.target] ?? p.target}`)
    .join(", ");
}

export async function handleMigrate(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectFiles, targetFramework, sourceFramework } = req.body;

    if (!Array.isArray(projectFiles) || !targetFramework || !targetFrameworks.includes(targetFramework)) {
      return res.status(400).json({ success: false, message: "projectFiles and valid targetFramework are required." });
    }

    const source = (sourceFramework as SourceFramework) || detectFramework(projectFiles);
    const providedSource = sourceFramework ? (sourceFramework as SourceFramework) : undefined;

    if (!isSupportedMigrationPair(source, targetFramework)) {
      const validTargets = getValidTargetsForSource(source);
      const detectedLabel = frameworkLabels[source] ?? source;
      const targetLabel = frameworkLabels[targetFramework] ?? targetFramework;

      if (source === targetFramework) {
        // Source and target are the same framework
        if (validTargets.length > 0) {
          const suggestions = validTargets
            .map((t) => `${detectedLabel} → ${frameworkLabels[t] ?? t}`)
            .join(", ");
          return res.status(400).json({
            success: false,
            detectedSource: source,
            requestedTarget: targetFramework,
            message: `Source and target are both "${detectedLabel}". No migration needed. Did you mean to migrate to a different framework? Valid migrations for ${detectedLabel}: ${suggestions}.`,
            validTargets,
          });
        }
        return res.status(400).json({
          success: false,
          detectedSource: source,
          requestedTarget: targetFramework,
          message: `Source and target are both "${detectedLabel}". No migration needed. There are no supported migration targets for ${detectedLabel} as a source.`,
        });
      }

      // General unsupported pair
      return res.status(400).json({
        success: false,
        detectedSource: source,
        requestedTarget: targetFramework,
        message: `Unsupported migration pair: ${detectedLabel} → ${targetLabel}. Supported migrations are: ${formatPairList(supportedMigrationPairs)}.`,
        ...(validTargets.length > 0 && {
          validTargets,
          hint: `For ${detectedLabel} source projects, valid targets are: ${validTargets.map((t) => frameworkLabels[t] ?? t).join(", ")}.`,
        }),
      });
    }

    const workspaceId = (req as any).workspaceId;
    const userId = (req as any).userId;
    const job = enqueueMigrationJob({ projectFiles, targetFramework, sourceFramework: source }, workspaceId, userId);
    
    // Increment Monthly Migrations Count
    try {
      const { planId, subscription } = await resolveWorkspacePlan(workspaceId);
      const features = await subscriptionPlanRepository.findPlanFeatures(planId);
      const limitVal = features.find(f => f.featureKey === "migrations_limit")?.featureValue || "5";
      const limit = parseInt(limitVal, 10);
      const billingPeriod = getBillingPeriod(subscription);
      
      await usageRepository.incrementUsage(
        workspaceId,
        "migrations",
        1,
        limit === -1 ? null : limit,
        billingPeriod.start,
        billingPeriod.end
      );
    } catch (err: any) {
      logger.error(`Failed to increment migration count: ${err.message}`);
    }

    res.status(202).json({ success: true, jobId: job.id, status: job.status, sourceFramework: providedSource ?? source });
  } catch (error) {
    next(error);
  }
}
