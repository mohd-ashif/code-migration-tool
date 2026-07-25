import { PaymentGatewayFactory } from "./gateways/gateway.factory";
import { webhookLogRepository } from "../repositories/webhook-log.repository";
import { paymentEventRepository } from "../repositories/payment-event.repository";
import { subscriptionRepository } from "../repositories/subscription.repository";
import { subscriptionPlanRepository } from "../repositories/subscription-plan.repository";
import { paymentRepository } from "../repositories/payment.repository";
import { invoiceRepository } from "../repositories/invoice.repository";
import { billingAddressRepository } from "../repositories/billing-address.repository";
import { usageRepository } from "../repositories/usage.repository";
import { invoiceGeneratorService } from "./invoice-generator.service";
import { getBillingPeriod } from "../middleware/billing.middleware";
import { queryDatabase } from "../lib/database";
import { logger } from "../utils/logger";
import { HttpError } from "../middleware/error.middleware";

export class WebhookProcessorService {
  async processRazorpayWebhook(params: {
    rawBody: string;
    signature: string;
    body: any;
  }) {
    const gateway = PaymentGatewayFactory.getGateway("razorpay");

    // 1. Verify Webhook Signature
    const isValid = gateway.verifyWebhookSignature(params.rawBody, params.signature);
    if (!isValid) {
      logger.warn("Razorpay Webhook: Invalid signature detected.");
      throw new HttpError(400, "Invalid webhook signature.");
    }

    const event = params.body;
    const eventId = event.event_id || event.id || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const eventType = event.event;

    logger.info(`Razorpay Webhook Processing Event: ${eventType} (ID: ${eventId})`);

    // 2. Check Idempotency
    const existingLog = await webhookLogRepository.findByEventId(eventId);
    if (existingLog && existingLog.status === "processed") {
      logger.info(`Webhook event ${eventId} already processed. Skipping.`);
      return { success: true, message: "Webhook event already processed (idempotent skip)." };
    }

    // Record initial webhook log
    await webhookLogRepository.create({
      eventId,
      eventType,
      payload: event,
      status: "pending"
    });

    try {
      const payloadEntity = event.payload || {};
      const subEntity = payloadEntity.subscription?.entity;
      const paymentEntity = payloadEntity.payment?.entity;
      const refundEntity = payloadEntity.refund?.entity;
      const invoiceEntity = payloadEntity.invoice?.entity;

      // Handle specific webhook event types
      switch (eventType) {
        case "payment.authorized": {
          if (paymentEntity) {
            await paymentEventRepository.create({
              eventType: "Payment Authorized",
              payload: paymentEntity
            });
          }
          break;
        }

        case "payment.captured": {
          if (paymentEntity) {
            const paymentTxId = paymentEntity.id;
            const existingPayment = await paymentRepository.findByTransactionId(paymentTxId);
            if (!existingPayment) {
              await paymentRepository.create({
                workspaceId: paymentEntity.notes?.workspace_id || "00000000-0000-0000-0000-000000000000",
                gateway: "razorpay",
                transactionId: paymentTxId,
                orderId: paymentEntity.order_id || null,
                razorpayOrderId: paymentEntity.order_id || null,
                razorpayPaymentId: paymentTxId,
                amount: paymentEntity.amount / 100,
                currency: paymentEntity.currency || "INR",
                status: "captured",
                paymentMethod: paymentEntity.method || "card",
                paidAt: new Date(paymentEntity.created_at * 1000)
              });
            } else {
              await paymentRepository.updateStatus(existingPayment.id, "captured");
            }

            await paymentEventRepository.create({
              eventType: "Payment Captured",
              payload: paymentEntity
            });
          }
          break;
        }

        case "payment.failed": {
          if (paymentEntity) {
            const paymentTxId = paymentEntity.id;
            const existingPayment = await paymentRepository.findByTransactionId(paymentTxId);
            if (existingPayment) {
              await paymentRepository.updateStatus(existingPayment.id, "failed", paymentEntity.error_description || "Payment failed");
            }

            await paymentEventRepository.create({
              eventType: "Payment Failed",
              payload: paymentEntity
            });
          }
          break;
        }

        case "refund.processed": {
          if (refundEntity) {
            const paymentTxId = refundEntity.payment_id;
            const existingPayment = await paymentRepository.findByRazorpayPaymentId(paymentTxId);
            if (existingPayment) {
              await paymentRepository.updateStatus(existingPayment.id, "refunded");
            }

            await paymentEventRepository.create({
              eventType: "Payment Refunded",
              payload: refundEntity
            });
          }
          break;
        }

        case "subscription.activated": {
          if (subEntity) {
            const sub = await subscriptionRepository.findByProviderId(subEntity.id);
            if (sub) {
              await subscriptionRepository.update(sub.id, { status: "active" });
            }
          }
          break;
        }

        case "subscription.charged": {
          if (subEntity) {
            const providerSubId = subEntity.id;
            const sub = await subscriptionRepository.findByProviderId(providerSubId);

            if (sub) {
              const workspaceId = sub.workspaceId;
              const now = new Date();
              const expiresAt = new Date(subEntity.current_end * 1000);

              const updatedSub = await subscriptionRepository.update(sub.id, {
                status: "active",
                startsAt: new Date(subEntity.current_start * 1000),
                expiresAt,
                cancelAt: subEntity.cancel_at_cycle_end ? new Date() : null
              });

              const paymentTxId = paymentEntity?.id || `txn_${Date.now()}`;
              const existingPayment = await paymentRepository.findByTransactionId(paymentTxId);

              if (!existingPayment) {
                const plan = await subscriptionPlanRepository.findById(sub.planId);
                const savedAddress = await billingAddressRepository.findByWorkspaceId(workspaceId);
                const amount = paymentEntity ? paymentEntity.amount / 100 : subEntity.amount / 100;
                const price = sub.billingCycle === "yearly" ? plan!.yearlyPrice : plan!.monthlyPrice;
                const discount = Math.max(0, price - amount);

                const taxCalculation = invoiceGeneratorService.calculateGst({
                  subtotal: price,
                  discount,
                  customerState: savedAddress?.state || "Karnataka"
                });

                const paymentRecord = await paymentRepository.create({
                  workspaceId,
                  subscriptionId: sub.id,
                  gateway: "razorpay",
                  transactionId: paymentTxId,
                  orderId: subEntity.order_id || null,
                  razorpayOrderId: subEntity.order_id || null,
                  razorpayPaymentId: paymentTxId,
                  amount: taxCalculation.total,
                  currency: "INR",
                  status: "captured",
                  paymentMethod: paymentEntity?.method || "card",
                  paidAt: now
                });

                const invoiceNumber = await invoiceRepository.getNextInvoiceNumber();
                const invoiceRecord = await invoiceRepository.create(
                  {
                    workspaceId,
                    subscriptionId: sub.id,
                    paymentId: paymentRecord.id,
                    invoiceNumber,
                    subtotal: taxCalculation.taxableAmount,
                    cgst: taxCalculation.cgst,
                    sgst: taxCalculation.sgst,
                    igst: taxCalculation.igst,
                    discount,
                    total: taxCalculation.total,
                    status: "paid",
                    billingDetails: savedAddress || {}
                  },
                  [
                    {
                      description: `${plan!.name} SaaS Subscription (${sub.billingCycle})`,
                      amount: taxCalculation.taxableAmount
                    }
                  ]
                );

                await paymentRepository.updateInvoice(paymentRecord.id, invoiceRecord.id);

                const features = await subscriptionPlanRepository.findPlanFeatures(plan!.id);
                const migrationsLimit = features.find(f => f.featureKey === "migrations_limit")?.featureValue || "5";
                const storageLimit = features.find(f => f.featureKey === "storage_limit_bytes")?.featureValue || "104857600";

                const billingPeriod = getBillingPeriod(updatedSub);
                await usageRepository.resetUsage(workspaceId, "migrations", parseInt(migrationsLimit, 10), billingPeriod.start, billingPeriod.end);
                await usageRepository.resetUsage(workspaceId, "storage_bytes", parseInt(storageLimit, 10), billingPeriod.start, billingPeriod.end);

                await queryDatabase(
                  `UPDATE workspaces 
                   SET plan_id = $1, storage_limit = $2, status = 'active'
                   WHERE id = $3::uuid`,
                  [plan!.slug, parseInt(storageLimit, 10), workspaceId]
                );
              }

              await paymentEventRepository.create({
                workspaceId: sub.workspaceId,
                eventType: "Subscription Renewed",
                payload: event
              });
            }
          }
          break;
        }

        case "subscription.cancelled": {
          if (subEntity) {
            const sub = await subscriptionRepository.findByProviderId(subEntity.id);
            if (sub) {
              await subscriptionRepository.update(sub.id, {
                status: "cancelled",
                expiresAt: new Date(subEntity.ended_at * 1000 || Date.now())
              });

              const freePlan = await subscriptionPlanRepository.findBySlug("free");
              const features = await subscriptionPlanRepository.findPlanFeatures(freePlan!.id);
              const storageLimit = features.find(f => f.featureKey === "storage_limit_bytes")?.featureValue || "104857600";

              await queryDatabase(
                `UPDATE workspaces 
                 SET plan_id = 'free', storage_limit = $1, status = 'active'
                 WHERE id = $2::uuid`,
                [parseInt(storageLimit, 10), sub.workspaceId]
              );

              await paymentEventRepository.create({
                workspaceId: sub.workspaceId,
                eventType: "Subscription Cancelled",
                payload: event
              });
            }
          }
          break;
        }

        case "subscription.completed": {
          if (subEntity) {
            const sub = await subscriptionRepository.findByProviderId(subEntity.id);
            if (sub) {
              await subscriptionRepository.update(sub.id, { status: "active" as any });
            }
          }
          break;
        }

        case "subscription.paused": {
          if (subEntity) {
            const sub = await subscriptionRepository.findByProviderId(subEntity.id);
            if (sub) {
              await subscriptionRepository.update(sub.id, { status: "suspended" as any });
            }
          }
          break;
        }

        case "subscription.resumed": {
          if (subEntity) {
            const sub = await subscriptionRepository.findByProviderId(subEntity.id);
            if (sub) {
              await subscriptionRepository.update(sub.id, { status: "active" });
            }
          }
          break;
        }

        case "invoice.paid": {
          if (invoiceEntity && invoiceEntity.number) {
            const existingInv = await invoiceRepository.findByInvoiceNumber(invoiceEntity.number);
            if (existingInv) {
              await invoiceRepository.updateStatus(existingInv.id, "paid");
            }
          }
          break;
        }

        case "invoice.expired": {
          if (invoiceEntity && invoiceEntity.number) {
            const existingInv = await invoiceRepository.findByInvoiceNumber(invoiceEntity.number);
            if (existingInv) {
              await invoiceRepository.updateStatus(existingInv.id, "cancelled");
            }
          }
          break;
        }

        default:
          logger.info(`Unhandled Webhook Event: ${eventType}`);
          break;
      }

      // Mark log as successfully processed
      await webhookLogRepository.create({
        eventId,
        eventType,
        payload: event,
        status: "processed"
      });

      return { success: true, message: `Webhook ${eventType} processed successfully.` };
    } catch (err: any) {
      logger.error(`Error processing webhook ${eventId}: ${err.message}`);
      await webhookLogRepository.create({
        eventId,
        eventType,
        payload: event,
        status: "failed",
        errorMessage: err.message
      });
      throw err;
    }
  }
}

export const webhookProcessorService = new WebhookProcessorService();
