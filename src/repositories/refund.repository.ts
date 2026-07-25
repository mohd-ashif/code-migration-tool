import { queryDatabase } from "../lib/database";

export interface Refund {
  id: string;
  paymentId: string;
  workspaceId: string;
  razorpayRefundId?: string;
  amount: number;
  currency: string;
  status: string; // processed, pending, failed
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class RefundRepository {
  async create(params: {
    paymentId: string;
    workspaceId: string;
    razorpayRefundId?: string;
    amount: number;
    currency?: string;
    status?: string;
    reason?: string;
  }): Promise<Refund> {
    const rows = await queryDatabase(
      `INSERT INTO refunds (payment_id, workspace_id, razorpay_refund_id, amount, currency, status, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, payment_id as "paymentId", workspace_id as "workspaceId", razorpay_refund_id as "razorpayRefundId",
                 amount, currency, status, reason, created_at as "createdAt", updated_at as "updatedAt"`,
      [
        params.paymentId,
        params.workspaceId,
        params.razorpayRefundId || null,
        params.amount,
        params.currency || "INR",
        params.status || "processed",
        params.reason || null
      ]
    );
    return rows[0];
  }

  async findById(id: string): Promise<Refund | null> {
    const rows = await queryDatabase(
      `SELECT id, payment_id as "paymentId", workspace_id as "workspaceId", razorpay_refund_id as "razorpayRefundId",
              amount, currency, status, reason, created_at as "createdAt", updated_at as "updatedAt"
       FROM refunds
       WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  }

  async listForPayment(paymentId: string): Promise<Refund[]> {
    const rows = await queryDatabase(
      `SELECT id, payment_id as "paymentId", workspace_id as "workspaceId", razorpay_refund_id as "razorpayRefundId",
              amount, currency, status, reason, created_at as "createdAt", updated_at as "updatedAt"
       FROM refunds
       WHERE payment_id = $1
       ORDER BY created_at DESC`,
      [paymentId]
    );
    return rows;
  }

  async listForWorkspace(workspaceId: string): Promise<Refund[]> {
    const rows = await queryDatabase(
      `SELECT id, payment_id as "paymentId", workspace_id as "workspaceId", razorpay_refund_id as "razorpayRefundId",
              amount, currency, status, reason, created_at as "createdAt", updated_at as "updatedAt"
       FROM refunds
       WHERE workspace_id = $1
       ORDER BY created_at DESC`,
      [workspaceId]
    );
    return rows;
  }
}

export const refundRepository = new RefundRepository();
