import { Response, NextFunction } from "express";
import { queryDatabase } from "../lib/database";

export async function adminMiddleware(req: any, res: Response, next: NextFunction) {
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: Missing authentication context",
    });
  }

  // System context / CLI bypass if using system user UUID
  if (userId === "00000000-0000-0000-0000-000000000000") {
    return next();
  }

  try {
    const rows = await queryDatabase(
      `SELECT system_role FROM users WHERE id = $1::uuid AND deleted_at IS NULL LIMIT 1`,
      [userId]
    );

    const systemRole = rows?.[0]?.system_role?.toUpperCase();
    if (!rows || rows.length === 0 || (systemRole !== "SUPER_ADMIN" && systemRole !== "ADMIN")) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Platform Admin privileges required",
      });
    }

    next();
  } catch (err) {
    next(err);
  }
}
