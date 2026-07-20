import { Router, Request, Response, NextFunction } from "express";
import { razorpayService } from "../services/razorpay.service";
import { subscriptionRepository } from "../repositories/subscription.repository";
import { subscriptionPlanRepository } from "../repositories/subscription-plan.repository";
import { paymentRepository } from "../repositories/payment.repository";
import { invoiceRepository } from "../repositories/invoice.repository";
import { billingAddressRepository } from "../repositories/billing-address.repository";
import { usageRepository } from "../repositories/usage.repository";
import { getBillingPeriod } from "../middleware/billing.middleware";
import { queryDatabase } from "../lib/database";
import { logger } from "../utils/logger";
import { HttpError } from "../middleware/error.middleware";

const router = Router();

router.post("/razorpay", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const signature = req.headers["x-razorpay-signature"] as string;
    const rawBody = (req as any).rawBody;

    if (!signature || !rawBody) {
      throw new HttpError(400, "Missing signature or body in webhook request.");
    }

    // 1. Verify Webhook Signature
    const rawBodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody;
    const isValid = razorpayService.verifyWebhookSignature(rawBodyStr, signature);
    
    if (!isValid) {
      logger.warn("Razorpay Webhook: Invalid signature received.");
      throw new HttpError(400, "Invalid webhook signature.");
    }

    const event = req.body;
    logger.info(`Razorpay Webhook Received Event: ${event.event}`);

    // 2. Handle specific subscription events
    const subEntity = event.payload?.subscription?.entity;
    const paymentEntity = event.payload?.payment?.entity;

    if (event.event === "subscription.charged" && subEntity) {
      const providerSubId = subEntity.id;
      const sub = await subscriptionRepository.findByProviderId(providerSubId);
      
      if (sub) {
        const workspaceId = sub.workspaceId;
        const now = new Date();
        const expiresAt = new Date(subEntity.current_end * 1000); // end of billing cycle timestamp from Razorpay

        // Update local subscription expiration dates
        const updatedSub = await subscriptionRepository.update(sub.id, {
          status: "active",
          startsAt: new Date(subEntity.current_start * 1000),
          expiresAt,
          cancelAt: subEntity.cancel_at_cycle_end ? new Date() : null
        });

        // Save Payment history (idempotency check)
        const paymentTxId = paymentEntity?.id || `txn_${Date.now()}`;
        const existingPayment = await paymentRepository.findByTransactionId(paymentTxId);
        
        if (!existingPayment) {
          const plan = await subscriptionPlanRepository.findById(sub.planId);
          const savedAddress = await billingAddressRepository.findByWorkspaceId(workspaceId);
          
          const amount = paymentEntity ? paymentEntity.amount / 100 : subEntity.amount / 100;
          const price = sub.billingCycle === "yearly" ? plan!.yearlyPrice : plan!.monthlyPrice;
          const discount = Math.max(0, price - amount); // simple discount capture

          const taxCalculation = {
            subtotal: price,
            cgst: 0,
            sgst: 0,
            igst: 0,
            total: amount
          };

          // Recalculate taxes based on actual paid amount
          const isLocal = savedAddress?.state.toLowerCase().trim() === "karnataka";
          if (isLocal) {
            taxCalculation.cgst = parseFloat((amount * 0.09).toFixed(2));
            taxCalculation.sgst = parseFloat((amount * 0.09).toFixed(2));
            taxCalculation.subtotal = parseFloat((amount - taxCalculation.cgst - taxCalculation.sgst).toFixed(2));
          } else {
            taxCalculation.igst = parseFloat((amount * 0.18).toFixed(2));
            taxCalculation.subtotal = parseFloat((amount - taxCalculation.igst).toFixed(2));
          }

          const paymentRecord = await paymentRepository.create({
            workspaceId,
            subscriptionId: sub.id,
            gateway: "razorpay",
            transactionId: paymentTxId,
            orderId: subEntity.order_id || null,
            amount: taxCalculation.total,
            status: "captured",
            paymentMethod: paymentEntity?.method || "card",
            paidAt: now
          });

          // Generate sequential Invoice
          const invoiceNumber = await invoiceRepository.getNextInvoiceNumber();
          const invoiceRecord = await invoiceRepository.create(
            {
              workspaceId,
              subscriptionId: sub.id,
              paymentId: paymentRecord.id,
              invoiceNumber,
              subtotal: taxCalculation.subtotal,
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
                description: `${plan!.name} SaaS Subscription (Cycle: ${sub.billingCycle})`,
                amount: taxCalculation.subtotal
              }
            ]
          );

          await paymentRepository.updateInvoice(paymentRecord.id, invoiceRecord.id);

          // Reset usage limit for next period
          const features = await subscriptionPlanRepository.findPlanFeatures(plan!.id);
          const migrationsLimit = features.find(f => f.featureKey === "migrations_limit")?.featureValue || "5";
          const storageLimit = features.find(f => f.featureKey === "storage_limit_bytes")?.featureValue || "104857600";

          const billingPeriod = getBillingPeriod(updatedSub);
          await usageRepository.resetUsage(workspaceId, "migrations", parseInt(migrationsLimit, 10), billingPeriod.start, billingPeriod.end);
          await usageRepository.resetUsage(workspaceId, "storage_bytes", parseInt(storageLimit, 10), billingPeriod.start, billingPeriod.end);

          // Update Workspace parameters
          await queryDatabase(
            `UPDATE workspaces 
             SET plan_id = $1, storage_limit = $2, status = 'active'
             WHERE id = $3::uuid`,
            [plan!.slug, parseInt(storageLimit, 10), workspaceId]
          );
        }

        await subscriptionRepository.saveEvent(sub.id, "webhook_charged", event);
      }
    } 
    
    else if (event.event === "subscription.cancelled" && subEntity) {
      const sub = await subscriptionRepository.findByProviderId(subEntity.id);
      if (sub) {
        await subscriptionRepository.update(sub.id, {
          status: "cancelled",
          expiresAt: new Date(subEntity.ended_at * 1000 || Date.now())
        });

        // Demote workspace to free limits
        const freePlan = await subscriptionPlanRepository.findBySlug("free");
        const features = await subscriptionPlanRepository.findPlanFeatures(freePlan!.id);
        const storageLimit = features.find(f => f.featureKey === "storage_limit_bytes")?.featureValue || "104857600";

        await queryDatabase(
          `UPDATE workspaces 
           SET plan_id = 'free', storage_limit = $1, status = 'active'
           WHERE id = $2::uuid`,
          [parseInt(storageLimit, 10), sub.workspaceId]
        );

        await subscriptionRepository.saveEvent(sub.id, "webhook_cancelled", event);
      }
    } 
    
    else if (event.event === "subscription.halted" && subEntity) {
      const sub = await subscriptionRepository.findByProviderId(subEntity.id);
      if (sub) {
        await subscriptionRepository.update(sub.id, {
          status: "suspended"
        });

        // Suspend workspace access
        await queryDatabase(
          `UPDATE workspaces 
           SET status = 'suspended'
           WHERE id = $1::uuid`,
          [sub.workspaceId]
        );

        await subscriptionRepository.saveEvent(sub.id, "webhook_suspended", event);
      }
    }

    res.json({ success: true, message: "Webhook event processed." });
  } catch (err) {
    next(err);
  }
});

export default router;
