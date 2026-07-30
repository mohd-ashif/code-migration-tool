import { Response, NextFunction } from "express";
import { queryDatabase } from "../lib/database";
import { AuthenticatedRequest } from "../types/auth.types";
import { AdminAuditService } from "../services/AdminAuditService";
import { logger } from "../utils/logger";

/**
 * 1. List All Admin Subscription Plans (Draft, Active, Inactive, Archived)
 */
export async function handleListAdminPlans(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const rawPlans = await queryDatabase(`
      SELECT 
        p.id, p.name, p.slug, p.description, p.monthly_price as "monthlyPrice",
        p.yearly_price as "yearlyPrice", p.currency, COALESCE(p.status, 'ACTIVE') as status,
        COALESCE(p.is_public, true) as "isPublic",
        COALESCE(p.is_recommended, false) as "isRecommended",
        COALESCE(p.display_order, 0) as "displayOrder",
        COALESCE(p.version, 1) as version,
        COALESCE(p.trial_days, 0) as "trialDays",
        p.created_at as "createdAt",
        p.updated_at as "updatedAt",
        p.archived_at as "archivedAt",
        (SELECT COUNT(*) FROM subscriptions s WHERE s.plan_id = p.id AND s.status IN ('active', 'trialing')) as "subscriberCount"
      FROM subscription_plans p
      ORDER BY COALESCE(p.display_order, 0) ASC, p.created_at DESC
    `);

    const plans = rawPlans.map((p: any) => ({
      ...p,
      monthlyPrice: parseFloat(p.monthlyPrice ?? "0"),
      yearlyPrice: parseFloat(p.yearlyPrice ?? "0"),
      subscriberCount: parseInt(p.subscriberCount ?? "0", 10),
      version: parseInt(p.version ?? "1", 10),
      displayOrder: parseInt(p.displayOrder ?? "0", 10),
      trialDays: parseInt(p.trialDays ?? "0", 10),
      status: p.status || 'ACTIVE',
      isPublic: Boolean(p.isPublic),
      isRecommended: Boolean(p.isRecommended),
    }));

    res.json({ success: true, plans });
  } catch (error) {
    next(error);
  }
}

/**
 * 2. Get Single Admin Subscription Plan Details & Entitlements
 */
export async function handleGetAdminPlan(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const planId = req.params.id as string;
    const planRows = await queryDatabase(
      `SELECT p.id, p.name, p.slug, p.description, p.monthly_price as "monthlyPrice",
              p.yearly_price as "yearlyPrice", p.currency, p.status, p.is_public as "isPublic",
              p.is_recommended as "isRecommended", p.display_order as "displayOrder",
              p.version, p.trial_days as "trialDays", p.created_at as "createdAt"
       FROM subscription_plans p
       WHERE p.id = $1::uuid LIMIT 1`,
      [planId]
    );

    if (!planRows || planRows.length === 0) {
      return res.status(404).json({ success: false, code: "PLAN_NOT_FOUND", message: "Subscription plan not found." });
    }

    const plan = planRows[0];
    const featureRows = await queryDatabase(
      `SELECT feature_key, feature_value FROM subscription_features WHERE plan_id = $1::uuid`,
      [planId]
    );

    const versionRows = await queryDatabase(
      `SELECT id, version, monthly_price as "monthlyPrice", yearly_price as "yearlyPrice", entitlements, created_at as "createdAt"
       FROM subscription_plan_versions
       WHERE plan_id = $1::uuid
       ORDER BY version DESC`,
      [planId]
    );

    const subscriberRows = await queryDatabase(
      `SELECT COUNT(*) as count FROM subscriptions WHERE plan_id = $1::uuid AND status IN ('active', 'trialing')`,
      [planId]
    );

    res.json({
      success: true,
      plan,
      features: featureRows,
      versions: versionRows,
      subscriberCount: parseInt(subscriberRows[0]?.count ?? "0", 10),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 3. Create Subscription Plan (Created as DRAFT)
 */
export async function handleCreatePlan(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const adminUserId = req.userId || req.user!.userId;
    const {
      name,
      slug,
      description,
      monthlyPrice = 0,
      yearlyPrice = 0,
      currency = "INR",
      trialDays = 0,
      displayOrder = 0,
      isPublic = false,
      isRecommended = false,
      features = {},
    } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ success: false, message: "Plan name and slug are required." });
    }

    // Check slug uniqueness
    const existingSlug = await queryDatabase(`SELECT id FROM subscription_plans WHERE slug = $1 LIMIT 1`, [slug]);
    if (existingSlug && existingSlug.length > 0) {
      return res.status(400).json({ success: false, code: "SLUG_EXISTS", message: "A plan with this slug already exists." });
    }

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validAdminUserId = adminUserId && isUUID.test(adminUserId) ? adminUserId : null;

    // Insert plan as DRAFT
    const planRows = await queryDatabase(
      `INSERT INTO subscription_plans 
       (name, slug, description, monthly_price, yearly_price, currency, trial_days, display_order, is_public, is_recommended, status, version, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'DRAFT', 1, $11)
       RETURNING id, name, slug, status`,
      [
        name,
        slug,
        description || "",
        parseFloat(monthlyPrice),
        parseFloat(yearlyPrice),
        currency,
        parseInt(trialDays, 10),
        parseInt(displayOrder, 10),
        Boolean(isPublic),
        Boolean(isRecommended),
        validAdminUserId,
      ]
    );

    const planId = planRows[0].id;

    // Insert features into subscription_features table
    for (const [key, val] of Object.entries(features)) {
      await queryDatabase(
        `INSERT INTO subscription_features (plan_id, feature_key, feature_value)
         VALUES ($1::uuid, $2, $3)
         ON CONFLICT (plan_id, feature_key) DO UPDATE SET feature_value = $3`,
        [planId, key, String(val)]
      );
    }

    // Create Version 1 snapshot
    await queryDatabase(
      `INSERT INTO subscription_plan_versions (plan_id, version, monthly_price, yearly_price, currency, entitlements)
       VALUES ($1::uuid, 1, $2, $3, $4, $5::jsonb)`,
      [planId, parseFloat(monthlyPrice), parseFloat(yearlyPrice), currency, JSON.stringify(features)]
    );

    // Audit log
    await AdminAuditService.log({
      adminUserId,
      action: "PLAN_CREATED",
      resourceType: "subscription_plan",
      resourceId: planId,
      metadata: { name, slug, monthlyPrice, yearlyPrice, status: "DRAFT" },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.status(201).json({ success: true, plan: planRows[0], message: "Plan created as DRAFT successfully." });
  } catch (error) {
    next(error);
  }
}

/**
 * 4. Update Plan Details or Increment Version
 */
export async function handleUpdatePlan(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const planId = req.params.id as string;
    const adminUserId = req.userId || req.user!.userId;
    const {
      name,
      description,
      monthlyPrice,
      yearlyPrice,
      currency,
      trialDays,
      displayOrder,
      isPublic,
      isRecommended,
      features,
    } = req.body;

    const existingRows = await queryDatabase(`SELECT * FROM subscription_plans WHERE id = $1::uuid LIMIT 1`, [planId]);
    if (!existingRows || existingRows.length === 0) {
      return res.status(404).json({ success: false, code: "PLAN_NOT_FOUND", message: "Plan not found." });
    }

    const currentPlan = existingRows[0];
    const isDraft = currentPlan.status === "DRAFT";
    let newVersion = currentPlan.version || 1;

    if (!isDraft && (monthlyPrice !== undefined || yearlyPrice !== undefined || features !== undefined)) {
      // Incremental versioning for ACTIVE plans to protect historical subscriptions
      newVersion += 1;
    }

    await queryDatabase(
      `UPDATE subscription_plans SET
         name = COALESCE($1, name),
         description = COALESCE($2, description),
         monthly_price = COALESCE($3, monthly_price),
         yearly_price = COALESCE($4, yearly_price),
         currency = COALESCE($5, currency),
         trial_days = COALESCE($6, trial_days),
         display_order = COALESCE($7, display_order),
         is_public = COALESCE($8, is_public),
         is_recommended = COALESCE($9, is_recommended),
         version = $10,
         updated_at = NOW()
       WHERE id = $11::uuid`,
      [
        name,
        description,
        monthlyPrice !== undefined ? parseFloat(monthlyPrice) : null,
        yearlyPrice !== undefined ? parseFloat(yearlyPrice) : null,
        currency,
        trialDays !== undefined ? parseInt(trialDays, 10) : null,
        displayOrder !== undefined ? parseInt(displayOrder, 10) : null,
        isPublic !== undefined ? Boolean(isPublic) : null,
        isRecommended !== undefined ? Boolean(isRecommended) : null,
        newVersion,
        planId,
      ]
    );

    if (features && typeof features === "object") {
      for (const [key, val] of Object.entries(features)) {
        await queryDatabase(
          `INSERT INTO subscription_features (plan_id, feature_key, feature_value)
           VALUES ($1::uuid, $2, $3)
           ON CONFLICT (plan_id, feature_key) DO UPDATE SET feature_value = $3`,
          [planId, key, String(val)]
        );
      }

      // Record new plan version snapshot
      const finalMonthly = monthlyPrice !== undefined ? parseFloat(monthlyPrice) : currentPlan.monthly_price;
      const finalYearly = yearlyPrice !== undefined ? parseFloat(yearlyPrice) : currentPlan.yearly_price;
      await queryDatabase(
        `INSERT INTO subscription_plan_versions (plan_id, version, monthly_price, yearly_price, currency, entitlements)
         VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT (plan_id, version) DO UPDATE SET monthly_price = $3, yearly_price = $4, entitlements = $6::jsonb`,
        [planId, newVersion, finalMonthly, finalYearly, currency || currentPlan.currency || "INR", JSON.stringify(features)]
      );
    }

    await AdminAuditService.log({
      adminUserId,
      action: "PLAN_UPDATED",
      resourceType: "subscription_plan",
      resourceId: planId,
      metadata: { newVersion, monthlyPrice, yearlyPrice },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.json({ success: true, message: "Subscription plan updated successfully.", version: newVersion });
  } catch (error) {
    next(error);
  }
}

/**
 * 5. Publish Plan (DRAFT/INACTIVE -> ACTIVE)
 */
export async function handlePublishPlan(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const planId = req.params.id as string;
    const adminUserId = req.userId || req.user!.userId;

    await queryDatabase(
      `UPDATE subscription_plans SET status = 'ACTIVE', is_public = true, updated_at = NOW() WHERE id = $1::uuid`,
      [planId]
    );

    await AdminAuditService.log({
      adminUserId,
      action: "PLAN_PUBLISHED",
      resourceType: "subscription_plan",
      resourceId: planId,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.json({ success: true, message: "Plan published to ACTIVE successfully." });
  } catch (error) {
    next(error);
  }
}

/**
 * 6. Unpublish Plan (ACTIVE -> INACTIVE)
 */
export async function handleUnpublishPlan(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const planId = req.params.id as string;
    const adminUserId = req.userId || req.user!.userId;

    await queryDatabase(
      `UPDATE subscription_plans SET status = 'INACTIVE', is_public = false, updated_at = NOW() WHERE id = $1::uuid`,
      [planId]
    );

    await AdminAuditService.log({
      adminUserId,
      action: "PLAN_UNPUBLISHED",
      resourceType: "subscription_plan",
      resourceId: planId,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.json({ success: true, message: "Plan unpublished to INACTIVE successfully." });
  } catch (error) {
    next(error);
  }
}

/**
 * 7. Archive Plan (ACTIVE/INACTIVE -> ARCHIVED)
 */
export async function handleArchivePlan(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const planId = req.params.id as string;
    const adminUserId = req.userId || req.user!.userId;

    await queryDatabase(
      `UPDATE subscription_plans SET status = 'ARCHIVED', is_public = false, archived_at = NOW(), updated_at = NOW() WHERE id = $1::uuid`,
      [planId]
    );

    await AdminAuditService.log({
      adminUserId,
      action: "PLAN_ARCHIVED",
      resourceType: "subscription_plan",
      resourceId: planId,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.json({ success: true, message: "Plan archived successfully." });
  } catch (error) {
    next(error);
  }
}

/**
 * 8. Duplicate Plan as a new DRAFT
 */
export async function handleDuplicatePlan(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const planId = req.params.id as string;
    const adminUserId = req.userId || req.user!.userId;

    const sourceRows = await queryDatabase(`SELECT * FROM subscription_plans WHERE id = $1::uuid LIMIT 1`, [planId]);
    if (!sourceRows || sourceRows.length === 0) {
      return res.status(404).json({ success: false, code: "PLAN_NOT_FOUND", message: "Source plan not found." });
    }

    const src = sourceRows[0];
    const newSlug = `${src.slug}-copy-${Date.now()}`;
    const newName = `${src.name} (Copy)`;

    const newPlanRows = await queryDatabase(
      `INSERT INTO subscription_plans 
       (name, slug, description, monthly_price, yearly_price, currency, trial_days, display_order, is_public, is_recommended, status, version, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, false, 'DRAFT', 1, $9::uuid)
       RETURNING id, name, slug, status`,
      [newName, newSlug, src.description, src.monthly_price, src.yearly_price, src.currency, src.trial_days, src.display_order, adminUserId]
    );

    const newPlanId = newPlanRows[0].id;

    // Copy feature entitlements
    const features = await queryDatabase(`SELECT feature_key, feature_value FROM subscription_features WHERE plan_id = $1::uuid`, [planId]);
    const featureObj: Record<string, string> = {};
    for (const f of features) {
      featureObj[f.feature_key] = f.feature_value;
      await queryDatabase(
        `INSERT INTO subscription_features (plan_id, feature_key, feature_value) VALUES ($1::uuid, $2, $3)`,
        [newPlanId, f.feature_key, f.feature_value]
      );
    }

    // Version 1 snapshot
    await queryDatabase(
      `INSERT INTO subscription_plan_versions (plan_id, version, monthly_price, yearly_price, currency, entitlements)
       VALUES ($1::uuid, 1, $2, $3, $4, $5::jsonb)`,
      [newPlanId, src.monthly_price, src.yearly_price, src.currency || "INR", JSON.stringify(featureObj)]
    );

    await AdminAuditService.log({
      adminUserId,
      action: "PLAN_DUPLICATED",
      resourceType: "subscription_plan",
      resourceId: newPlanId,
      metadata: { sourcePlanId: planId, newSlug },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.status(201).json({ success: true, plan: newPlanRows[0], message: "Plan duplicated as DRAFT successfully." });
  } catch (error) {
    next(error);
  }
}

/**
 * 9. Get Workspaces Subscribed to Plan
 */
export async function handleGetPlanSubscribers(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const planId = req.params.id as string;
    const subscribers = await queryDatabase(
      `SELECT s.id as "subscriptionId", s.workspace_id as "workspaceId", w.name as "workspaceName",
              s.status, s.billing_cycle as "billingCycle", s.starts_at as "startsAt", s.created_at as "createdAt"
       FROM subscriptions s
       LEFT JOIN workspaces w ON w.id = s.workspace_id
       WHERE s.plan_id = $1::uuid
       ORDER BY s.created_at DESC`,
      [planId]
    );

    res.json({ success: true, subscribers, total: subscribers.length });
  } catch (error) {
    next(error);
  }
}
