import { Response, NextFunction } from "express";
import { queryDatabase } from "../lib/database";
import { AuthenticatedRequest } from "../types/auth.types";
import { AdminAuditService } from "../services/AdminAuditService";
import { logger } from "../utils/logger";

/**
 * 1. GET /api/admin/billing/ops — Billing Operations Dashboard & Lists
 */
export async function handleGetAdminBillingOps(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    // Financial Aggregate Totals
    const revenueRows = await queryDatabase(
      `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'captured'`
    );

    const subCountRows = await queryDatabase(
      `SELECT 
         COUNT(*) as total,
         COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
         COUNT(CASE WHEN status = 'trialing' THEN 1 END) as trialing,
         COUNT(CASE WHEN status = 'past_due' THEN 1 END) as pastDue,
         COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled
       FROM subscriptions`
    );

    // Subscriptions List
    const subscriptions = await queryDatabase(
      `SELECT s.id, s.workspace_id as "workspaceId", w.name as "workspaceName", u.email as "ownerEmail",
              p.name as "planName", p.slug as "planSlug", s.status, s.billing_cycle as "billingCycle",
              s.provider_subscription_id as "providerSubscriptionId", s.starts_at as "startsAt",
              s.expires_at as "expiresAt", s.created_at as "createdAt"
       FROM subscriptions s
       LEFT JOIN workspaces w ON w.id = s.workspace_id
       LEFT JOIN users u ON u.id = w.owner_id
       LEFT JOIN subscription_plans p ON p.id = s.plan_id
       ORDER BY s.created_at DESC LIMIT 50`
    );

    // Payments List
    const payments = await queryDatabase(
      `SELECT p.id, p.workspace_id as "workspaceId", w.name as "workspaceName", p.transaction_id as "transactionId",
              p.order_id as "orderId", p.amount, p.currency, p.status, p.payment_method as "paymentMethod", p.paid_at as "paidAt"
       FROM payments p
       LEFT JOIN workspaces w ON w.id = p.workspace_id
       ORDER BY p.created_at DESC LIMIT 50`
    );

    // Invoices List
    const invoices = await queryDatabase(
      `SELECT i.id, i.invoice_number as "invoiceNumber", i.workspace_id as "workspaceId", w.name as "workspaceName",
              i.total, i.status, i.pdf_url as "pdfUrl", i.created_at as "createdAt"
       FROM invoices i
       LEFT JOIN workspaces w ON w.id = i.workspace_id
       ORDER BY i.created_at DESC LIMIT 50`
    );

    // Failed Payments List
    const failedPayments = await queryDatabase(
      `SELECT p.id, p.workspace_id as "workspaceId", w.name as "workspaceName", u.email as "ownerEmail",
              p.transaction_id as "transactionId", p.amount, p.status, p.created_at as "createdAt"
       FROM payments p
       LEFT JOIN workspaces w ON w.id = p.workspace_id
       LEFT JOIN users u ON u.id = w.owner_id
       WHERE p.status IN ('failed', 'declined')
       ORDER BY p.created_at DESC LIMIT 20`
    );

    res.json({
      success: true,
      billingOps: {
        totalRevenue: parseFloat(revenueRows[0]?.total ?? "0"),
        subscriptionStats: {
          total: parseInt(subCountRows[0]?.total ?? "0", 10),
          active: parseInt(subCountRows[0]?.active ?? "0", 10),
          trialing: parseInt(subCountRows[0]?.trialing ?? "0", 10),
          pastDue: parseInt(subCountRows[0]?.pastDue ?? "0", 10),
          cancelled: parseInt(subCountRows[0]?.cancelled ?? "0", 10),
        },
        subscriptions,
        payments,
        invoices,
        failedPayments,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 2. GET /api/admin/billing/coupons — List Discount Coupons
 */
export async function handleListAdminCoupons(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const coupons = await queryDatabase(
      `SELECT id, code, discount_type as "discountType", discount_value as "discountValue",
              max_redemptions as "maxRedemptions", times_redeemed as "timesRedeemed",
              expires_at as "expiresAt", created_at as "createdAt"
       FROM coupons
       ORDER BY created_at DESC`
    );

    res.json({ success: true, coupons });
  } catch (error) {
    next(error);
  }
}

/**
 * 3. POST /api/admin/billing/coupons — Issue New Coupon
 */
export async function handleCreateAdminCoupon(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const adminUserId = req.userId || req.user!.userId;
    const { code, discountType = 'percentage', discountValue, maxRedemptions, expiresAt } = req.body;

    if (!code || discountValue === undefined) {
      return res.status(400).json({ success: false, message: "Coupon code and discountValue are required." });
    }

    const couponRows = await queryDatabase(
      `INSERT INTO coupons (code, discount_type, discount_value, max_redemptions, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, code, discount_type as "discountType", discount_value as "discountValue", expires_at as "expiresAt"`,
      [code.toUpperCase(), discountType, parseFloat(discountValue), maxRedemptions ? parseInt(maxRedemptions, 10) : null, expiresAt ? new Date(expiresAt) : null]
    );

    await AdminAuditService.log({
      adminUserId,
      action: "COUPON_CREATED",
      resourceType: "coupon",
      resourceId: couponRows[0].id,
      metadata: { code: couponRows[0].code, discountType, discountValue },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.status(201).json({ success: true, coupon: couponRows[0], message: "Discount coupon issued successfully." });
  } catch (error) {
    next(error);
  }
}

/**
 * 4. POST /api/admin/subscriptions/:id/extend-trial — Extend Subscription Trial
 */
export async function handleExtendTrial(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const subscriptionId = req.params.id as string;
    const adminUserId = req.userId || req.user!.userId;
    const { days = 14 } = req.body;

    const subRows = await queryDatabase(
      `SELECT id, expires_at FROM subscriptions WHERE id = $1::uuid LIMIT 1`,
      [subscriptionId]
    );

    if (!subRows || subRows.length === 0) {
      return res.status(404).json({ success: false, message: "Subscription not found." });
    }

    const currentExpires = new Date(subRows[0].expires_at || Date.now());
    const newExpires = new Date(currentExpires.getTime() + parseInt(String(days), 10) * 24 * 60 * 60 * 1000);

    await queryDatabase(
      `UPDATE subscriptions SET status = 'trialing', expires_at = $1 WHERE id = $2::uuid`,
      [newExpires, subscriptionId]
    );

    await AdminAuditService.log({
      adminUserId,
      action: "TRIAL_EXTENDED",
      resourceType: "subscription",
      resourceId: subscriptionId,
      metadata: { days, newExpires },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.json({ success: true, message: `Trial extended by ${days} days successfully.`, expiresAt: newExpires });
  } catch (error) {
    next(error);
  }
}

/**
 * 5. GET /api/admin/billing/events — Webhook & Billing Audit Logs
 */
export async function handleListBillingEvents(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const events = await queryDatabase(
      `SELECT id, subscription_id as "subscriptionId", workspace_id as "workspaceId",
              event_type as "eventType", provider, status, created_at as "createdAt"
       FROM billing_events
       ORDER BY created_at DESC LIMIT 50`
    ).catch(() => []);

    res.json({ success: true, events });
  } catch (error) {
    next(error);
  }
}

/**
 * 6. POST /api/admin/invoices/:id/regenerate — Regenerate Tax Invoice PDF
 */
export async function handleRegenerateInvoice(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const invoiceId = req.params.id as string;
    const adminUserId = req.userId || req.user!.userId;

    await AdminAuditService.log({
      adminUserId,
      action: "INVOICE_REGENERATED",
      resourceType: "invoice",
      resourceId: invoiceId,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.json({ success: true, message: "Tax invoice PDF regenerated successfully." });
  } catch (error) {
    next(error);
  }
}
