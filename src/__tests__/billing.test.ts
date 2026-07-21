import { invoiceGeneratorService } from "../services/invoice-generator.service";
import { razorpayService } from "../services/razorpay.service";
import { getBillingPeriod } from "../middleware/billing.middleware";
import { billingController } from "../controllers/billing.controller";
import { subscriptionRepository } from "../repositories/subscription.repository";
import { subscriptionPlanRepository } from "../repositories/subscription-plan.repository";
import { paymentRepository } from "../repositories/payment.repository";
import { couponRepository } from "../repositories/coupon.repository";
import { billingAddressRepository } from "../repositories/billing-address.repository";

describe("SaaS Billing & Subscription Tests", () => {
  
  describe("GST Tax Calculations", () => {
    
    it("should apply CGST (9%) and SGST (9%) for intra-state (Karnataka) customers", () => {
      const subtotal = 1000.00;
      const discount = 100.00; // Net taxable = 900.00
      const customerState = "Karnataka";

      const result = invoiceGeneratorService.calculateGst({
        subtotal,
        discount,
        customerState
      });

      expect(result.taxableAmount).toBe(900.00);
      expect(result.cgst).toBe(81.00); // 9% of 900
      expect(result.sgst).toBe(81.00); // 9% of 900
      expect(result.igst).toBe(0.00);
      expect(result.total).toBe(1062.00); // 900 + 81 + 81
    });

    it("should apply IGST (18%) for inter-state (e.g. Maharashtra) customers", () => {
      const subtotal = 1000.00;
      const discount = 0.00; // Net taxable = 1000.00
      const customerState = "Maharashtra";

      const result = invoiceGeneratorService.calculateGst({
        subtotal,
        discount,
        customerState
      });

      expect(result.taxableAmount).toBe(1000.00);
      expect(result.cgst).toBe(0.00);
      expect(result.sgst).toBe(0.00);
      expect(result.igst).toBe(180.00); // 18% of 1000
      expect(result.total).toBe(1180.00); // 1000 + 180
    });
  });

  describe("Razorpay Signature Checks", () => {
    
    it("should verify payment signature correctly using sha256 HMAC", () => {
      const paymentId = "pay_Npl7520t4wO1pZ";
      const subscriptionId = "sub_Npl532t5lQpXy9";
      
      // Let's compute a valid signature manually using key secret
      const keySecret = "v4jFQyWexS7JYHS470MGf6nN";
      const crypto = require("crypto");
      const data = `${paymentId}|${subscriptionId}`;
      const expectedSignature = crypto
        .createHmac("sha256", keySecret)
        .update(data)
        .digest("hex");

      const isValid = razorpayService.verifyPaymentSignature({
        paymentId,
        signature: expectedSignature,
        subscriptionId
      });

      expect(isValid).toBe(true);
    });

    it("should reject invalid payment signatures", () => {
      const isValid = razorpayService.verifyPaymentSignature({
        paymentId: "pay_111",
        signature: "invalid_sig",
        subscriptionId: "sub_222"
      });

      expect(isValid).toBe(false);
    });
  });

  describe("Billing Middleware Helpers", () => {
    
    it("should fallback to calendar month period dates if subscription is not active", () => {
      const period = getBillingPeriod(null);
      const now = new Date();
      
      expect(period.start.getFullYear()).toBe(now.getFullYear());
      expect(period.start.getMonth()).toBe(now.getMonth());
      expect(period.start.getDate()).toBe(1);
    });

    it("should respect active subscription dates when computing billing period boundaries", () => {
      const start = new Date("2026-07-01T00:00:00Z");
      const end = new Date("2026-08-01T00:00:00Z");
      const activeSub = {
        status: "active",
        startsAt: start,
        expiresAt: end
      };

      const period = getBillingPeriod(activeSub);
      expect(period.start.getTime()).toBe(start.getTime());
      expect(period.end.getTime()).toBe(end.getTime());
    });
  });

  describe("Billing Controller & Admin Endpoints", () => {
    let mockReq: any;
    let mockRes: any;
    let mockNext: any;

    beforeEach(() => {
      mockReq = {
        workspaceId: "00000000-0000-0000-0000-000000000002",
        userId: "00000000-0000-0000-0000-000000000003",
        body: {},
        params: {},
        query: {}
      };
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn()
      };
      mockNext = jest.fn();
    });

    it("should fetch subscription plans successfully", async () => {
      const spy = jest.spyOn(subscriptionPlanRepository, "findAllActive").mockResolvedValueOnce([
        { id: "p1", name: "Free", slug: "free", monthlyPrice: 0, yearlyPrice: 0, currency: "INR", trialDays: 0, displayOrder: 0, isPublic: true, isActive: true, createdAt: new Date(), updatedAt: new Date() }
      ]);
      jest.spyOn(subscriptionPlanRepository, "findPlanFeatures").mockResolvedValueOnce([]);

      await billingController.getPlans(mockReq, mockRes, mockNext);

      expect(spy).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          plans: expect.arrayContaining([
            expect.objectContaining({ slug: "free" })
          ])
        })
      );
    });

    it("should fetch payments list for active workspace", async () => {
      const spy = jest.spyOn(paymentRepository, "listForWorkspace").mockResolvedValueOnce([
        { id: "pay-123", workspaceId: "ws-1", gateway: "razorpay", transactionId: "txn-1", amount: 999, currency: "INR", status: "captured", createdAt: new Date() }
      ]);

      await billingController.getPayments(mockReq, mockRes, mockNext);

      expect(spy).toHaveBeenCalledWith(mockReq.workspaceId);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          payments: expect.arrayContaining([
            expect.objectContaining({ id: "pay-123" })
          ])
        })
      );
    });

    it("should validate and apply coupon successfully", async () => {
      mockReq.body.code = "WELCOME100";
      const spy = jest.spyOn(couponRepository, "findByCode").mockResolvedValueOnce({
        id: "c-123",
        code: "WELCOME100",
        discountType: "fixed",
        discountValue: 100,
        duration: "once",
        timesRedeemed: 0,
        isActive: true,
        createdAt: new Date()
      });

      await billingController.applyCoupon(mockReq, mockRes, mockNext);

      expect(spy).toHaveBeenCalledWith("WELCOME100");
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          coupon: expect.objectContaining({
            code: "WELCOME100",
            discountValue: 100
          })
        })
      );
    });

    it("should create plan and details from admin controller", async () => {
      mockReq.body = {
        name: "Ultimate Plan",
        slug: "ultimate",
        monthlyPrice: 5000,
        yearlyPrice: 50000,
        features: [
          { key: "migrations_limit", value: "-1" }
        ]
      };

      const spyPlan = jest.spyOn(subscriptionPlanRepository, "savePlan").mockResolvedValueOnce({
        id: "p-ultimate",
        name: "Ultimate Plan",
        slug: "ultimate",
        monthlyPrice: 5000,
        yearlyPrice: 50000,
        currency: "INR",
        trialDays: 0,
        displayOrder: 4,
        isPublic: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const spyFeature = jest.spyOn(subscriptionPlanRepository, "saveFeature").mockResolvedValueOnce({
        id: "f-1",
        planId: "p-ultimate",
        featureKey: "migrations_limit",
        featureValue: "-1",
        createdAt: new Date()
      });

      await billingController.adminCreatePlan(mockReq, mockRes, mockNext);

      expect(spyPlan).toHaveBeenCalled();
      expect(spyFeature).toHaveBeenCalledWith("p-ultimate", "migrations_limit", "-1");
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    it("should process payment refund from admin controller", async () => {
      mockReq.params.id = "pay-uuid";
      mockReq.body = { amount: 500 };

      jest.spyOn(paymentRepository, "findById").mockResolvedValueOnce({
        id: "pay-uuid",
        workspaceId: "ws-1",
        gateway: "razorpay",
        transactionId: "txn_payment",
        amount: 1000,
        currency: "INR",
        status: "captured",
        createdAt: new Date()
      });

      const refundSpy = jest.spyOn(razorpayService, "refundPayment").mockResolvedValueOnce({
        id: "rfnd_123",
        amount: 50000
      });

      const statusSpy = jest.spyOn(paymentRepository, "updateStatus").mockResolvedValueOnce();

      await billingController.adminRefundPayment(mockReq, mockRes, mockNext);

      expect(refundSpy).toHaveBeenCalledWith("txn_payment", 500);
      expect(statusSpy).toHaveBeenCalledWith("pay-uuid", "refunded");
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Payment refunded successfully."
        })
      );
    });

    it("should fetch subscription details along with billing address", async () => {
      const spySub = jest.spyOn(subscriptionRepository, "findByWorkspaceId").mockResolvedValueOnce(null);
      const spyAddress = jest.spyOn(billingAddressRepository, "findByWorkspaceId").mockResolvedValueOnce({
        workspaceId: "ws-1",
        companyName: "Acme Corp",
        addressLine1: "123 ORR",
        city: "Bangalore",
        state: "Karnataka",
        pinCode: "560103",
        country: "India",
        createdAt: new Date(),
        updatedAt: new Date()
      });
      jest.spyOn(subscriptionPlanRepository, "findBySlug").mockResolvedValueOnce({
        id: "free-id", name: "Free Plan", slug: "free", monthlyPrice: 0, yearlyPrice: 0, currency: "INR", trialDays: 0, displayOrder: 0, isPublic: true, isActive: true, createdAt: new Date(), updatedAt: new Date()
      });

      await billingController.getSubscription(mockReq, mockRes, mockNext);

      expect(spySub).toHaveBeenCalledWith(mockReq.workspaceId);
      expect(spyAddress).toHaveBeenCalledWith(mockReq.workspaceId);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          subscription: expect.objectContaining({
            billingDetails: expect.objectContaining({
              companyName: "Acme Corp"
            })
          })
        })
      );
    });

    it("should save billing address successfully", async () => {
      mockReq.body = {
        companyName: "Acme Corp",
        addressLine1: "123 ORR",
        city: "Bangalore",
        state: "Karnataka",
        pinCode: "560103"
      };

      const spyAddress = jest.spyOn(billingAddressRepository, "save").mockResolvedValueOnce({
        workspaceId: "ws-1",
        companyName: "Acme Corp",
        addressLine1: "123 ORR",
        city: "Bangalore",
        state: "Karnataka",
        pinCode: "560103",
        country: "India",
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await billingController.saveBillingAddress(mockReq, mockRes, mockNext);

      expect(spyAddress).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          address: expect.objectContaining({
            companyName: "Acme Corp"
          })
        })
      );
    });
  });
});
