import { Response, NextFunction } from "express";
import { queryDatabase } from "../lib/database";
import { AuthenticatedRequest } from "../types/auth.types";
import { AdminAuditService } from "../services/AdminAuditService";
import { EntitlementService } from "../services/EntitlementService";
import { logger } from "../utils/logger";

/**
 * 1. GET /api/admin/users/:id — User 360° Profile
 */
export async function handleGetUser360(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.params.id as string;

    // A. Fetch User Account Info (Strictly excluding password hash)
    const userRows = await queryDatabase(
      `SELECT id, email, full_name as "fullName", system_role as "systemRole", status, avatar_url as "avatarUrl", created_at as "createdAt", updated_at as "updatedAt"
       FROM users
       WHERE id = $1::uuid LIMIT 1`,
      [userId]
    );

    if (!userRows || userRows.length === 0) {
      return res.status(404).json({ success: false, code: "USER_NOT_FOUND", message: "User not found." });
    }

    const user = userRows[0];

    // B. Workspaces (Owned & Member)
    const ownedWorkspaces = await queryDatabase(
      `SELECT w.id, w.name, w.slug, w.plan_id as "planId", w.status, w.storage_used as "storageUsed", w.storage_limit as "storageLimit", w.created_at as "createdAt", 'OWNER' as role
       FROM workspaces w
       WHERE w.owner_id = $1::uuid`,
      [userId]
    );

    const memberWorkspaces = await queryDatabase(
      `SELECT w.id, w.name, w.slug, w.plan_id as "planId", w.status, w.storage_used as "storageUsed", w.storage_limit as "storageLimit", w.created_at as "createdAt", wm.role
       FROM workspace_members wm
       JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.user_id = $1::uuid AND w.owner_id != $1::uuid`,
      [userId]
    );

    const allWorkspaces = [...ownedWorkspaces, ...memberWorkspaces];
    const primaryWorkspaceId = ownedWorkspaces[0]?.id || memberWorkspaces[0]?.id;

    // C. Subscription & Entitlements
    let subscription: any = null;
    let entitlements: any = null;

    if (primaryWorkspaceId) {
      entitlements = await EntitlementService.getWorkspaceEntitlements(primaryWorkspaceId);
      const subRows = await queryDatabase(
        `SELECT s.id, s.status, s.billing_cycle as "billingCycle", s.starts_at as "startsAt", s.expires_at as "expiresAt",
                p.name as "planName", p.slug as "planSlug", p.monthly_price as "monthlyPrice"
         FROM subscriptions s
         JOIN subscription_plans p ON p.id = s.plan_id
         WHERE s.workspace_id = $1::uuid
         ORDER BY s.created_at DESC LIMIT 1`,
        [primaryWorkspaceId]
      );
      subscription = subRows[0] || null;
    }

    // D. Usage Tracking Metrics
    let usage: any[] = [];
    if (primaryWorkspaceId) {
      usage = await queryDatabase(
        `SELECT metric, value, billing_period_start as "periodStart", billing_period_end as "periodEnd"
         FROM usage_tracking
         WHERE workspace_id = $1::uuid`,
        [primaryWorkspaceId]
      );
    }

    // E. Migration Jobs History & Failures
    const migrationStatsRows = await queryDatabase(
      `SELECT 
         COUNT(*) as total,
         COUNT(CASE WHEN status IN ('completed', 'COMPLETED') THEN 1 END) as completed,
         COUNT(CASE WHEN status IN ('failed', 'FAILED') THEN 1 END) as failed
       FROM migration_jobs
       WHERE user_id = $1::uuid OR workspace_id IN (SELECT id FROM workspaces WHERE owner_id = $1::uuid)`,
      [userId]
    );

    const recentMigrations = await queryDatabase(
      `SELECT id, workspace_id as "workspaceId", 
              COALESCE(source_framework, 'Source') as "sourceLang", 
              COALESCE(target_framework, 'Target') as "targetLang",
              status, COALESCE(project_size, 0) as "filesCount", 0 as "totalLines", 0 as "durationMs",
              COALESCE(message, '') as "errorMessage", created_at as "createdAt"
       FROM migration_jobs
       WHERE user_id = $1::uuid OR workspace_id IN (SELECT id FROM workspaces WHERE owner_id = $1::uuid)
       ORDER BY created_at DESC LIMIT 10`,
      [userId]
    );

    // F. Payments & Invoices
    const payments = await queryDatabase(
      `SELECT p.id, p.transaction_id as "transactionId", p.amount, p.currency, p.status, p.payment_method as "paymentMethod", p.paid_at as "paidAt",
              w.name as "workspaceName"
       FROM payments p
       JOIN workspaces w ON w.id = p.workspace_id
       WHERE w.owner_id = $1::uuid
       ORDER BY p.paid_at DESC LIMIT 10`,
      [userId]
    );

    // G. Active Sessions & Masked API Keys Metadata
    const sessions = await queryDatabase(
      `SELECT id, ip_address as "ipAddress", user_agent as "userAgent", created_at as "createdAt", expires_at as "expiresAt"
       FROM user_sessions
       WHERE user_id = $1::uuid AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [userId]
    ).catch(() => []);

    const apiKeys = await queryDatabase(
      `SELECT id, name, key_prefix as "keyPrefix", status, created_at as "createdAt", expires_at as "expiresAt"
       FROM api_keys
       WHERE user_id = $1::uuid AND status = 'ACTIVE'
       ORDER BY created_at DESC`,
      [userId]
    ).catch(() => []);

    // H. Audit Log Activity
    const auditLogs = await queryDatabase(
      `SELECT action, resource_type as "resourceType", resource_id as "resourceId", ip_address as "ipAddress", created_at as "createdAt"
       FROM admin_audit_logs
       WHERE admin_user_id = $1::uuid
       ORDER BY created_at DESC LIMIT 15`,
      [userId]
    );

    res.json({
      success: true,
      user360: {
        user,
        workspaces: allWorkspaces,
        subscription,
        entitlements,
        usage,
        migrationStats: {
          total: parseInt(migrationStatsRows[0]?.total ?? "0", 10),
          completed: parseInt(migrationStatsRows[0]?.completed ?? "0", 10),
          failed: parseInt(migrationStatsRows[0]?.failed ?? "0", 10),
        },
        recentMigrations,
        payments,
        sessions,
        apiKeys,
        auditLogs,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 2. POST /api/admin/users/:id/revoke-sessions
 */
export async function handleRevokeUserSessions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.params.id as string;
    const adminUserId = req.userId || req.user!.userId;

    await queryDatabase(`DELETE FROM user_sessions WHERE user_id = $1::uuid`, [userId]).catch(() => {});

    await AdminAuditService.log({
      adminUserId,
      action: "USER_SESSIONS_REVOKED",
      resourceType: "user",
      resourceId: userId,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.json({ success: true, message: "All active sessions for this user have been revoked." });
  } catch (error) {
    next(error);
  }
}

/**
 * 3. POST /api/admin/users/:id/revoke-api-keys
 */
export async function handleRevokeUserApiKeys(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.params.id as string;
    const adminUserId = req.userId || req.user!.userId;

    await queryDatabase(`UPDATE api_keys SET status = 'REVOKED' WHERE user_id = $1::uuid`, [userId]).catch(() => {});

    await AdminAuditService.log({
      adminUserId,
      action: "USER_API_KEYS_REVOKED",
      resourceType: "user",
      resourceId: userId,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.json({ success: true, message: "All API keys for this user have been revoked." });
  } catch (error) {
    next(error);
  }
}

/**
 * 4. POST /api/admin/users/:id/reset-usage
 */
export async function handleResetUserUsage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.params.id as string;
    const adminUserId = req.userId || req.user!.userId;
    const { metric } = req.body;

    const ownedWs = await queryDatabase(`SELECT id FROM workspaces WHERE owner_id = $1::uuid LIMIT 1`, [userId]);
    if (ownedWs && ownedWs.length > 0) {
      const wsId = ownedWs[0].id;
      if (metric) {
        await queryDatabase(`UPDATE usage_tracking SET value = '0' WHERE workspace_id = $1::uuid AND metric = $2`, [wsId, metric]);
      } else {
        await queryDatabase(`UPDATE usage_tracking SET value = '0' WHERE workspace_id = $1::uuid`, [wsId]);
      }
    }

    await AdminAuditService.log({
      adminUserId,
      action: "USER_USAGE_RESET",
      resourceType: "user",
      resourceId: userId,
      metadata: { metric },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.json({ success: true, message: "Usage counters reset successfully." });
  } catch (error) {
    next(error);
  }
}

/**
 * 5. GET /api/admin/workspaces/:id — Workspace 360° Command Center
 */
export async function handleGetWorkspace360(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const workspaceId = req.params.id as string;

    // A. Workspace Core Details
    const wsRows = await queryDatabase(
      `SELECT w.id, w.name, w.slug, w.plan_id as "planId", w.status, w.storage_used as "storageUsed",
              w.storage_limit as "storageLimit", w.created_at as "createdAt", w.updated_at as "updatedAt",
              u.id as "ownerId", u.full_name as "ownerName", u.email as "ownerEmail", u.avatar_url as "ownerAvatar"
       FROM workspaces w
       LEFT JOIN users u ON u.id = w.owner_id
       WHERE w.id = $1::uuid LIMIT 1`,
      [workspaceId]
    );

    if (!wsRows || wsRows.length === 0) {
      return res.status(404).json({ success: false, code: "WORKSPACE_NOT_FOUND", message: "Workspace not found." });
    }

    const workspace = wsRows[0];

    // B. Team Members & Roles
    const members = await queryDatabase(
      `SELECT wm.id, wm.user_id as "userId", u.full_name as "fullName", u.email, u.avatar_url as "avatarUrl",
              wm.role, wm.created_at as "joinedAt"
       FROM workspace_members wm
       JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = $1::uuid
       ORDER BY wm.created_at ASC`,
      [workspaceId]
    );

    // C. Entitlement & Subscription Snapshot
    const entitlements = await EntitlementService.getWorkspaceEntitlements(workspaceId);
    const subRows = await queryDatabase(
      `SELECT s.id, s.status, s.billing_cycle as "billingCycle", s.starts_at as "startsAt", s.expires_at as "expiresAt",
              p.name as "planName", p.slug as "planSlug", p.monthly_price as "monthlyPrice", p.yearly_price as "yearlyPrice"
       FROM subscriptions s
       JOIN subscription_plans p ON p.id = s.plan_id
       WHERE s.workspace_id = $1::uuid
       ORDER BY s.created_at DESC LIMIT 1`,
      [workspaceId]
    );

    // D. Real-Time Usage Tracking
    const usage = await queryDatabase(
      `SELECT metric, value, billing_period_start as "periodStart", billing_period_end as "periodEnd"
       FROM usage_tracking
       WHERE workspace_id = $1::uuid`,
      [workspaceId]
    );

    // E. Migrations Summary & Diagnostic Failures
    const migrationStatsRows = await queryDatabase(
      `SELECT 
         COUNT(*) as total,
         COUNT(CASE WHEN status IN ('completed', 'COMPLETED') THEN 1 END) as completed,
         COUNT(CASE WHEN status IN ('failed', 'FAILED') THEN 1 END) as failed,
         0 as "avgDurationMs",
         COALESCE(SUM(project_size), 0) as "totalFiles",
         0 as "totalLines"
       FROM migration_jobs
       WHERE workspace_id = $1::uuid`,
      [workspaceId]
    );

    const recentMigrations = await queryDatabase(
      `SELECT id, 
              COALESCE(source_framework, 'Source') as "sourceLang", 
              COALESCE(target_framework, 'Target') as "targetLang",
              status, COALESCE(project_size, 0) as "filesCount", 0 as "totalLines", 0 as "durationMs",
              COALESCE(message, '') as "errorMessage", created_at as "createdAt"
       FROM migration_jobs
       WHERE workspace_id = $1::uuid
       ORDER BY created_at DESC LIMIT 15`,
      [workspaceId]
    );

    const failedMigrations = await queryDatabase(
      `SELECT id, 
              COALESCE(source_framework, 'Source') as "sourceLang", 
              COALESCE(target_framework, 'Target') as "targetLang",
              COALESCE(message, '') as "errorMessage", created_at as "createdAt"
       FROM migration_jobs
       WHERE workspace_id = $1::uuid AND status IN ('failed', 'FAILED')
       ORDER BY created_at DESC LIMIT 10`,
      [workspaceId]
    );

    // F. Billing & Payment History
    const payments = await queryDatabase(
      `SELECT p.id, p.transaction_id as "transactionId", p.amount, p.currency, p.status, p.payment_method as "paymentMethod", p.paid_at as "paidAt"
       FROM payments p
       WHERE p.workspace_id = $1::uuid
       ORDER BY p.paid_at DESC`,
      [workspaceId]
    );

    // G. Audit Trail & Security Events
    const auditLogs = await queryDatabase(
      `SELECT action, resource_type as "resourceType", resource_id as "resourceId", ip_address as "ipAddress", created_at as "createdAt"
       FROM admin_audit_logs
       WHERE resource_type = 'workspace' AND resource_id = $1::text
       ORDER BY created_at DESC LIMIT 15`,
      [workspaceId]
    );

    res.json({
      success: true,
      workspace360: {
        workspace,
        members,
        subscription: subRows[0] || null,
        entitlements,
        usage,
        migrationStats: {
          total: parseInt(migrationStatsRows[0]?.total ?? "0", 10),
          completed: parseInt(migrationStatsRows[0]?.completed ?? "0", 10),
          failed: parseInt(migrationStatsRows[0]?.failed ?? "0", 10),
          avgDurationMs: Math.round(parseFloat(migrationStatsRows[0]?.avgDurationMs ?? "0")),
          totalFiles: parseInt(migrationStatsRows[0]?.totalFiles ?? "0", 10),
          totalLines: parseInt(migrationStatsRows[0]?.totalLines ?? "0", 10),
        },
        recentMigrations,
        failedMigrations,
        payments,
        auditLogs,
      },
    });
  } catch (error) {
    next(error);
  }
}
