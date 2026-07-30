import { Response, NextFunction } from "express";
import { queryDatabase } from "../lib/database";
import { AuthenticatedRequest } from "../types/auth.types";
import { logger } from "../utils/logger";

export type AdminRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "SUPPORT"
  | "FINANCE"
  | "DEVELOPER"
  | "VIEWER"
  | "USER";

export type AdminPermission =
  | "users.read"
  | "users.manage"
  | "workspaces.read"
  | "workspaces.manage"
  | "subscriptions.read"
  | "subscriptions.manage"
  | "payments.read"
  | "payments.refund"
  | "jobs.read"
  | "jobs.manage"
  | "reports.read"
  | "logs.read"
  | "analytics.read"
  | "features.read"
  | "features.manage"
  | "health.read";

const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  SUPER_ADMIN: [
    "users.read", "users.manage",
    "workspaces.read", "workspaces.manage",
    "subscriptions.read", "subscriptions.manage",
    "payments.read", "payments.refund",
    "jobs.read", "jobs.manage",
    "reports.read", "logs.read", "analytics.read",
    "features.read", "features.manage", "health.read"
  ],
  ADMIN: [
    "users.read", "users.manage",
    "workspaces.read", "workspaces.manage",
    "subscriptions.read", "subscriptions.manage",
    "payments.read",
    "jobs.read", "jobs.manage",
    "reports.read", "logs.read", "analytics.read",
    "features.read", "features.manage", "health.read"
  ],
  SUPPORT: [
    "users.read",
    "workspaces.read",
    "jobs.read", "jobs.manage",
    "reports.read", "logs.read"
  ],
  FINANCE: [
    "subscriptions.read", "subscriptions.manage",
    "payments.read", "payments.refund",
    "analytics.read"
  ],
  DEVELOPER: [
    "jobs.read", "jobs.manage",
    "health.read", "logs.read",
    "features.read"
  ],
  VIEWER: [
    "users.read", "workspaces.read", "subscriptions.read",
    "payments.read", "jobs.read", "reports.read",
    "analytics.read", "health.read", "features.read"
  ],
  USER: []
};

export function hasPermission(role: AdminRole, permission: AdminPermission): boolean {
  if (role === "SUPER_ADMIN") return true;
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
}

export async function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const userId = req.userId || req.user?.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      code: "ADMIN_ACCESS_REQUIRED",
      message: "Unauthorized: Authentication required",
    });
  }

  // System user bypass
  if (userId === "00000000-0000-0000-0000-000000000000") {
    (req as any).adminRole = "SUPER_ADMIN";
    return next();
  }

  try {
    const rows = await queryDatabase(
      `SELECT system_role, status FROM users WHERE id = $1::uuid AND deleted_at IS NULL LIMIT 1`,
      [userId]
    );

    if (!rows || rows.length === 0) {
      return res.status(401).json({
        success: false,
        code: "USER_NOT_FOUND",
        message: "User account not found",
      });
    }

    const user = rows[0];
    if (user.status === "SUSPENDED") {
      return res.status(403).json({
        success: false,
        code: "USER_SUSPENDED",
        message: "Your account has been suspended. Please contact support.",
      });
    }

    const role = (user.system_role as AdminRole) || "USER";
    if (role === "USER") {
      return res.status(403).json({
        success: false,
        code: "PERMISSION_DENIED",
        message: "Forbidden: Admin privileges required",
      });
    }

    (req as any).adminRole = role;
    next();
  } catch (err: any) {
    logger.error(`Admin auth error: ${err.message}`);
    next(err);
  }
}

export function requirePermission(permission: AdminPermission) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const role = (req as any).adminRole as AdminRole;

    if (!role || !hasPermission(role, permission)) {
      return res.status(403).json({
        success: false,
        code: "PERMISSION_DENIED",
        message: `Forbidden: Missing required permission [${permission}]`,
      });
    }

    next();
  };
}
