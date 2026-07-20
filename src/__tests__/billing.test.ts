import { invoiceGeneratorService } from "../services/invoice-generator.service";
import { razorpayService } from "../services/razorpay.service";
import { getBillingPeriod } from "../middleware/billing.middleware";

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
});
