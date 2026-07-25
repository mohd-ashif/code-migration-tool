import { PaymentGatewayFactory } from "../services/gateways/gateway.factory";
import { RazorpayGateway } from "../services/gateways/razorpay.gateway";
import { paymentService } from "../services/payment.service";
import { refundService } from "../services/refund.service";
import { subscriptionRenewalService } from "../services/subscription-renewal.service";
import { webhookProcessorService } from "../services/webhook-processor.service";
import { invoiceGeneratorService } from "../services/invoice-generator.service";

import { subscriptionRepository } from "../repositories/subscription.repository";
import { subscriptionPlanRepository } from "../repositories/subscription-plan.repository";
import { paymentRepository } from "../repositories/payment.repository";
import { paymentEventRepository } from "../repositories/payment-event.repository";
import { refundRepository } from "../repositories/refund.repository";
import { webhookLogRepository } from "../repositories/webhook-log.repository";
import { billingAddressRepository } from "../repositories/billing-address.repository";
import { invoiceRepository } from "../repositories/invoice.repository";
import { usageRepository } from "../repositories/usage.repository";

describe("Complete SaaS Payment System Integration Tests", () => {
  const mockWorkspaceId = "11111111-1111-1111-1111-111111111111";
  const razorpayGateway = new RazorpayGateway();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Gateway Factory & Abstraction Layer", () => {
    it("should resolve RazorpayGateway when requested", () => {
      const gateway = PaymentGatewayFactory.getGateway("razorpay");
      expect(gateway.name).toBe("razorpay");
    });

    it("should fallback to RazorpayGateway when gateway is unspecified", () => {
      const gateway = PaymentGatewayFactory.getGateway();
      expect(gateway.name).toBe("razorpay");
    });

    it("should verify webhook signature correctly with test secret", () => {
      const payload = JSON.stringify({ event: "payment.authorized" });
      const secret = "test_webhook_secret";
      const crypto = require("crypto");
      const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");

      const isValid = razorpayGateway.verifyWebhookSignature(payload, signature, secret);
      expect(isValid).toBe(true);
    });
  });

  describe("Checkout & Payment Flow", () => {
    it("should initiate checkout flow and return checkout details", async () => {
      jest.spyOn(subscriptionPlanRepository, "findBySlug").mockResolvedValueOnce({
        id: "plan-pro-id",
        name: "Pro Plan",
        slug: "pro",
        monthlyPrice: 999,
        yearlyPrice: 9999,
        currency: "INR",
        trialDays: 0,
        displayOrder: 1,
        isPublic: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      jest.spyOn(paymentEventRepository, "create").mockResolvedValue({
        id: "evt-1",
        workspaceId: mockWorkspaceId,
        eventType: "Payment Created",
        createdAt: new Date()
      });

      const checkoutResult = await paymentService.checkout({
        workspaceId: mockWorkspaceId,
        userId: "user-123",
        userEmail: "user@example.com",
        userName: "Test User",
        planSlug: "pro",
        billingCycle: "monthly",
        billingAddress: undefined,
        gatewayName: "razorpay"
      });

      expect(checkoutResult).toBeDefined();
      expect(checkoutResult.amount).toBe(117882); // ₹999 + 18% IGST in paise = 117882
      expect(checkoutResult.currency).toBe("INR");
    });

    it("should verify payment signature and activate subscription & tax invoice", async () => {
      jest.spyOn(billingAddressRepository, "findByWorkspaceId").mockResolvedValueOnce({
        workspaceId: mockWorkspaceId,
        companyName: "Acme Corp",
        addressLine1: "123 Tech Park",
        city: "Bangalore",
        state: "Karnataka",
        pinCode: "560103",
        country: "India",
        createdAt: new Date(),
        updatedAt: new Date()
      } as any);

      jest.spyOn(subscriptionRepository, "findByWorkspaceId").mockResolvedValueOnce({
        id: "sub-123",
        workspaceId: mockWorkspaceId,
        planId: "plan-pro-id",
        status: "trialing",
        billingCycle: "monthly",
        startsAt: new Date(),
        paymentProvider: "razorpay",
        createdAt: new Date(),
        updatedAt: new Date()
      } as any);

      jest.spyOn(subscriptionPlanRepository, "findBySlug").mockResolvedValueOnce({
        id: "plan-pro-id",
        name: "Pro Plan",
        slug: "pro",
        monthlyPrice: 999,
        yearlyPrice: 9999,
        currency: "INR",
        trialDays: 0,
        displayOrder: 1,
        isPublic: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      jest.spyOn(subscriptionRepository, "update").mockResolvedValueOnce({
        id: "sub-123",
        workspaceId: mockWorkspaceId,
        planId: "plan-pro-id",
        status: "active",
        billingCycle: "monthly",
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        paymentProvider: "razorpay",
        createdAt: new Date(),
        updatedAt: new Date()
      } as any);

      jest.spyOn(paymentRepository, "create").mockResolvedValueOnce({
        id: "pay-rec-1",
        workspaceId: mockWorkspaceId,
        subscriptionId: "sub-123",
        gateway: "razorpay",
        transactionId: "pay_mock_123",
        amount: 1178.82,
        currency: "INR",
        status: "captured",
        createdAt: new Date()
      });

      jest.spyOn(paymentEventRepository, "create").mockResolvedValue({
        id: "evt-2",
        workspaceId: mockWorkspaceId,
        eventType: "Payment Captured",
        createdAt: new Date()
      });

      jest.spyOn(invoiceRepository, "getNextInvoiceNumber").mockResolvedValueOnce("INV-2026-0001");
      jest.spyOn(invoiceRepository, "create").mockResolvedValueOnce({
        id: "inv-1",
        workspaceId: mockWorkspaceId,
        subscriptionId: "sub-123",
        paymentId: "pay-rec-1",
        invoiceNumber: "INV-2026-0001",
        subtotal: 999,
        cgst: 89.91,
        sgst: 89.91,
        igst: 0,
        discount: 0,
        total: 1178.82,
        currency: "INR",
        status: "paid",
        items: [],
        createdAt: new Date(),
        updatedAt: new Date()
      } as any);

      jest.spyOn(invoiceGeneratorService, "generatePdf").mockResolvedValueOnce("/scratch/invoices/INV-2026-0001.pdf");
      jest.spyOn(invoiceRepository, "updatePdfUrl").mockResolvedValueOnce();
      jest.spyOn(paymentRepository, "updateInvoice").mockResolvedValueOnce();
      jest.spyOn(subscriptionPlanRepository, "findPlanFeatures").mockResolvedValueOnce([
        { id: "f1", planId: "plan-pro-id", featureKey: "migrations_limit", featureValue: "-1", createdAt: new Date() }
      ]);
      jest.spyOn(usageRepository, "resetUsage").mockResolvedValue(undefined as any);

      const res = await paymentService.verifyPayment({
        workspaceId: mockWorkspaceId,
        paymentId: "pay_mock_123",
        signature: "mock_signature_success",
        subscriptionId: "sub_mock_123",
        planSlug: "pro"
      });

      expect(res.success).toBe(true);
      expect(res.subscription.status).toBe("active");
      expect(res.invoice.invoiceNumber).toBe("INV-2026-0001");
    });
  });

  describe("Refund Processing Service", () => {
    it("should process full refund via gateway, create refund record, and update status", async () => {
      jest.spyOn(paymentRepository, "findById").mockResolvedValueOnce({
        id: "pay-uuid-99",
        workspaceId: mockWorkspaceId,
        gateway: "razorpay",
        transactionId: "pay_mock_99",
        amount: 999,
        currency: "INR",
        status: "captured",
        createdAt: new Date()
      } as any);

      jest.spyOn(refundRepository, "create").mockResolvedValueOnce({
        id: "rfnd-123",
        paymentId: "pay-uuid-99",
        workspaceId: mockWorkspaceId,
        razorpayRefundId: "rfnd_mock_1",
        amount: 999,
        currency: "INR",
        status: "processed",
        reason: "Customer requested refund",
        createdAt: new Date(),
        updatedAt: new Date()
      });

      jest.spyOn(paymentRepository, "updateStatus").mockResolvedValueOnce();
      jest.spyOn(paymentEventRepository, "create").mockResolvedValueOnce({
        id: "evt-rfnd",
        paymentId: "pay-uuid-99",
        workspaceId: mockWorkspaceId,
        eventType: "Payment Refunded",
        createdAt: new Date()
      });

      const refundResult = await refundService.processRefund({
        paymentId: "pay-uuid-99",
        workspaceId: mockWorkspaceId,
        amount: 999,
        reason: "Customer requested refund"
      });

      expect(refundResult.success).toBe(true);
      expect(refundResult.refund.amount).toBe(999);
      expect(paymentRepository.updateStatus).toHaveBeenCalledWith("pay-uuid-99", "refunded");
    });
  });

  describe("Subscription Renewal Service", () => {
    it("should process manual subscription renewal cleanly", async () => {
      jest.spyOn(subscriptionRepository, "findByWorkspaceId").mockResolvedValueOnce({
        id: "sub-rnw-1",
        workspaceId: mockWorkspaceId,
        planId: "plan-pro-id",
        status: "active",
        billingCycle: "monthly",
        startsAt: new Date(),
        expiresAt: new Date(),
        paymentProvider: "razorpay",
        createdAt: new Date(),
        updatedAt: new Date()
      } as any);

      jest.spyOn(subscriptionPlanRepository, "findById").mockResolvedValueOnce({
        id: "plan-pro-id",
        name: "Pro Plan",
        slug: "pro",
        monthlyPrice: 999,
        yearlyPrice: 9999,
        currency: "INR",
        trialDays: 0,
        displayOrder: 1,
        isPublic: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      jest.spyOn(subscriptionRepository, "update").mockResolvedValueOnce({
        id: "sub-rnw-1",
        workspaceId: mockWorkspaceId,
        planId: "plan-pro-id",
        status: "active",
        billingCycle: "monthly",
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        paymentProvider: "razorpay",
        createdAt: new Date(),
        updatedAt: new Date()
      } as any);

      jest.spyOn(billingAddressRepository, "findByWorkspaceId").mockResolvedValueOnce(null);
      jest.spyOn(paymentRepository, "create").mockResolvedValueOnce({
        id: "pay-rnw-p",
        workspaceId: mockWorkspaceId,
        gateway: "razorpay",
        transactionId: "rnw_123",
        amount: 1178.82,
        currency: "INR",
        status: "captured",
        createdAt: new Date()
      });

      jest.spyOn(invoiceRepository, "getNextInvoiceNumber").mockResolvedValueOnce("INV-2026-0002");
      jest.spyOn(invoiceRepository, "create").mockResolvedValueOnce({
        id: "inv-rnw-2",
        workspaceId: mockWorkspaceId,
        invoiceNumber: "INV-2026-0002",
        subtotal: 999,
        cgst: 89.91,
        sgst: 89.91,
        igst: 0,
        discount: 0,
        total: 1178.82,
        currency: "INR",
        status: "paid",
        items: [],
        createdAt: new Date(),
        updatedAt: new Date()
      } as any);

      jest.spyOn(subscriptionPlanRepository, "findPlanFeatures").mockResolvedValueOnce([]);
      jest.spyOn(usageRepository, "resetUsage").mockResolvedValue(undefined as any);
      jest.spyOn(paymentEventRepository, "create").mockResolvedValue({
        id: "evt-rnw",
        workspaceId: mockWorkspaceId,
        eventType: "Subscription Renewed",
        createdAt: new Date()
      });

      const renewal = await subscriptionRenewalService.renewSubscription({ workspaceId: mockWorkspaceId });
      expect(renewal.success).toBe(true);
      expect(renewal.subscription.status).toBe("active");
    });
  });

  describe("Webhook Processor & Idempotency", () => {
    it("should process webhook idempotently and skip duplicate events", async () => {
      const eventId = "evt_razorpay_mock_100";
      const payload = {
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_rzp_100",
              amount: 117882,
              currency: "INR",
              notes: { workspaceId: mockWorkspaceId, planSlug: "pro" }
            }
          }
        }
      };

      jest.spyOn(webhookLogRepository, "findByEventId").mockResolvedValueOnce(null);
      jest.spyOn(webhookLogRepository, "create").mockResolvedValueOnce({
        id: "wlog-1",
        eventId,
        eventType: "payment.captured",
        payload,
        status: "processed",
        createdAt: new Date()
      });

      const rawBody = JSON.stringify(payload);
      const crypto = require("crypto");
      const signature = crypto.createHmac("sha256", "razorpay_webhook_secret_12345").update(rawBody).digest("hex");

      // Mock webhook signature verification to pass
      jest.spyOn(RazorpayGateway.prototype, "verifyWebhookSignature").mockReturnValue(true);

      const res1 = await webhookProcessorService.processRazorpayWebhook({
        rawBody,
        signature,
        body: { ...payload, id: eventId }
      });
      expect(res1.success).toBe(true);

      // Test duplicate event detection
      jest.spyOn(webhookLogRepository, "findByEventId").mockResolvedValueOnce({
        id: "wlog-1",
        eventId,
        eventType: "payment.captured",
        payload,
        status: "processed",
        createdAt: new Date()
      });

      const res2 = await webhookProcessorService.processRazorpayWebhook({
        rawBody,
        signature,
        body: { ...payload, id: eventId }
      });
      expect(res2.success).toBe(true);
      expect(res2.message).toContain("already processed");
    });
  });
});
