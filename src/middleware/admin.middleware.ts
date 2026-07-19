import { Response, NextFunction } from "express";
import { queryDatabase } from "../lib/database";

export async function adminMiddleware(req: any, res: Response, next: NextFunction) {
  const userId = req.userId;
  const workspaceId = req.workspaceId;

  if (!userId || !workspaceId) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: Missing authentication context",
    });
  }

  // System context / CLI bypass if using system user UUID
  if (userId === "00000000-0000-0000-0000-000000000000" && workspaceId === "00000000-0000-0000-0000-000000000001") {
    return next();
  }

  try {
    const rows = await queryDatabase(
      `SELECT role FROM workspace_members WHERE workspace_id = $1::uuid AND user_id = $2::uuid LIMIT 1`,
      [workspaceId, userId]
    );

    if (!rows || rows.length === 0 || rows[0].role !== "owner") {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Admin privileges required",
      });
    }

    next();
  } catch (err) {
    next(err);
  }
}
