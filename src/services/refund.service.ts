import { PaymentGatewayFactory } from "./gateways/gateway.factory";
import { paymentRepository } from "../repositories/payment.repository";
import { refundRepository } from "../repositories/refund.repository";
import { paymentEventRepository } from "../repositories/payment-event.repository";
import { invoiceRepository } from "../repositories/invoice.repository";
import { HttpError } from "../middleware/error.middleware";
import { logger } from "../utils/logger";

export class RefundService {
  async processRefund(params: {
    paymentId: string;
    workspaceId?: string;
    amount?: number;
    reason?: string;
    isAdmin?: boolean;
  }) {
    const payment = await paymentRepository.findById(params.paymentId);
    if (!payment) {
      throw new HttpError(404, "Payment record not found.");
    }

    if (params.workspaceId && payment.workspaceId !== params.workspaceId && !params.isAdmin) {
      throw new HttpError(403, "Forbidden: You do not have permission to refund this payment.");
    }

    if (payment.status === "refunded") {
      throw new HttpError(400, "Payment has already been refunded.");
    }

    const refundAmount = params.amount || payment.amount;
    if (refundAmount > payment.amount) {
      throw new HttpError(400, "Refund amount cannot exceed original payment amount.");
    }

    const gateway = PaymentGatewayFactory.getGateway(payment.gateway || "razorpay");

    logger.info(`Processing refund for payment ${payment.id} via ${gateway.name} for ₹${refundAmount}`);
    
    // 1. Call Gateway Refund API
    const gatewayRefund = await gateway.refundPayment(
      (payment as any).razorpayPaymentId || payment.transactionId,
      refundAmount
    );

    // 2. Insert Refund record
    const refundRecord = await refundRepository.create({
      paymentId: payment.id,
      workspaceId: payment.workspaceId,
      razorpayRefundId: gatewayRefund.id,
      amount: refundAmount,
      currency: payment.currency || "INR",
      status: "processed",
      reason: params.reason || "Customer request / Admin refund"
    });

    // 3. Update payment status to refunded
    await paymentRepository.updateStatus(payment.id, "refunded");

    // 4. Log Payment Refunded audit event
    await paymentEventRepository.create({
      paymentId: payment.id,
      workspaceId: payment.workspaceId,
      eventType: "Payment Refunded",
      payload: {
        refundId: refundRecord.id,
        amount: refundAmount,
        reason: params.reason
      }
    });

    // 5. Update invoice status to cancelled/refunded if invoice exists
    if (payment.invoiceId) {
      try {
        await invoiceRepository.updateStatus(payment.invoiceId, "cancelled");
      } catch (e) {
        logger.warn(`Could not update invoice status for refund: ${e}`);
      }
    }

    return {
      success: true,
      message: "Refund processed successfully.",
      refund: refundRecord
    };
  }

  async getRefundsForWorkspace(workspaceId: string) {
    return refundRepository.listForWorkspace(workspaceId);
  }
}

export const refundService = new RefundService();
