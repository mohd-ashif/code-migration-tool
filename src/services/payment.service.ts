import fs from "fs";
import { PaymentGatewayFactory } from "./gateways/gateway.factory";
import { subscriptionPlanRepository } from "../repositories/subscription-plan.repository";
import { subscriptionRepository } from "../repositories/subscription.repository";
import { paymentRepository } from "../repositories/payment.repository";
import { paymentEventRepository } from "../repositories/payment-event.repository";
import { billingAddressRepository } from "../repositories/billing-address.repository";
import { couponRepository } from "../repositories/coupon.repository";
import { invoiceRepository } from "../repositories/invoice.repository";
import { usageRepository } from "../repositories/usage.repository";
import { invoiceGeneratorService } from "./invoice-generator.service";
import { cloudinaryService } from "./cloudinary.service";
import { getBillingPeriod } from "../middleware/billing.middleware";
import { queryDatabase } from "../lib/database";
import { logger } from "../utils/logger";
import { HttpError } from "../middleware/error.middleware";
import { config } from "../config";

export class PaymentService {
  /**
   * Initiate Checkout flow: create Gateway Order or Subscription and record initial audit event
   */
  async checkout(params: {
    workspaceId: string;
    userId: string;
    userEmail: string;
    userName: string;
    planSlug: string;
    billingCycle: 'monthly' | 'yearly';
    billingAddress: any;
    couponCode?: string;
    gatewayName?: string;
  }) {
    const gateway = PaymentGatewayFactory.getGateway(params.gatewayName || "razorpay");

    // 1. Save / update billing address
    if (params.billingAddress) {
      await billingAddressRepository.save({
        workspaceId: params.workspaceId,
        companyName: params.billingAddress.companyName || "",
        gstNumber: params.billingAddress.gstNumber || "",
        addressLine1: params.billingAddress.addressLine1 || "",
        addressLine2: params.billingAddress.addressLine2 || "",
        city: params.billingAddress.city || "",
        state: params.billingAddress.state || "Karnataka",
        pinCode: params.billingAddress.pinCode || "",
        country: params.billingAddress.country || "India",
        phone: params.billingAddress.phone || "",
        email: params.billingAddress.email || params.userEmail,
      });
    }

    // 2. Fetch Plan details
    const plan = await subscriptionPlanRepository.findBySlug(params.planSlug);
    if (!plan || !plan.isActive) {
      throw new HttpError(400, "Invalid or inactive subscription plan.");
    }

    // 3. Compute price & apply coupon discount
    let basePrice = params.billingCycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
    let discount = 0;

    if (params.couponCode) {
      const coupon = await couponRepository.findByCode(params.couponCode);
      if (coupon && coupon.isActive) {
        if (coupon.discountType === "percentage") {
          discount = (basePrice * coupon.discountValue) / 100;
        } else {
          discount = coupon.discountValue;
        }
        discount = Math.min(basePrice, discount);
        await couponRepository.incrementRedemptions(coupon.id);
      }
    }

    const netAmount = Math.max(0, basePrice - discount);

    // 4. Razorpay Key and Sandbox check
    const razorpayKeyId = config.RAZORPAY_KEY_ID || "rzp_test_mockkey";
    const isMock = razorpayKeyId === "rzp_test_mockkey" || razorpayKeyId === "rzp_test_placeholder";

    if (isMock) {
      const mockSubId = `sub_mock_${Math.random().toString(36).substring(2, 12)}`;
      
      await paymentEventRepository.create({
        workspaceId: params.workspaceId,
        eventType: "Payment Created",
        payload: {
          gateway: gateway.name,
          planSlug: params.planSlug,
          billingCycle: params.billingCycle,
          amount: netAmount,
          mock: true
        }
      });

      return {
        isMock: true,
        subscriptionId: mockSubId,
        orderId: `order_mock_${Math.random().toString(36).substring(2, 12)}`,
        razorpayKeyId,
        amount: netAmount * 100,
        currency: "INR",
        planName: plan.name,
        customerName: params.userName,
        customerEmail: params.userEmail,
        customerPhone: params.billingAddress?.phone || ""
      };
    }

    // 5. Live Gateway Call: create plan on Razorpay & subscription
    try {
      const razorpayPlanId = await gateway.createPlan({
        name: plan.name,
        amount: netAmount,
        billingCycle: params.billingCycle
      });

      const customerId = await gateway.createCustomer({
        name: params.userName,
        email: params.userEmail,
        phone: params.billingAddress?.phone
      });

      const subscription = await gateway.createSubscription({
        planId: razorpayPlanId,
        customerId,
        totalCount: params.billingCycle === "yearly" ? 10 : 120
      });

      // Record audit event
      await paymentEventRepository.create({
        workspaceId: params.workspaceId,
        eventType: "Payment Created",
        payload: {
          gateway: gateway.name,
          subscriptionId: subscription.id,
          planSlug: params.planSlug,
          billingCycle: params.billingCycle,
          amount: netAmount
        }
      });

      return {
        isMock: false,
        subscriptionId: subscription.id,
        razorpayKeyId,
        amount: netAmount * 100,
        currency: "INR",
        planName: plan.name,
        customerName: params.userName,
        customerEmail: params.userEmail,
        customerPhone: params.billingAddress?.phone || ""
      };
    } catch (gatewayErr: any) {
      logger.warn(`Razorpay live gateway unauthorized/failed (${gatewayErr.message}). Falling back to Simulated Sandbox Mode.`);
      
      const mockSubId = `sub_mock_${Math.random().toString(36).substring(2, 12)}`;
      
      await paymentEventRepository.create({
        workspaceId: params.workspaceId,
        eventType: "Payment Created",
        payload: {
          gateway: gateway.name,
          planSlug: params.planSlug,
          billingCycle: params.billingCycle,
          amount: netAmount,
          mock: true,
          fallbackReason: gatewayErr.message
        }
      });

      return {
        isMock: true,
        subscriptionId: mockSubId,
        orderId: `order_mock_${Math.random().toString(36).substring(2, 12)}`,
        razorpayKeyId,
        amount: netAmount * 100,
        currency: "INR",
        planName: plan.name,
        customerName: params.userName,
        customerEmail: params.userEmail,
        customerPhone: params.billingAddress?.phone || ""
      };
    }
  }

  /**
   * Verify Payment signature, activate subscription, record payments & events, generate GST invoice
   */
  async verifyPayment(params: {
    workspaceId: string;
    paymentId: string;
    signature: string;
    subscriptionId?: string;
    orderId?: string;
    planSlug?: string;
    gatewayName?: string;
  }) {
    const gateway = PaymentGatewayFactory.getGateway(params.gatewayName || "razorpay");

    // 1. Verify Gateway Signature
    const isValid = gateway.verifyPaymentSignature({
      paymentId: params.paymentId,
      subscriptionId: params.subscriptionId,
      orderId: params.orderId,
      signature: params.signature
    });

    if (!isValid) {
      await paymentEventRepository.create({
        workspaceId: params.workspaceId,
        eventType: "Payment Failed",
        payload: {
          reason: "Invalid payment signature",
          paymentId: params.paymentId
        }
      });
      throw new HttpError(400, "Invalid payment signature verification.");
    }

    // Record Authorized & Captured events
    await paymentEventRepository.create({
      workspaceId: params.workspaceId,
      eventType: "Payment Authorized",
      payload: { paymentId: params.paymentId, subscriptionId: params.subscriptionId }
    });

    // 2. Fetch active billing address
    const savedAddress = await billingAddressRepository.findByWorkspaceId(params.workspaceId);
    const customerState = savedAddress?.state || "Karnataka";

    // 3. Resolve Subscription details
    let existingSub = await subscriptionRepository.findByWorkspaceId(params.workspaceId);
    let plan = await subscriptionPlanRepository.findBySlug(params.planSlug || "pro");

    if (!plan) {
      plan = (await subscriptionPlanRepository.findBySlug("pro"))!;
    }

    const now = new Date();
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    if (existingSub) {
      existingSub = await subscriptionRepository.update(existingSub.id, {
        planId: plan.id,
        status: "active",
        startsAt: now,
        expiresAt,
        providerSubscriptionId: params.subscriptionId || existingSub.providerSubscriptionId
      });
    } else {
      existingSub = await subscriptionRepository.create({
        workspaceId: params.workspaceId,
        planId: plan.id,
        status: "active",
        billingCycle: "monthly",
        startsAt: now,
        expiresAt,
        paymentProvider: gateway.name,
        providerSubscriptionId: params.subscriptionId || `sub_gen_${Date.now()}`
      });
    }

    // 4. Calculate GST Tax breakdown
    const basePrice = existingSub.billingCycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
    const taxCalculation = invoiceGeneratorService.calculateGst({
      subtotal: basePrice,
      discount: 0,
      customerState
    });

    // 5. Store Payment Record
    const paymentRecord = await paymentRepository.create({
      workspaceId: params.workspaceId,
      subscriptionId: existingSub.id,
      gateway: gateway.name,
      transactionId: params.paymentId,
      orderId: params.orderId || params.subscriptionId || null,
      razorpayOrderId: params.orderId || null,
      razorpayPaymentId: params.paymentId,
      razorpaySignature: params.signature,
      amount: taxCalculation.total,
      currency: "INR",
      status: "captured",
      paymentMethod: "card",
      paidAt: now
    });

    await paymentEventRepository.create({
      paymentId: paymentRecord.id,
      workspaceId: params.workspaceId,
      eventType: "Payment Captured",
      payload: {
        paymentId: paymentRecord.id,
        transactionId: params.paymentId,
        amount: taxCalculation.total
      }
    });

    // 6. Generate sequential Tax Invoice PDF
    const invoiceNumber = await invoiceRepository.getNextInvoiceNumber();
    const invoiceRecord = await invoiceRepository.create(
      {
        workspaceId: params.workspaceId,
        subscriptionId: existingSub.id,
        paymentId: paymentRecord.id,
        invoiceNumber,
        subtotal: taxCalculation.taxableAmount,
        cgst: taxCalculation.cgst,
        sgst: taxCalculation.sgst,
        igst: taxCalculation.igst,
        discount: 0,
        total: taxCalculation.total,
        status: "paid",
        billingDetails: savedAddress || {}
      },
      [
        {
          description: `${plan.name} Plan SaaS Subscription (${existingSub.billingCycle})`,
          amount: taxCalculation.taxableAmount
        }
      ]
    );

    // Generate PDF file
    try {
      const pdfPath = await invoiceGeneratorService.generatePdf(
        { ...invoiceRecord, items: [{ id: "1", invoiceId: invoiceRecord.id, description: `${plan.name} Subscription`, amount: taxCalculation.taxableAmount, createdAt: new Date() }] },
        savedAddress || { workspaceId: params.workspaceId, companyName: "Customer", addressLine1: "N/A", city: "Bangalore", state: "Karnataka", pinCode: "560103", country: "India", createdAt: new Date(), updatedAt: new Date() }
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
      logger.error(`PDF Invoice generation warning: ${pdfErr}`);
    }

    await paymentRepository.updateInvoice(paymentRecord.id, invoiceRecord.id);

    // 7. Reset workspace usage limits
    const features = await subscriptionPlanRepository.findPlanFeatures(plan.id);
    const migrationsLimit = features.find(f => f.featureKey === "migrations_limit")?.featureValue || "5";
    const storageLimit = features.find(f => f.featureKey === "storage_limit_bytes")?.featureValue || "104857600";

    const billingPeriod = getBillingPeriod(existingSub);
    await usageRepository.resetUsage(params.workspaceId, "migrations", parseInt(migrationsLimit, 10), billingPeriod.start, billingPeriod.end);
    await usageRepository.resetUsage(params.workspaceId, "storage_bytes", parseInt(storageLimit, 10), billingPeriod.start, billingPeriod.end);

    // Update workspace storage and active status
    await queryDatabase(
      `UPDATE workspaces 
       SET plan_id = $1, storage_limit = $2, status = 'active'
       WHERE id = $3::uuid`,
      [plan.slug, parseInt(storageLimit, 10), params.workspaceId]
    );

    return {
      success: true,
      message: "Payment verified successfully. Subscription activated.",
      subscription: existingSub,
      payment: paymentRecord,
      invoice: invoiceRecord
    };
  }

  /**
   * List payment history with search, filters, pagination
   */
  async listPayments(params: {
    workspaceId: string;
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    return paymentRepository.listForWorkspaceWithFilter(params);
  }

  /**
   * Fetch single payment details
   */
  async getPaymentById(paymentId: string, workspaceId: string) {
    const payment = await paymentRepository.findById(paymentId);
    if (!payment || payment.workspaceId !== workspaceId) {
      throw new HttpError(404, "Payment record not found.");
    }
    const events = await paymentEventRepository.listForPayment(paymentId);
    return { payment, events };
  }

  /**
   * Retry failed payment
   */
  async retryPayment(paymentId: string, workspaceId: string) {
    const payment = await paymentRepository.findById(paymentId);
    if (!payment || payment.workspaceId !== workspaceId) {
      throw new HttpError(404, "Payment not found.");
    }

    if (payment.status === "captured") {
      return { success: true, message: "Payment is already completed.", payment };
    }

    // Log payment retry event
    await paymentEventRepository.create({
      paymentId: payment.id,
      workspaceId,
      eventType: "Payment Retry Initiated",
      payload: { previousStatus: payment.status, amount: payment.amount }
    });

    const gateway = PaymentGatewayFactory.getGateway(payment.gateway || "razorpay");
    const order = await gateway.createOrder({
      amount: payment.amount,
      currency: payment.currency || "INR",
      receipt: `retry_${payment.id.substring(0, 8)}`
    });

    return {
      success: true,
      message: "Retry payment order created.",
      orderId: order.id,
      amount: order.amount * 100,
      currency: order.currency,
      paymentId: payment.id
    };
  }
}

export const paymentService = new PaymentService();
