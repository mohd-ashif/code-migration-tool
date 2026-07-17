import { MigrationRepository } from "../repositories/MigrationRepository";
import { ReportRepository } from "../repositories/ReportRepository";
import { UploadRepository } from "../repositories/UploadRepository";
import { queryDatabase } from "../lib/database";
import { HttpError } from "./auth.service";

export class DashboardService {
  private migrationRepo = new MigrationRepository();
  private reportRepo = new ReportRepository();
  private uploadRepo = new UploadRepository();

  async getDashboardData(userId: string, workspaceId: string) {
    // 1. Fetch Workspace Info
    const workspaceRows = await queryDatabase(
      `SELECT w.id, w.name, w.owner_id, wm.role
       FROM workspaces w
       INNER JOIN workspace_members wm ON wm.workspace_id = w.id
       WHERE w.id = $1::uuid AND wm.user_id = $2::uuid
       LIMIT 1`,
      [workspaceId, userId]
    );

    if (!workspaceRows || workspaceRows.length === 0) {
      throw new HttpError(404, "Workspace not found");
    }
    const workspace = workspaceRows[0];

    // 2. Fetch Recent Jobs (last 10)
    const recentJobs = await this.migrationRepo.getRecentJobs(userId, workspaceId, 10);

    // 3. Fetch Recent Reports (last 10)
    const reportsResult = await this.reportRepo.findByUserAndWorkspace(userId, workspaceId, { limit: 10 });
    const recentReports = reportsResult.reports;

    // 4. Fetch Core Stats (migration count, downloads, warnings, errors)
    const stats = await this.migrationRepo.getStats(userId, workspaceId);

    // 5. Fetch Storage Utilized
    const storageBytes = await this.uploadRepo.getStorageUsed(userId, workspaceId);
    const storageUsedMB = Math.round((storageBytes / (1024 * 1024)) * 100) / 100; // 2 decimal places

    // Total migration limit
    const totalMigrationsLimit = 100;
    const remainingMigrations = Math.max(0, totalMigrationsLimit - stats.totalJobs);

    return {
      currentPlan: "Pro SaaS Developer",
      workspace: {
        id: workspace.id,
        name: workspace.name,
        ownerId: workspace.owner_id,
        role: workspace.role,
      },
      recentJobs,
      recentReports,
      migrationCount: stats.totalJobs,
      storageUsed: storageUsedMB,
      downloads: stats.totalDownloads,
      warnings: stats.totalWarnings,
      errors: stats.totalErrors,
      usage: {
        jobCount: stats.totalJobs,
        storageUsedMB,
        remainingMigrations,
        totalMigrations: totalMigrationsLimit,
      },
      subscription: {
        status: "active",
        plan: "Pro Developer",
        billingCycle: "monthly",
      },
      remainingCredits: remainingMigrations,
    };
  }
}
