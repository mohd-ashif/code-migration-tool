import { Router } from "express";
import { jwtAuthMiddleware } from "../middleware/jwt-auth.middleware";
import { requireAdmin, requirePermission } from "../middleware/admin-auth.middleware";
import {
  handleGetAdminDashboard,
  handleListUsers,
  handleSuspendUser,
  handleReactivateUser,
  handleListWorkspaces,
  handleSuspendWorkspace,
  handleReactivateWorkspace,
  handleListSubscriptions,
  handleListPayments,
  handleRefundPayment,
  handleListAdminJobs,
  handleRetryAdminJob,
  handleCancelAdminJob,
  handleGetCompilerHealth,
  handleListAdminReports,
  handleListAdminLogs,
  handleGetAdminAnalytics,
  handleListFeatureFlags,
  handleSaveFeatureFlag,
  handleGetAdminAuditLogs,
} from "../controllers/admin.controller";

const router = Router();

// Secure all admin routes with JWT Auth + Admin Check
router.use(jwtAuthMiddleware as any);
router.use(requireAdmin as any);

// Dashboard Overview
router.get("/dashboard", handleGetAdminDashboard as any);

import {
  handleGetUser360,
  handleRevokeUserSessions,
  handleRevokeUserApiKeys,
  handleResetUserUsage,
  handleGetWorkspace360,
} from "../controllers/admin-360.controller";

// Users Management & 360° Profile
router.get("/users", requirePermission("users.read") as any, handleListUsers as any);
router.get("/users/:id", requirePermission("users.read") as any, handleGetUser360 as any);
router.post("/users/:id/suspend", requirePermission("users.manage") as any, handleSuspendUser as any);
router.post("/users/:id/reactivate", requirePermission("users.manage") as any, handleReactivateUser as any);
router.post("/users/:id/revoke-sessions", requirePermission("users.manage") as any, handleRevokeUserSessions as any);
router.post("/users/:id/revoke-api-keys", requirePermission("users.manage") as any, handleRevokeUserApiKeys as any);
router.post("/users/:id/reset-usage", requirePermission("users.manage") as any, handleResetUserUsage as any);

// Workspaces Management & 360° Command Center
router.get("/workspaces", requirePermission("workspaces.read") as any, handleListWorkspaces as any);
router.get("/workspaces/:id", requirePermission("workspaces.read") as any, handleGetWorkspace360 as any);
router.post("/workspaces/:id/suspend", requirePermission("workspaces.manage") as any, handleSuspendWorkspace as any);
router.post("/workspaces/:id/reactivate", requirePermission("workspaces.manage") as any, handleReactivateWorkspace as any);

import {
  handleGetAdminBillingOps,
  handleListAdminCoupons,
  handleCreateAdminCoupon,
  handleExtendTrial,
  handleListBillingEvents,
  handleRegenerateInvoice,
} from "../controllers/admin-billing-ops.controller";

// Subscriptions, Payments & Billing Operations
router.get("/billing/ops", requirePermission("subscriptions.read") as any, handleGetAdminBillingOps as any);
router.get("/billing/coupons", requirePermission("subscriptions.read") as any, handleListAdminCoupons as any);
router.post("/billing/coupons", requirePermission("subscriptions.manage") as any, handleCreateAdminCoupon as any);
router.get("/billing/events", requirePermission("subscriptions.read") as any, handleListBillingEvents as any);
router.post("/subscriptions/:id/extend-trial", requirePermission("subscriptions.manage") as any, handleExtendTrial as any);
router.post("/invoices/:id/regenerate", requirePermission("payments.refund") as any, handleRegenerateInvoice as any);
router.get("/subscriptions", requirePermission("subscriptions.read") as any, handleListSubscriptions as any);
router.get("/payments", requirePermission("payments.read") as any, handleListPayments as any);
router.post("/payments/:id/refund", requirePermission("payments.refund") as any, handleRefundPayment as any);

// Migration Jobs & Infrastructure
router.get("/jobs", requirePermission("jobs.read") as any, handleListAdminJobs as any);
router.post("/jobs/:id/retry", requirePermission("jobs.manage") as any, handleRetryAdminJob as any);
router.post("/jobs/:id/cancel", requirePermission("jobs.manage") as any, handleCancelAdminJob as any);
router.get("/compiler-health", requirePermission("health.read") as any, handleGetCompilerHealth as any);

import {
  handleGetAdminUsage,
  handleCreateQuotaOverride,
  handleGetAdminAiUsage,
  handleGetAdminMigrationQuality,
  handleGetAdminFailures,
  handleUpdateFailureGroup,
} from "../controllers/admin-analytics-extended.controller";

// Extended Enterprise Control Centers
router.get("/usage", requirePermission("analytics.read") as any, handleGetAdminUsage as any);
router.post("/usage/overrides", requirePermission("workspaces.manage") as any, handleCreateQuotaOverride as any);
router.get("/ai-usage", requirePermission("analytics.read") as any, handleGetAdminAiUsage as any);
router.get("/migration-quality", requirePermission("reports.read") as any, handleGetAdminMigrationQuality as any);
router.get("/failures", requirePermission("jobs.read") as any, handleGetAdminFailures as any);
router.patch("/failures/:id", requirePermission("jobs.manage") as any, handleUpdateFailureGroup as any);

import {
  handleListAdminPlans,
  handleGetAdminPlan,
  handleCreatePlan,
  handleUpdatePlan,
  handlePublishPlan,
  handleUnpublishPlan,
  handleArchivePlan,
  handleDuplicatePlan,
  handleGetPlanSubscribers,
} from "../controllers/admin-plans.controller";

// Subscription Plans Management
router.get("/plans", requirePermission("subscriptions.read") as any, handleListAdminPlans as any);
router.get("/plans/:id", requirePermission("subscriptions.read") as any, handleGetAdminPlan as any);
router.post("/plans", requirePermission("subscriptions.manage") as any, handleCreatePlan as any);
router.patch("/plans/:id", requirePermission("subscriptions.manage") as any, handleUpdatePlan as any);
router.post("/plans/:id/publish", requirePermission("subscriptions.manage") as any, handlePublishPlan as any);
router.post("/plans/:id/unpublish", requirePermission("subscriptions.manage") as any, handleUnpublishPlan as any);
router.post("/plans/:id/archive", requirePermission("subscriptions.manage") as any, handleArchivePlan as any);
router.post("/plans/:id/duplicate", requirePermission("subscriptions.manage") as any, handleDuplicatePlan as any);
router.get("/plans/:id/subscribers", requirePermission("subscriptions.read") as any, handleGetPlanSubscribers as any);

export default router;
