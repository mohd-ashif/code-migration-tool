import fs from "fs";
import { subscriptionRepository } from "../repositories/subscription.repository";
import { subscriptionPlanRepository } from "../repositories/subscription-plan.repository";
import { paymentEventRepository } from "../repositories/payment-event.repository";
import { paymentRepository } from "../repositories/payment.repository";
import { invoiceRepository } from "../repositories/invoice.repository";
import { usageRepository } from "../repositories/usage.repository";
import { invoiceGeneratorService } from "./invoice-generator.service";
import { cloudinaryService } from "./cloudinary.service";
import { billingAddressRepository } from "../repositories/billing-address.repository";
import { getBillingPeriod } from "../middleware/billing.middleware";
import { queryDatabase } from "../lib/database";
import { HttpError } from "../middleware/error.middleware";
import { logger } from "../utils/logger";

export class SubscriptionRenewalService {
  async renewSubscription(params: { workspaceId: string }) {
    const sub = await subscriptionRepository.findByWorkspaceId(params.workspaceId);
    if (!sub) {
      throw new HttpError(404, "No active subscription found for workspace.");
    }

    const plan = await subscriptionPlanRepository.findById(sub.planId);
    if (!plan) {
      throw new HttpError(404, "Associated plan not found.");
    }

    const now = new Date();
    const currentEnd = sub.expiresAt ? new Date(sub.expiresAt) : new Date();
    const newExpiresAt = new Date(Math.max(now.getTime(), currentEnd.getTime()));
    
    if (sub.billingCycle === "yearly") {
      newExpiresAt.setFullYear(newExpiresAt.getFullYear() + 1);
    } else {
      newExpiresAt.setMonth(newExpiresAt.getMonth() + 1);
    }

    // 1. Extend subscription date
    const updatedSub = await subscriptionRepository.update(sub.id, {
      status: "active",
      startsAt: now,
      expiresAt: newExpiresAt,
      renewAt: newExpiresAt,
      cancelAt: null
    });

    // 2. Calculate GST taxes & create payment record
    const basePrice = sub.billingCycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
    const address = await billingAddressRepository.findByWorkspaceId(params.workspaceId);
    const taxCalc = invoiceGeneratorService.calculateGst({
      subtotal: basePrice,
      discount: 0,
      customerState: address?.state || "Karnataka"
    });

    const paymentTxId = `rnw_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const payment = await paymentRepository.create({
      workspaceId: params.workspaceId,
      subscriptionId: sub.id,
      gateway: sub.paymentProvider || "razorpay",
      transactionId: paymentTxId,
      orderId: sub.providerSubscriptionId || null,
      amount: taxCalc.total,
      currency: "INR",
      status: "captured",
      paymentMethod: "auto_renewal",
      paidAt: now
    });

    // 3. Generate sequential GST Invoice
    const invoiceNumber = await invoiceRepository.getNextInvoiceNumber();
    const invoiceRecord = await invoiceRepository.create(
      {
        workspaceId: params.workspaceId,
        subscriptionId: sub.id,
        paymentId: payment.id,
        invoiceNumber,
        subtotal: taxCalc.taxableAmount,
        cgst: taxCalc.cgst,
        sgst: taxCalc.sgst,
        igst: taxCalc.igst,
        discount: 0,
        total: taxCalc.total,
        status: "paid",
        billingDetails: address || {}
      },
      [
        {
          description: `${plan.name} Subscription Auto-Renewal (${sub.billingCycle})`,
          amount: taxCalc.taxableAmount
        }
      ]
    );

    try {
      const pdfPath = await invoiceGeneratorService.generatePdf(
        { ...invoiceRecord, items: [{ id: "1", invoiceId: invoiceRecord.id, description: `${plan.name} Renewal`, amount: taxCalc.taxableAmount, createdAt: new Date() }] },
        address || { workspaceId: params.workspaceId, companyName: "Customer", addressLine1: "N/A", city: "Bangalore", state: "Karnataka", pinCode: "560103", country: "India", createdAt: new Date(), updatedAt: new Date() }
      );
      const uploadResult = await cloudinaryService.uploadInvoice(pdfPath, invoiceRecord.invoiceNumber);
      if (uploadResult) {
        await invoiceRepository.updateCloudinaryStorage(invoiceRecord.id, uploadResult.secureUrl, uploadResult.publicId);
        if (fs.existsSync(pdfPath)) {
          fs.unlinkSync(pdfPath); // Delete temporary local file
        }
      } else {
        const pdfDownloadUrl = `/api/invoices/${invoiceRecord.id}/download`;
        await invoiceRepository.updatePdfUrl(invoiceRecord.id, pdfDownloadUrl);
      }
    } catch (pdfErr) {
      logger.warn(`Could not generate renewal PDF: ${pdfErr}`);
    }

    await paymentRepository.updateInvoice(payment.id, invoiceRecord.id);

    // 4. Reset usage tracking
    const features = await subscriptionPlanRepository.findPlanFeatures(plan.id);
    const migrationsLimit = features.find(f => f.featureKey === "migrations_limit")?.featureValue || "5";
    const storageLimit = features.find(f => f.featureKey === "storage_limit_bytes")?.featureValue || "104857600";

    const billingPeriod = getBillingPeriod(updatedSub);
    await usageRepository.resetUsage(params.workspaceId, "migrations", parseInt(migrationsLimit, 10), billingPeriod.start, billingPeriod.end);
    await usageRepository.resetUsage(params.workspaceId, "storage_bytes", parseInt(storageLimit, 10), billingPeriod.start, billingPeriod.end);

    // 5. Audit event
    await paymentEventRepository.create({
      paymentId: payment.id,
      workspaceId: params.workspaceId,
      eventType: "Subscription Renewed",
      payload: {
        subscriptionId: sub.id,
        planSlug: plan.slug,
        expiresAt: newExpiresAt
      }
    });

    return {
      success: true,
      message: "Subscription renewed successfully.",
      subscription: updatedSub,
      invoice: invoiceRecord
    };
  }

  async cancelSubscription(workspaceId: string) {
    const sub = await subscriptionRepository.findByWorkspaceId(workspaceId);
    if (!sub) {
      throw new HttpError(404, "No active subscription found.");
    }

    const updatedSub = await subscriptionRepository.update(sub.id, {
      cancelAt: sub.expiresAt || new Date()
    });

    await paymentEventRepository.create({
      workspaceId,
      eventType: "Subscription Cancelled",
      payload: {
        subscriptionId: sub.id,
        cancelAt: sub.expiresAt
      }
    });

    return {
      success: true,
      message: "Subscription will be cancelled at the end of current billing period.",
      subscription: updatedSub
    };
  }

  async resumeSubscription(workspaceId: string) {
    const sub = await subscriptionRepository.findByWorkspaceId(workspaceId);
    if (!sub) {
      throw new HttpError(404, "No subscription found.");
    }

    const updatedSub = await subscriptionRepository.update(sub.id, {
      status: "active",
      cancelAt: null
    });

    await paymentEventRepository.create({
      workspaceId,
      eventType: "Subscription Resumed",
      payload: { subscriptionId: sub.id }
    });

    return {
      success: true,
      message: "Subscription resumed successfully.",
      subscription: updatedSub
    };
  }
}

export const subscriptionRenewalService = new SubscriptionRenewalService();
