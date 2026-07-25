import { Request, Response, NextFunction } from "express";
import { paymentService } from "../services/payment.service";
import { refundService } from "../services/refund.service";
import { HttpError } from "../middleware/error.middleware";

export class PaymentController {
  async checkout(req: Request, res: Response, next: NextFunction) {
    try {
      const workspaceId = (req as any).workspaceId;
      const user = (req as any).user || {};
      const { planSlug, billingCycle, billingAddress, couponCode, gatewayName } = req.body;

      if (!workspaceId) {
        throw new HttpError(400, "Workspace ID is required.");
      }
      if (!planSlug) {
        throw new HttpError(400, "Plan slug is required.");
      }

      const checkoutResult = await paymentService.checkout({
        workspaceId,
        userId: user.id || "00000000-0000-0000-0000-000000000000",
        userEmail: user.email || "user@example.com",
        userName: user.name || "Valued User",
        planSlug,
        billingCycle: billingCycle || "monthly",
        billingAddress,
        couponCode,
        gatewayName
      });

      res.json({ success: true, checkout: checkoutResult });
    } catch (err) {
      next(err);
    }
  }

  async verify(req: Request, res: Response, next: NextFunction) {
    try {
      const workspaceId = (req as any).workspaceId;
      const { paymentId, signature, subscriptionId, orderId, planSlug, gatewayName } = req.body;

      if (!workspaceId) {
        throw new HttpError(400, "Workspace ID is required.");
      }
      if (!paymentId || !signature) {
        throw new HttpError(400, "paymentId and signature are required.");
      }

      const result = await paymentService.verifyPayment({
        workspaceId,
        paymentId,
        signature,
        subscriptionId,
        orderId,
        planSlug,
        gatewayName
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async getPayments(req: Request, res: Response, next: NextFunction) {
    try {
      const workspaceId = (req as any).workspaceId;
      const { search, status, page, limit } = req.query;

      if (!workspaceId) {
        throw new HttpError(400, "Workspace ID is required.");
      }

      const result = await paymentService.listPayments({
        workspaceId,
        search: search as string,
        status: status as string,
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 10
      });

      res.json({
        success: true,
        payments: result.payments,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: Math.ceil(result.total / result.limit) || 1
        }
      });
    } catch (err) {
      next(err);
    }
  }

  async getPaymentById(req: Request, res: Response, next: NextFunction) {
    try {
      const workspaceId = (req as any).workspaceId;
      const { id } = req.params;

      if (!workspaceId || !id) {
        throw new HttpError(400, "Workspace ID and Payment ID are required.");
      }

      const result = await paymentService.getPaymentById(id, workspaceId);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  async refundPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const workspaceId = (req as any).workspaceId;
      const { id } = req.params;
      const { amount, reason } = req.body;

      if (!id) {
        throw new HttpError(400, "Payment ID is required.");
      }

      const result = await refundService.processRefund({
        paymentId: id,
        workspaceId,
        amount: amount ? parseFloat(amount) : undefined,
        reason
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async retryPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const workspaceId = (req as any).workspaceId;
      const { id } = req.params;

      if (!workspaceId || !id) {
        throw new HttpError(400, "Workspace ID and Payment ID are required.");
      }

      const result = await paymentService.retryPayment(id, workspaceId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}

export const paymentController = new PaymentController();
