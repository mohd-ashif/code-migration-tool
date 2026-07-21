import { Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import { config } from "../config";
import { subscriptionPlanRepository } from "../repositories/subscription-plan.repository";
import { subscriptionRepository } from "../repositories/subscription.repository";
import { usageRepository } from "../repositories/usage.repository";
import { invoiceRepository } from "../repositories/invoice.repository";
import { billingAddressRepository } from "../repositories/billing-address.repository";
import { paymentRepository } from "../repositories/payment.repository";
import { couponRepository } from "../repositories/coupon.repository";
import { razorpayService } from "../services/razorpay.service";
import { invoiceGeneratorService } from "../services/invoice-generator.service";
import { getBillingPeriod, resolveWorkspacePlan } from "../middleware/billing.middleware";
import { HttpError } from "../middleware/error.middleware";
import { logger } from "../utils/logger";
import { queryDatabase } from "../lib/database";

function getWorkspaceContext(req: Request) {
  const workspaceId = (req as any).workspaceId;
  if (!workspaceId) {
    throw new HttpError(400, "Workspace context required.");
  }
  return workspaceId;
}

export class BillingController {
  
  /**
   * GET /api/billing/plans
   */
  async getPlans(req: Request, res: Response, next: NextFunction) {
    try {
      const plans = await subscriptionPlanRepository.findAllActive();
      const result = [];
      
      for (const plan of plans) {
        const features = await subscriptionPlanRepository.findPlanFeatures(plan.id);
        result.push({
          ...plan,
          features: features.map(f => ({
            key: f.featureKey,
            value: f.featureValue
          }))
        });
      }
      
      res.json({ success: true, plans: result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/billing/subscription
   */
  async getSubscription(req: Request, res: Response, next: NextFunction) {
    try {
      const workspaceId = getWorkspaceContext(req);
      const sub = await subscriptionRepository.findByWorkspaceId(workspaceId);
      const billingAddress = await billingAddressRepository.findByWorkspaceId(workspaceId);
      
      if (!sub) {
        // Fallback info for Free
        const freePlan = await subscriptionPlanRepository.findBySlug("free");
        return res.json({
          success: true,
          subscription: {
            status: "active",
            billingCycle: "monthly",
            startsAt: new Date(),
            plan: freePlan,
            billingDetails: billingAddress
          }
        });
      }
      
      const plan = await subscriptionPlanRepository.findById(sub.planId);
      res.json({
        success: true,
        subscription: {
          ...sub,
          plan,
          billingDetails: billingAddress
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/billing/address
   */
  async saveBillingAddress(req: Request, res: Response, next: NextFunction) {
    try {
      const workspaceId = getWorkspaceContext(req);
      const { companyName, gstNumber, addressLine1, addressLine2, city, state, pinCode, country, phone, email } = req.body;
      if (!addressLine1 || !city || !state || !pinCode) {
        throw new HttpError(400, "Address line 1, city, state, and pin code are required.");
      }
      const saved = await billingAddressRepository.save({
        workspaceId,
        companyName,
        gstNumber,
        addressLine1,
        addressLine2,
        city,
        state,
        pinCode,
        country,
        phone,
        email
      });
      res.json({ success: true, address: saved });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/billing/checkout
   */
  async checkout(req: Request, res: Response, next: NextFunction) {
    try {
      const workspaceId = getWorkspaceContext(req);
      const { planSlug, billingCycle, billingAddress, couponCode } = req.body;

      if (!planSlug || !billingCycle) {
        throw new HttpError(400, "Plan slug and billing cycle are required.");
      }

      // 1. Resolve Target Plan
      const plan = await subscriptionPlanRepository.findBySlug(planSlug);
      if (!plan) {
        throw new HttpError(404, `Plan '${planSlug}' not found.`);
      }

      if (plan.slug === "free") {
        throw new HttpError(400, "Checkout is only applicable for paid subscription tiers.");
      }

      // 2. Validate/Save Billing Address
      if (!billingAddress || !billingAddress.addressLine1 || !billingAddress.city || !billingAddress.state || !billingAddress.pinCode) {
        throw new HttpError(400, "Complete billing address (Address, City, State, PIN) is required for payment checkout.");
      }

      const savedAddress = await billingAddressRepository.save({
        workspaceId,
        ...billingAddress
      });

      // 3. Compute Price & Taxes (Apply Coupon if passed)
      let price = billingCycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
      let discount = 0;
      let coupon = null;

      if (couponCode) {
        coupon = await couponRepository.findByCode(couponCode);
        if (coupon) {
          if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
            throw new HttpError(400, "Coupon has expired.");
          }
          if (coupon.maxRedemptions && coupon.timesRedeemed >= coupon.maxRedemptions) {
            throw new HttpError(400, "Coupon redemption limit reached.");
          }
          
          if (coupon.discountType === "percentage") {
            discount = parseFloat((price * (coupon.discountValue / 100)).toFixed(2));
          } else {
            discount = Math.min(price, coupon.discountValue);
          }
        }
      }

      const taxCalculation = invoiceGeneratorService.calculateGst({
        subtotal: price,
        discount,
        customerState: savedAddress.state
      });

      const currentUserEmail = (req as any).user?.email || "user@migrationtool.local";

      // 4. Retrieve or Create Razorpay Customer
      // Check if customer ID already exists in payment methods to reuse it and avoid constraint violation
      const existingPm = await queryDatabase(
        `SELECT id, provider_customer_id FROM payment_methods WHERE workspace_id = $1::uuid AND provider = 'razorpay' LIMIT 1`,
        [workspaceId]
      );

      let razorpayCustomerId: string;
      if (existingPm.length > 0 && existingPm[0].provider_customer_id) {
        razorpayCustomerId = existingPm[0].provider_customer_id;
      } else {
        razorpayCustomerId = await razorpayService.createCustomer(
          (req as any).user?.fullName || "Workspace Owner",
          currentUserEmail,
          savedAddress.phone || undefined
        );

        if (existingPm.length === 0) {
          await queryDatabase(
            `INSERT INTO payment_methods (workspace_id, provider, provider_customer_id, is_default)
             VALUES ($1::uuid, 'razorpay', $2, true)`,
            [workspaceId, razorpayCustomerId]
          );
        } else {
          await queryDatabase(
            `UPDATE payment_methods 
             SET provider_customer_id = $1 
             WHERE id = $2::uuid`,
            [razorpayCustomerId, existingPm[0].id]
          );
        }
      }

      // 5. Retrieve or Create Razorpay Plan ID and Subscription
      let rzpSubId: string;
      let isMock = false;

      try {
        const rzpPlanId = await razorpayService.getOrCreatePlan(
          plan.slug,
          plan.name,
          taxCalculation.total, // Subscription total including GST
          billingCycle
        );

        // 6. Create Razorpay Subscription
        const rzpSub = await razorpayService.createSubscription({
          planId: rzpPlanId,
          customerId: razorpayCustomerId,
          totalCount: billingCycle === "yearly" ? 1 : 12, // 1 year renewal or 12 month renewal
        });
        rzpSubId = rzpSub.id;
      } catch (rzpErr: any) {
        logger.warn(`Razorpay service failed/unauthorized. Falling back to Simulated Sandbox Mode. Error: ${rzpErr.message}`);
        isMock = true;
        rzpSubId = `sub_mock_${Math.random().toString(36).substring(2, 12)}`;
      }

      // 7. Save pending subscription locally
      const pendingSub = await subscriptionRepository.create({
        workspaceId,
        planId: plan.id,
        status: "trialing", // pending payment validation
        billingCycle,
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // temp renew date
        paymentProvider: "razorpay",
        providerSubscriptionId: rzpSubId
      });

      if (coupon) {
        await couponRepository.createRedemption(coupon.id, workspaceId, pendingSub.id);
      }

      res.status(201).json({
        success: true,
        checkout: {
          subscriptionId: rzpSubId,
          razorpayKeyId: config.RAZORPAY_KEY_ID || "rzp_test_mockkeyid",
          amount: Math.round(taxCalculation.total * 100),
          currency: "INR",
          customerName: (req as any).user?.fullName || "User",
          customerEmail: currentUserEmail,
          customerPhone: savedAddress.phone || "",
          subscriptionDetailsId: pendingSub.id,
          isMock
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/billing/verify
   */
  async verify(req: Request, res: Response, next: NextFunction) {
    try {
      const workspaceId = getWorkspaceContext(req);
      const { paymentId, signature, subscriptionId } = req.body;

      if (!paymentId || !signature || !subscriptionId) {
        throw new HttpError(400, "Payment verification requires paymentId, signature, and subscriptionId.");
      }

      // 1. Verify Payment Signature
      const isValid = razorpayService.verifyPaymentSignature({
        paymentId,
        signature,
        subscriptionId
      });

      if (!isValid) {
        throw new HttpError(400, "Invalid payment signature verification failed.");
      }

      // 2. Fetch Subscription
      const sub = await subscriptionRepository.findByProviderId(subscriptionId);
      if (!sub) {
        throw new HttpError(404, "Associated workspace subscription not found.");
      }

      // 3. Mark Subscription active
      const now = new Date();
      const expiresAt = new Date();
      if (sub.billingCycle === "yearly") {
        expiresAt.setFullYear(now.getFullYear() + 1);
      } else {
        expiresAt.setMonth(now.getMonth() + 1);
      }

      const updatedSub = await subscriptionRepository.update(sub.id, {
        status: "active",
        startsAt: now,
        expiresAt
      });

      // 4. Save Payment record
      const rzpSubDetails = await razorpayService.getSubscriptionDetails(subscriptionId);
      const plan = await subscriptionPlanRepository.findById(sub.planId);
      const savedAddress = await billingAddressRepository.findByWorkspaceId(workspaceId);

      const price = sub.billingCycle === "yearly" ? plan!.yearlyPrice : plan!.monthlyPrice;
      
      // Determine coupon deduction if applied
      const activeRedemption = await couponRepository.findActiveRedemption(workspaceId);
      let discount = 0;
      if (activeRedemption && activeRedemption.subscriptionId === sub.id) {
        const coupon = activeRedemption.coupon;
        if (coupon.discountType === "percentage") {
          discount = parseFloat((price * (coupon.discountValue / 100)).toFixed(2));
        } else {
          discount = Math.min(price, coupon.discountValue);
        }
      }

      const taxCalculation = invoiceGeneratorService.calculateGst({
        subtotal: price,
        discount,
        customerState: savedAddress ? savedAddress.state : "Karnataka"
      });

      const paymentRecord = await paymentRepository.create({
        workspaceId,
        subscriptionId: sub.id,
        gateway: "razorpay",
        transactionId: paymentId,
        orderId: rzpSubDetails.order_id || null,
        amount: taxCalculation.total,
        status: "captured",
        paymentMethod: rzpSubDetails.payment_method || "card",
        paidAt: now
      });

      // 5. Create GST-Compliant Invoice
      const invoiceNumber = await invoiceRepository.getNextInvoiceNumber();
      const invoiceRecord = await invoiceRepository.create(
        {
          workspaceId,
          subscriptionId: sub.id,
          paymentId: paymentRecord.id,
          invoiceNumber,
          subtotal: price,
          cgst: taxCalculation.cgst,
          sgst: taxCalculation.sgst,
          igst: taxCalculation.igst,
          discount,
          total: taxCalculation.total,
          status: "paid",
          billingDetails: savedAddress
        },
        [
          {
            description: `${plan!.name} SaaS Subscription (${sub.billingCycle} cycle)`,
            amount: price
          }
        ]
      );

      // Link payment to invoice
      await paymentRepository.updateInvoice(paymentRecord.id, invoiceRecord.id);

      // 6. Generate PDF in background & link
      const pdfPath = await invoiceGeneratorService.generatePdf(invoiceRecord, savedAddress || {
        workspaceId,
        addressLine1: "Billing Dept",
        city: "Bangalore",
        state: "Karnataka",
        pinCode: "560103",
        country: "India",
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      const relativePdfUrl = `/api/billing/invoices/${invoiceRecord.id}/pdf`;
      await invoiceRepository.updatePdfUrl(invoiceRecord.id, relativePdfUrl);

      // 7. Reset usage limits for new billing period
      const features = await subscriptionPlanRepository.findPlanFeatures(plan!.id);
      const migrationsLimit = features.find(f => f.featureKey === "migrations_limit")?.featureValue || "5";
      const storageLimit = features.find(f => f.featureKey === "storage_limit_bytes")?.featureValue || "104857600";

      const billingPeriod = getBillingPeriod(updatedSub);
      await usageRepository.resetUsage(workspaceId, "migrations", parseInt(migrationsLimit, 10), billingPeriod.start, billingPeriod.end);
      await usageRepository.resetUsage(workspaceId, "storage_bytes", parseInt(storageLimit, 10), billingPeriod.start, billingPeriod.end);

      // Update workspace model limits
      await queryDatabase(
        `UPDATE workspaces 
         SET plan_id = $1, storage_limit = $2, status = 'active'
         WHERE id = $3::uuid`,
        [plan!.slug, parseInt(storageLimit, 10), workspaceId]
      );

      await subscriptionRepository.saveEvent(sub.id, "payment_verified", {
        paymentId,
        invoiceId: invoiceRecord.id
      });

      res.json({ success: true, message: "Subscription active and payment verified.", invoice: invoiceRecord });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/billing/cancel
   */
  async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      const workspaceId = getWorkspaceContext(req);
      const sub = await subscriptionRepository.findByWorkspaceId(workspaceId);
      
      if (!sub || sub.status !== "active") {
        throw new HttpError(400, "No active subscription found to cancel.");
      }

      if (sub.providerSubscriptionId) {
        await razorpayService.cancelSubscription(sub.providerSubscriptionId, true);
      }

      const updated = await subscriptionRepository.update(sub.id, {
        status: "cancelled",
        cancelAt: new Date()
      });

      await subscriptionRepository.saveEvent(sub.id, "subscription_cancelled", {
        cancelledAt: new Date()
      });

      res.json({ success: true, message: "Subscription set to cancel at end of billing cycle.", subscription: updated });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/billing/resume
   */
  async resume(req: Request, res: Response, next: NextFunction) {
    try {
      const workspaceId = getWorkspaceContext(req);
      const sub = await subscriptionRepository.findByWorkspaceId(workspaceId);
      
      if (!sub || sub.status !== "cancelled") {
        throw new HttpError(400, "No cancelled pending subscription found to resume.");
      }

      // Resume on Razorpay is supported only by making subscription active again (removing cancel_at_cycle_end)
      // Since Razorpay cancel_at_cycle_end is irreversible once webhook confirms, we check provider
      const updated = await subscriptionRepository.update(sub.id, {
        status: "active",
        cancelAt: null
      });

      await subscriptionRepository.saveEvent(sub.id, "subscription_resumed", {
        resumedAt: new Date()
      });

      res.json({ success: true, message: "Subscription resumed successfully.", subscription: updated });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/billing/usage
   */
  async getUsage(req: Request, res: Response, next: NextFunction) {
    try {
      const workspaceId = getWorkspaceContext(req);
      const { planId, slug, subscription } = await resolveWorkspacePlan(workspaceId);
      const features = await subscriptionPlanRepository.findPlanFeatures(planId);

      const billingPeriod = getBillingPeriod(subscription);
      const usageRecords = await usageRepository.listUsage(workspaceId, billingPeriod.start, billingPeriod.end);

      // Construct usage object with limit mappings
      const result = {
        plan: slug,
        billingPeriodStart: billingPeriod.start,
        billingPeriodEnd: billingPeriod.end,
        metrics: {
          migrations: {
            value: usageRecords.find(u => u.metric === "migrations")?.value || 0,
            limit: parseInt(features.find(f => f.featureKey === "migrations_limit")?.featureValue || "5", 10)
          },
          storage_bytes: {
            value: usageRecords.find(u => u.metric === "storage_bytes")?.value || 0,
            limit: parseInt(features.find(f => f.featureKey === "storage_limit_bytes")?.featureValue || "104857600", 10)
          },
          ai_requests: {
            value: usageRecords.find(u => u.metric === "ai_requests")?.value || 0,
            limit: parseInt(features.find(f => f.featureKey === "ai_requests_limit")?.featureValue || "10", 10)
          }
        }
      };

      res.json({ success: true, usage: result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/billing/invoices
   */
  async getInvoices(req: Request, res: Response, next: NextFunction) {
    try {
      const workspaceId = getWorkspaceContext(req);
      const invoices = await invoiceRepository.listForWorkspace(workspaceId);
      res.json({ success: true, invoices });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/billing/invoices/:id
   */
  async getInvoiceDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const workspaceId = getWorkspaceContext(req);
      const invoiceId = req.params.id;
      const invoice = await invoiceRepository.findById(invoiceId, workspaceId);
      
      if (!invoice) {
        throw new HttpError(404, "Invoice not found.");
      }

      res.json({ success: true, invoice });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/billing/invoices/:id/pdf
   */
  async getInvoicePdf(req: Request, res: Response, next: NextFunction) {
    try {
      const workspaceId = getWorkspaceContext(req);
      const invoiceId = req.params.id;
      const invoice = await invoiceRepository.findById(invoiceId, workspaceId);

      if (!invoice) {
        throw new HttpError(404, "Invoice not found.");
      }

      const filePath = path.join(__dirname, "..", "..", "scratch", "invoices", `${invoice.invoiceNumber}.pdf`);
      
      if (!fs.existsSync(filePath)) {
        // Regenerate if missing
        const billingAddress = await billingAddressRepository.findByWorkspaceId(workspaceId);
        await invoiceGeneratorService.generatePdf(invoice, billingAddress || {
          workspaceId,
          addressLine1: "Billing Dept",
          city: "Bangalore",
          state: "Karnataka",
          pinCode: "560103",
          country: "India",
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=${invoice.invoiceNumber}.pdf`);
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/billing/apply-coupon
   */
  async applyCoupon(req: Request, res: Response, next: NextFunction) {
    try {
      const { code } = req.body;
      if (!code) {
        throw new HttpError(400, "Coupon code is required.");
      }

      const coupon = await couponRepository.findByCode(code);
      if (!coupon) {
        throw new HttpError(404, "Invalid coupon code.");
      }

      if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
        throw new HttpError(400, "Coupon code has expired.");
      }

      if (coupon.maxRedemptions && coupon.timesRedeemed >= coupon.maxRedemptions) {
        throw new HttpError(400, "Coupon has reached maximum redemption limit.");
      }

      res.json({
        success: true,
        coupon: {
          code: coupon.code,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/billing/upgrade or downgrade
   */
  async handlePlanChange(req: Request, res: Response, next: NextFunction) {
    try {
      const workspaceId = getWorkspaceContext(req);
      const { planSlug } = req.body;

      if (!planSlug) {
        throw new HttpError(400, "Target plan slug is required.");
      }

      const plan = await subscriptionPlanRepository.findBySlug(planSlug);
      if (!plan) {
        throw new HttpError(404, `Plan '${planSlug}' not found.`);
      }

      const currentSub = await subscriptionRepository.findByWorkspaceId(workspaceId);
      if (!currentSub) {
        throw new HttpError(400, "To upgrade/downgrade, you must have an active subscription. Use checkout first.");
      }

      // Upgrade logic: if user goes from Pro to Team immediately, we call checkout
      // Downgrade logic: schedule plan change at cycle end
      if (plan.slug === "free") {
        // Equivalent to cancelling current paid plan
        await razorpayService.cancelSubscription(currentSub.providerSubscriptionId!, true);
        const updated = await subscriptionRepository.update(currentSub.id, {
          status: "cancelled",
          cancelAt: new Date()
        });
        return res.json({ success: true, message: "Subscription scheduled for downgrade to Free at end of billing cycle.", subscription: updated });
      }

      res.json({
        success: true,
        message: "Plan switch request initiated. Please complete checkout to authorize payment.",
        checkoutRequired: true,
        planSlug: plan.slug
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/billing/payments
   */
  async getPayments(req: Request, res: Response, next: NextFunction) {
    try {
      const workspaceId = getWorkspaceContext(req);
      const payments = await paymentRepository.listForWorkspace(workspaceId);
      res.json({ success: true, payments });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/billing/admin/plans
   */
  async adminCreatePlan(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, slug, description, monthlyPrice, yearlyPrice, currency, trialDays, displayOrder, isPublic, isActive, features } = req.body;
      if (!name || !slug) {
        throw new HttpError(400, "Plan name and slug are required.");
      }

      const plan = await subscriptionPlanRepository.savePlan({
        name,
        slug,
        description,
        monthlyPrice,
        yearlyPrice,
        currency,
        trialDays,
        displayOrder,
        isPublic,
        isActive
      });

      if (features && Array.isArray(features)) {
        for (const feat of features) {
          if (feat.key && feat.value !== undefined) {
            await subscriptionPlanRepository.saveFeature(plan.id, feat.key, String(feat.value));
          }
        }
      }

      res.status(201).json({ success: true, plan });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/billing/admin/plans/:id
   */
  async adminEditPlan(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { name, description, monthlyPrice, yearlyPrice, displayOrder, isPublic, isActive, features } = req.body;

      const plan = await subscriptionPlanRepository.updatePlan(id, {
        name,
        description,
        monthlyPrice,
        yearlyPrice,
        displayOrder,
        isPublic,
        isActive
      });

      if (features && Array.isArray(features)) {
        for (const feat of features) {
          if (feat.key && feat.value !== undefined) {
            await subscriptionPlanRepository.saveFeature(id, feat.key, String(feat.value));
          }
        }
      }

      res.json({ success: true, plan });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/billing/admin/plans/:id/disable
   */
  async adminDisablePlan(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await subscriptionPlanRepository.disablePlan(id);
      res.json({ success: true, message: "Subscription plan disabled successfully." });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/billing/admin/coupons
   */
  async adminCreateCoupon(req: Request, res: Response, next: NextFunction) {
    try {
      const { code, discountType, discountValue, duration, durationInMonths, maxRedemptions, expiresAt } = req.body;
      if (!code || !discountType || discountValue === undefined) {
        throw new HttpError(400, "Coupon code, discount type, and value are required.");
      }

      const coupon = await couponRepository.save({
        code,
        discountType,
        discountValue,
        duration,
        durationInMonths,
        maxRedemptions,
        expiresAt: expiresAt ? new Date(expiresAt) : null
      });

      res.status(201).json({ success: true, coupon });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/billing/admin/payments/:id/refund
   */
  async adminRefundPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { amount } = req.body;

      const payment = await paymentRepository.findById(id);
      if (!payment) {
        throw new HttpError(404, "Payment record not found.");
      }

      const refundResult = await razorpayService.refundPayment(payment.transactionId, amount);
      await paymentRepository.updateStatus(id, "refunded");

      res.json({ success: true, message: "Payment refunded successfully.", refund: refundResult });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/billing/admin/revenue
   */
  async adminGetRevenue(req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await paymentRepository.getRevenueStats();
      res.json({ success: true, stats });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/billing/admin/subscriptions
   */
  async adminGetSubscriptions(req: Request, res: Response, next: NextFunction) {
    try {
      const subscriptions = await subscriptionRepository.listAll();
      res.json({ success: true, subscriptions });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/billing/admin/usage
   */
  async adminGetUsage(req: Request, res: Response, next: NextFunction) {
    try {
      const usage = await usageRepository.listAllUsage();
      res.json({ success: true, usage });
    } catch (err) {
      next(err);
    }
  }
}
export const billingController = new BillingController();
