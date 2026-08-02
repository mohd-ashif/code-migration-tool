import { queryDatabase } from "../lib/database";
import { WorkspaceRepository } from "../repositories/workspace.repository";
import { HttpError } from "../middleware/error.middleware";
import { EntitlementService } from "./EntitlementService";

export class WorkspaceUsageService {
  private workspaceRepo = new WorkspaceRepository();

  async getUsage(workspaceId: string) {
    const ws = await this.workspaceRepo.findById(workspaceId);
    if (!ws) {
      throw new HttpError(404, "Workspace not found.");
    }

    // Query active counts dynamically
    const countRows = await queryDatabase(
      `SELECT COUNT(*) AS count FROM migration_jobs WHERE workspace_id = $1::uuid AND deleted_at IS NULL`,
      [workspaceId]
    );
    const completedRows = await queryDatabase(
      `SELECT COUNT(*) AS count FROM migration_jobs WHERE workspace_id = $1::uuid AND status = 'completed' AND deleted_at IS NULL`,
      [workspaceId]
    );

    const jobCount = parseInt(countRows[0]?.count || "0", 10);
    const completedCount = parseInt(completedRows[0]?.count || "0", 10);

    // Resolve workspace plan migration limit dynamically from entitlement service
    let totalMigrations: number | string = 100;
    try {
      const entitlements = await EntitlementService.getWorkspaceEntitlements(workspaceId);
      const planSlug = (entitlements.planSlug || '').toLowerCase();

      if (planSlug === 'pro' || planSlug === 'enterprise' || planSlug === 'team') {
        totalMigrations = 'Unlimited';
      } else {
        const rawLimit = entitlements.entitlements?.max_migrations || entitlements.entitlements?.migrations_limit;
        if (rawLimit && (rawLimit === 'unlimited' || rawLimit === 'Infinity' || String(rawLimit) === '-1')) {
          totalMigrations = 'Unlimited';
        } else if (rawLimit && !isNaN(Number(rawLimit))) {
          totalMigrations = parseInt(String(rawLimit), 10);
        }
      }
    } catch {
      totalMigrations = 100;
    }

    const numericLimit = typeof totalMigrations === 'number' ? totalMigrations : 999999;

    return {
      jobCount,
      completedCount,
      remainingMigrations: Math.max(0, numericLimit - jobCount),
      totalMigrations
    };
  }

  async getStorage(workspaceId: string) {
    const ws = await this.workspaceRepo.findById(workspaceId);
    if (!ws) {
      throw new HttpError(404, "Workspace not found.");
    }

    // Calculate sum of uploaded project sizes
    const sizeRows = await queryDatabase(
      `SELECT COALESCE(SUM(project_size), 0) AS total_size FROM migration_jobs WHERE workspace_id = $1::uuid AND deleted_at IS NULL`,
      [workspaceId]
    );
    const storageUsed = parseInt(sizeRows[0]?.total_size || "0", 10);

    return {
      storageUsed,
      storageLimit: ws.storageLimit || 104857600 // 100MB
    };
  }
}

export const workspaceUsageService = new WorkspaceUsageService();
