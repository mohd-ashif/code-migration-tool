import { Response, NextFunction } from "express";
import { queryDatabase, dbPool } from "../lib/database";
import { AuthenticatedRequest } from "../types/auth.types";
import { AdminAuditService } from "../services/AdminAuditService";
import { FeatureFlagService } from "../services/FeatureFlagService";
import { cancelJob, retryJob } from "../services/job.service";
import { migrationQueue } from "../queues/migration.queue";
import { redisClient } from "../lib/redis";
import { logger } from "../utils/logger";

/**
 * 1. Admin Dashboard Overview
 */
export async function handleGetAdminDashboard(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const [
      usersCount,
      activeUsersCount,
      workspacesCount,
      subscriptionsCount,
      jobsCount,
      completedJobsCount,
      failedJobsCount,
      revenueRow,
      failedPaymentsCount,
      recentMigrations,
      recentPayments,
      recentSignups
    ] = await Promise.all([
      queryDatabase(`SELECT COUNT(*) FROM users WHERE deleted_at IS NULL`),
      queryDatabase(`SELECT COUNT(*) FROM users WHERE status = 'ACTIVE' AND deleted_at IS NULL`),
      queryDatabase(`SELECT COUNT(*) FROM workspaces WHERE deleted_at IS NULL`),
      queryDatabase(`SELECT COUNT(*) FROM subscriptions WHERE status = 'active'`),
      queryDatabase(`SELECT COUNT(*) FROM migration_jobs WHERE deleted_at IS NULL`),
      queryDatabase(`SELECT COUNT(*) FROM migration_jobs WHERE status IN ('COMPLETED', 'completed') AND deleted_at IS NULL`),
      queryDatabase(`SELECT COUNT(*) FROM migration_jobs WHERE status IN ('FAILED', 'failed') AND deleted_at IS NULL`),
      queryDatabase(`SELECT SUM(amount) as revenue FROM payments WHERE status = 'captured'`),
      queryDatabase(`SELECT COUNT(*) FROM payments WHERE status = 'failed'`),
      queryDatabase(`SELECT id, project_name as "projectName", status, source_framework as "sourceFramework", target_framework as "targetFramework", created_at as "createdAt" FROM migration_jobs WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 5`),
      queryDatabase(`SELECT p.id, p.amount, p.currency, p.status, u.email as "userEmail", p.created_at as "createdAt" FROM payments p JOIN workspaces w ON w.id = p.workspace_id JOIN users u ON u.id = w.owner_id ORDER BY p.created_at DESC LIMIT 5`),
      queryDatabase(`SELECT id, email, full_name as "fullName", created_at as "createdAt" FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 5`)
    ]);

    // Fetch BullMQ Queue Health
    let queueWaiting = 0;
    let queueActive = 0;
    let queueFailed = 0;
    if (migrationQueue) {
      try {
        const counts = await migrationQueue.getJobCounts("waiting", "active", "failed");
        queueWaiting = counts.waiting || 0;
        queueActive = counts.active || 0;
        queueFailed = counts.failed || 0;
      } catch {
        // Ignore redis disconnect during query
      }
    }

    res.json({
      success: true,
      data: {
        stats: {
          totalUsers: parseInt(usersCount[0]?.count ?? "0", 10),
          activeUsers: parseInt(activeUsersCount[0]?.count ?? "0", 10),
          totalWorkspaces: parseInt(workspacesCount[0]?.count ?? "0", 10),
          activeSubscriptions: parseInt(subscriptionsCount[0]?.count ?? "0", 10),
          totalJobs: parseInt(jobsCount[0]?.count ?? "0", 10),
          completedJobs: parseInt(completedJobsCount[0]?.count ?? "0", 10),
          failedJobs: parseInt(failedJobsCount[0]?.count ?? "0", 10),
          totalRevenue: parseFloat(revenueRow[0]?.revenue ?? "0"),
          failedPayments: parseInt(failedPaymentsCount[0]?.count ?? "0", 10),
          queueHealth: {
            waiting: queueWaiting,
            active: queueActive,
            failed: queueFailed,
          }
        },
        recent: {
          migrations: recentMigrations,
          payments: recentPayments,
          signups: recentSignups,
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 2. Admin Users Management
 */
export async function handleListUsers(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { search, status, systemRole, limit, offset } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (search) {
      conditions.push(`(u.email ILIKE $${pIdx} OR u.full_name ILIKE $${pIdx})`);
      params.push(`%${search}%`);
      pIdx++;
    }
    if (status) {
      conditions.push(`u.status = $${pIdx++}`);
      params.push(status);
    }
    if (systemRole) {
      conditions.push(`u.system_role = $${pIdx++}`);
      params.push(systemRole);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countQuery = `SELECT COUNT(*) as total FROM users u ${whereClause}`;
    const countRows = await queryDatabase(countQuery, params);
    const total = parseInt(countRows[0]?.total ?? "0", 10);

    const l = limit ? parseInt(limit as string, 10) : 20;
    const o = offset ? parseInt(offset as string, 10) : 0;
    params.push(l, o);

    const query = `
      SELECT 
        u.id, u.email, u.full_name as "fullName", u.status, u.system_role as "systemRole",
        u.is_email_verified as "isEmailVerified", u.created_at as "createdAt",
        (SELECT COUNT(*) FROM workspace_members wm WHERE wm.user_id = u.id) as "workspaceCount",
        (SELECT COUNT(*) FROM migration_jobs mj WHERE mj.user_id = u.id) as "jobCount"
      FROM users u
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT $${pIdx++} OFFSET $${pIdx++}
    `;

    const users = await queryDatabase(query, params);
    res.json({ success: true, users, total });
  } catch (error) {
    next(error);
  }
}

export async function handleSuspendUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const targetUserId = req.params.id as string;
    const adminUserId = req.userId || req.user!.userId;
    const { reason } = req.body;

    // Check if target is a SUPER_ADMIN and prevent suspending the last SUPER_ADMIN
    const targetUser = await queryDatabase(`SELECT system_role FROM users WHERE id = $1::uuid`, [targetUserId]);
    if (targetUser.length > 0 && targetUser[0].system_role === "SUPER_ADMIN") {
      const superAdmins = await queryDatabase(`SELECT COUNT(*) FROM users WHERE system_role = 'SUPER_ADMIN' AND status = 'ACTIVE'`);
      if (parseInt(superAdmins[0]?.count ?? "0", 10) <= 1) {
        return res.status(400).json({ success: false, code: "SUPER_ADMIN_PROTECTED", message: "Cannot suspend the final active Super Admin account." });
      }
    }

    await queryDatabase(`UPDATE users SET status = 'SUSPENDED', updated_at = NOW() WHERE id = $1::uuid`, [targetUserId]);

    await AdminAuditService.log({
      adminUserId,
      action: "USER_SUSPENDED",
      resourceType: "user",
      resourceId: targetUserId,
      metadata: { reason: reason || "Suspended by admin" },
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });

    res.json({ success: true, message: "User suspended successfully." });
  } catch (error) {
    next(error);
  }
}

export async function handleReactivateUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const targetUserId = req.params.id as string;
    const adminUserId = req.userId || req.user!.userId;

    await queryDatabase(`UPDATE users SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1::uuid`, [targetUserId]);

    await AdminAuditService.log({
      adminUserId,
      action: "USER_REACTIVATED",
      resourceType: "user",
      resourceId: targetUserId,
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });

    res.json({ success: true, message: "User reactivated successfully." });
  } catch (error) {
    next(error);
  }
}

/**
 * 3. Admin Workspaces Management
 */
export async function handleListWorkspaces(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { search, status, limit, offset } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (search) {
      conditions.push(`(w.name ILIKE $${pIdx} OR w.id::text ILIKE $${pIdx})`);
      params.push(`%${search}%`);
      pIdx++;
    }
    if (status) {
      conditions.push(`w.status = $${pIdx++}`);
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countQuery = `SELECT COUNT(*) as total FROM workspaces w ${whereClause}`;
    const countRows = await queryDatabase(countQuery, params);
    const total = parseInt(countRows[0]?.total ?? "0", 10);

    const l = limit ? parseInt(limit as string, 10) : 20;
    const o = offset ? parseInt(offset as string, 10) : 0;
    params.push(l, o);

    const query = `
      SELECT 
        w.id, w.name, w.slug, w.status, w.owner_id as "ownerId", u.email as "ownerEmail",
        w.created_at as "createdAt",
        (SELECT COUNT(*) FROM workspace_members wm WHERE wm.workspace_id = w.id) as "memberCount",
        (SELECT COUNT(*) FROM migration_jobs mj WHERE mj.workspace_id = w.id) as "jobCount"
      FROM workspaces w
      LEFT JOIN users u ON u.id = w.owner_id
      ${whereClause}
      ORDER BY w.created_at DESC
      LIMIT $${pIdx++} OFFSET $${pIdx++}
    `;

    const workspaces = await queryDatabase(query, params);
    res.json({ success: true, workspaces, total });
  } catch (error) {
    next(error);
  }
}

export async function handleSuspendWorkspace(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const workspaceId = req.params.id as string;
    const adminUserId = req.userId || req.user!.userId;
    const { reason } = req.body;

    await queryDatabase(
      `UPDATE workspaces SET status = 'SUSPENDED', suspended_at = NOW(), suspended_reason = $1, updated_at = NOW() WHERE id = $2::uuid`,
      [reason || "Suspended by platform admin", workspaceId]
    );

    await AdminAuditService.log({
      adminUserId,
      action: "WORKSPACE_SUSPENDED",
      resourceType: "workspace",
      resourceId: workspaceId,
      workspaceId,
      metadata: { reason },
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });

    res.json({ success: true, message: "Workspace suspended successfully." });
  } catch (error) {
    next(error);
  }
}

export async function handleReactivateWorkspace(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const workspaceId = req.params.id as string;
    const adminUserId = req.userId || req.user!.userId;

    await queryDatabase(
      `UPDATE workspaces SET status = 'ACTIVE', suspended_at = NULL, suspended_reason = NULL, updated_at = NOW() WHERE id = $1::uuid`,
      [workspaceId]
    );

    await AdminAuditService.log({
      adminUserId,
      action: "WORKSPACE_REACTIVATED",
      resourceType: "workspace",
      resourceId: workspaceId,
      workspaceId,
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });

    res.json({ success: true, message: "Workspace reactivated successfully." });
  } catch (error) {
    next(error);
  }
}

/**
 * 4. Subscriptions & Payments Management
 */
export async function handleListSubscriptions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { status, limit, offset } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (status) {
      conditions.push(`s.status = $${pIdx++}`);
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countQuery = `SELECT COUNT(*) as total FROM subscriptions s ${whereClause}`;
    const countRows = await queryDatabase(countQuery, params);
    const total = parseInt(countRows[0]?.total ?? "0", 10);

    const l = limit ? parseInt(limit as string, 10) : 20;
    const o = offset ? parseInt(offset as string, 10) : 0;
    params.push(l, o);

    const query = `
      SELECT 
        s.id, s.workspace_id as "workspaceId", w.name as "workspaceName",
        s.plan_id as "planId", s.status, s.starts_at as "currentPeriodStart",
        s.expires_at as "currentPeriodEnd", s.cancel_at as "cancelAtPeriodEnd",
        s.created_at as "createdAt"
      FROM subscriptions s
      LEFT JOIN workspaces w ON w.id = s.workspace_id
      ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT $${pIdx++} OFFSET $${pIdx++}
    `;

    const subscriptions = await queryDatabase(query, params);
    res.json({ success: true, subscriptions, total });
  } catch (error) {
    next(error);
  }
}

export async function handleListPayments(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { status, limit, offset } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (status) {
      conditions.push(`p.status = $${pIdx++}`);
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countQuery = `SELECT COUNT(*) as total FROM payments p ${whereClause}`;
    const countRows = await queryDatabase(countQuery, params);
    const total = parseInt(countRows[0]?.total ?? "0", 10);

    const l = limit ? parseInt(limit as string, 10) : 20;
    const o = offset ? parseInt(offset as string, 10) : 0;
    params.push(l, o);

    const query = `
      SELECT 
        p.id, w.owner_id as "userId", u.email as "userEmail", p.workspace_id as "workspaceId",
        p.amount, p.currency, p.gateway as "gatewayProvider", p.status,
        p.transaction_id as "paymentId", p.order_id as "orderId", p.created_at as "createdAt"
      FROM payments p
      LEFT JOIN workspaces w ON w.id = p.workspace_id
      LEFT JOIN users u ON u.id = w.owner_id
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT $${pIdx++} OFFSET $${pIdx++}
    `;

    const payments = await queryDatabase(query, params);
    res.json({ success: true, payments, total });
  } catch (error) {
    next(error);
  }
}

export async function handleRefundPayment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const paymentId = req.params.id as string;
    const adminUserId = req.userId || req.user!.userId;
    const { reason } = req.body;

    const paymentRows = await queryDatabase(`SELECT * FROM payments WHERE id = $1::uuid LIMIT 1`, [paymentId]);
    if (!paymentRows || paymentRows.length === 0) {
      return res.status(404).json({ success: false, code: "PAYMENT_NOT_FOUND", message: "Payment transaction record not found." });
    }

    const payment = paymentRows[0];
    if (payment.status === "refunded") {
      return res.status(400).json({ success: false, code: "ALREADY_REFUNDED", message: "Payment has already been refunded." });
    }

    // Process payment refund via payment gateway service
    const { paymentService } = require("../services/payment.service");
    await paymentService.refundPayment(payment.id, payment.amount, reason);

    await queryDatabase(`UPDATE payments SET status = 'refunded', updated_at = NOW() WHERE id = $1::uuid`, [paymentId]);

    await AdminAuditService.log({
      adminUserId,
      action: "PAYMENT_REFUND_REQUESTED",
      resourceType: "payment",
      resourceId: paymentId,
      workspaceId: payment.workspace_id,
      metadata: { amount: payment.amount, currency: payment.currency, reason },
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });

    res.json({ success: true, message: "Payment refunded successfully." });
  } catch (error: any) {
    next(error);
  }
}

/**
 * 5. Admin Migration Jobs & Infrastructure Controls
 */
export async function handleListAdminJobs(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { search, status, limit, offset } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (search) {
      conditions.push(`(j.id::text ILIKE $${pIdx} OR j.project_name ILIKE $${pIdx})`);
      params.push(`%${search}%`);
      pIdx++;
    }
    if (status) {
      conditions.push(`j.status = $${pIdx++}`);
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countQuery = `SELECT COUNT(*) as total FROM migration_jobs j ${whereClause}`;
    const countRows = await queryDatabase(countQuery, params);
    const total = parseInt(countRows[0]?.total ?? "0", 10);

    const l = limit ? parseInt(limit as string, 10) : 20;
    const o = offset ? parseInt(offset as string, 10) : 0;
    params.push(l, o);

    const query = `
      SELECT 
        j.id, j.user_id as "userId", u.email as "userEmail", j.workspace_id as "workspaceId",
        w.name as "workspaceName", j.project_name as "projectName", j.status, j.current_stage as "currentStage",
        j.progress, j.source_framework as "sourceFramework", j.target_framework as "targetFramework",
        j.attempt_count as "attemptCount", j.worker_id as "workerId", j.created_at as "createdAt"
      FROM migration_jobs j
      LEFT JOIN users u ON u.id = j.user_id
      LEFT JOIN workspaces w ON w.id = j.workspace_id
      ${whereClause}
      ORDER BY j.created_at DESC
      LIMIT $${pIdx++} OFFSET $${pIdx++}
    `;

    const jobs = await queryDatabase(query, params);
    res.json({ success: true, jobs, total });
  } catch (error) {
    next(error);
  }
}

export async function handleRetryAdminJob(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const jobId = req.params.id as string;
    const adminUserId = req.userId || req.user!.userId;

    const newJob = await retryJob(jobId);
    if (!newJob) {
      return res.status(400).json({ success: false, code: "JOB_NOT_RETRIABLE", message: "Job is not eligible for retry." });
    }

    await AdminAuditService.log({
      adminUserId,
      action: "JOB_RETRIED",
      resourceType: "migration_job",
      resourceId: jobId,
      metadata: { newJobId: newJob.id },
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });

    res.json({ success: true, jobId: newJob.id, message: "Migration job retry queued by admin." });
  } catch (error) {
    next(error);
  }
}

export async function handleCancelAdminJob(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const jobId = req.params.id as string;
    const adminUserId = req.userId || req.user!.userId;

    const cancelled = await cancelJob(jobId);
    if (!cancelled) {
      return res.status(400).json({ success: false, code: "JOB_NOT_CANCELLABLE", message: "Job is not eligible for cancellation." });
    }

    await AdminAuditService.log({
      adminUserId,
      action: "JOB_CANCELLED",
      resourceType: "migration_job",
      resourceId: jobId,
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });

    res.json({ success: true, message: "Migration job cancelled by admin." });
  } catch (error) {
    next(error);
  }
}

/**
 * 6. Compiler Health & Infrastructure Monitoring
 */
export async function handleGetCompilerHealth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    let redisConnected = false;
    if (redisClient) {
      try {
        redisConnected = (await redisClient.ping()) === "PONG";
      } catch {
        redisConnected = false;
      }
    }

    let postgresConnected = false;
    if (dbPool) {
      try {
        const ping = await queryDatabase(`SELECT 1`);
        postgresConnected = ping.length > 0;
      } catch {
        postgresConnected = false;
      }
    }

    let queueWaiting = 0;
    let queueActive = 0;
    let queueFailed = 0;
    let queueCompleted = 0;

    if (migrationQueue) {
      try {
        const counts = await migrationQueue.getJobCounts("waiting", "active", "failed", "completed");
        queueWaiting = counts.waiting || 0;
        queueActive = counts.active || 0;
        queueFailed = counts.failed || 0;
        queueCompleted = counts.completed || 0;
      } catch {
        // Ignore
      }
    }

    const engines = await queryDatabase(
      `SELECT me.id, f.name as "frameworkName", me.status, me.migrations_run as "migrationsRun", me.avg_duration_ms as "avgDurationMs"
       FROM migration_engines me
       JOIN frameworks f ON f.id = me.framework_id`
    );

    const overallStatus = redisConnected && postgresConnected ? "Healthy" : "Degraded";

    res.json({
      success: true,
      data: {
        status: overallStatus,
        services: {
          api: "Healthy",
          postgres: postgresConnected ? "Healthy" : "Unavailable",
          redis: redisConnected ? "Healthy" : "Unavailable",
          bullmq: migrationQueue ? "Healthy" : "Disabled",
        },
        queue: {
          waiting: queueWaiting,
          active: queueActive,
          failed: queueFailed,
          completed: queueCompleted,
        },
        engines: engines.map((e: any) => ({
          id: e.id,
          name: e.frameworkName,
          status: e.status === "active" ? "Healthy" : e.status === "maintenance" ? "Degraded" : "Unavailable",
          migrationsRun: parseInt(e.migrationsRun ?? "0", 10),
          avgDurationMs: parseInt(e.avgDurationMs ?? "0", 10),
        }))
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 7. Admin Reports & Logs
 */
export async function handleListAdminReports(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { limit, offset } = req.query;
    const l = limit ? parseInt(limit as string, 10) : 20;
    const o = offset ? parseInt(offset as string, 10) : 0;

    const countRows = await queryDatabase(`SELECT COUNT(*) as total FROM migration_reports`);
    const total = parseInt(countRows[0]?.total ?? "0", 10);

    const reports = await queryDatabase(
      `SELECT r.id, r.job_id as "jobId", r.quality_score as "qualityScore", r.summary,
              r.created_at as "createdAt", u.email as "userEmail", w.name as "workspaceName"
       FROM migration_reports r
       LEFT JOIN users u ON u.id = r.user_id
       LEFT JOIN workspaces w ON w.id = r.workspace_id
       ORDER BY r.created_at DESC
       LIMIT $1 OFFSET $2`,
      [l, o]
    );

    res.json({ success: true, reports, total });
  } catch (error) {
    next(error);
  }
}

export async function handleListAdminLogs(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { level, limit, offset } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (level) {
      conditions.push(`level = $${pIdx++}`);
      params.push(level);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countRows = await queryDatabase(`SELECT COUNT(*) as total FROM migration_logs ${whereClause}`, params);
    const total = parseInt(countRows[0]?.total ?? "0", 10);

    const l = limit ? parseInt(limit as string, 10) : 50;
    const o = offset ? parseInt(offset as string, 10) : 0;
    params.push(l, o);

    const logs = await queryDatabase(
      `SELECT id, level, message, created_at as "createdAt"
       FROM migration_logs
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${pIdx++} OFFSET $${pIdx++}`,
      params
    );

    res.json({ success: true, logs, total });
  } catch (error) {
    next(error);
  }
}

/**
 * 8. Server-Side Platform Analytics
 */
export async function handleGetAdminAnalytics(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const days = parseInt((req.query.days as string) || "30", 10);

    const [userGrowth, migrationVolume, frameworkUsage] = await Promise.all([
      queryDatabase(
        `SELECT DATE(created_at) as date, COUNT(*) as count 
         FROM users 
         WHERE created_at >= NOW() - INTERVAL '1 day' * $1 
         GROUP BY DATE(created_at) ORDER BY date ASC`,
        [days]
      ),
      queryDatabase(
        `SELECT DATE(created_at) as date, COUNT(*) as total, 
                SUM(CASE WHEN status IN ('COMPLETED', 'completed') THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status IN ('FAILED', 'failed') THEN 1 ELSE 0 END) as failed
         FROM migration_jobs
         WHERE created_at >= NOW() - INTERVAL '1 day' * $1
         GROUP BY DATE(created_at) ORDER BY date ASC`,
        [days]
      ),
      queryDatabase(
        `SELECT target_framework as "framework", COUNT(*) as count
         FROM migration_jobs
         WHERE created_at >= NOW() - INTERVAL '1 day' * $1
         GROUP BY target_framework ORDER BY count DESC`,
        [days]
      )
    ]);

    res.json({
      success: true,
      analytics: {
        days,
        userGrowth,
        migrationVolume,
        frameworkUsage,
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 9. Feature Flags Management
 */
export async function handleListFeatureFlags(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const flags = await FeatureFlagService.listFlags();
    res.json({ success: true, flags });
  } catch (error) {
    next(error);
  }
}

export async function handleSaveFeatureFlag(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const adminUserId = req.userId || req.user!.userId;
    const { key, description, enabled, rolloutPercentage, rules } = req.body;

    if (!key) {
      return res.status(400).json({ success: false, message: "Feature flag key is required." });
    }

    const flag = await FeatureFlagService.saveFlag({
      key,
      description,
      enabled: Boolean(enabled),
      rolloutPercentage: rolloutPercentage !== undefined ? parseInt(rolloutPercentage, 10) : 100,
      rules,
    });

    await AdminAuditService.log({
      adminUserId,
      action: "FEATURE_FLAG_CHANGED",
      resourceType: "feature_flag",
      resourceId: key,
      metadata: { enabled, rolloutPercentage, rules },
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });

    res.json({ success: true, flag, message: "Feature flag saved successfully." });
  } catch (error) {
    next(error);
  }
}

/**
 * 10. Audit Logs Viewer
 */
export async function handleGetAdminAuditLogs(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { adminUserId, action, resourceType, limit, offset } = req.query;
    const result = await AdminAuditService.getLogs({
      adminUserId: adminUserId as string,
      action: action as string,
      resourceType: resourceType as string,
      limit: limit ? parseInt(limit as string, 10) : 20,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });

    res.json({ success: true, logs: result.logs, total: result.total });
  } catch (error) {
    next(error);
  }
}
