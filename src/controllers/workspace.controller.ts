import { Request, Response, NextFunction } from "express";
import { queryDatabase } from "../lib/database";
import { logger } from "../utils/logger";

const SYSTEM_WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";

/**
 * GET /api/workspace/me
 * Returns the current user's workspace info.
 */
export async function handleGetWorkspace(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const workspaceId = (req as any).workspaceId;

    // If system/unauthenticated context, return 401
    if (!userId || userId === "00000000-0000-0000-0000-000000000000") {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const rows = await queryDatabase(
      `SELECT w.id, w.name, w.owner_id, wm.role
       FROM workspaces w
       INNER JOIN workspace_members wm ON wm.workspace_id = w.id
       WHERE w.id = $1::uuid AND wm.user_id = $2::uuid
       LIMIT 1`,
      [workspaceId, userId]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: "Workspace not found" });
    }

    const workspace = rows[0] as any;
    res.json({
      success: true,
      data: {
        id: workspace.id,
        name: workspace.name,
        owner_id: workspace.owner_id,
        role: workspace.role,
      },
    });
  } catch (err) {
    logger.error(`handleGetWorkspace: ${err}`);
    next(err);
  }
}

/**
 * GET /api/workspace/usage
 * Returns job count and storage usage for current workspace.
 */
export async function handleGetUsage(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const workspaceId = (req as any).workspaceId;

    if (!userId || userId === "00000000-0000-0000-0000-000000000000") {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const rows = await queryDatabase(
      `SELECT
         COUNT(*) AS job_count,
         COUNT(*) FILTER (WHERE status = 'completed') AS completed_count
       FROM migration_jobs
       WHERE workspace_id = $1::uuid`,
      [workspaceId]
    );

    const jobCount = parseInt((rows?.[0] as any)?.job_count ?? "0", 10);
    const completedCount = parseInt((rows?.[0] as any)?.completed_count ?? "0", 10);

    res.json({
      success: true,
      data: {
        jobCount,
        completedCount,
        storageUsedMB: 0, // Placeholder — would need file storage tracking
        remainingMigrations: Math.max(0, 100 - jobCount), // Example plan limit
        totalMigrations: 100,
      },
    });
  } catch (err) {
    logger.error(`handleGetUsage: ${err}`);
    next(err);
  }
}
