import { queryDatabase } from "../lib/database";
import { Payment } from "../models/billing.model";

export class PaymentRepository {
  async findByTransactionId(transactionId: string): Promise<Payment | null> {
    const rows = await queryDatabase(
      `SELECT id, workspace_id AS "workspaceId", subscription_id AS "subscriptionId", gateway,
              transaction_id AS "transactionId", order_id AS "orderId", amount, currency, status,
              payment_method AS "paymentMethod", invoice_id AS "invoiceId", paid_at AS "paidAt", created_at AS "createdAt"
       FROM payments
       WHERE transaction_id = $1`,
      [transactionId]
    );
    return rows[0] || null;
  }

  async create(payment: {
    workspaceId: string;
    subscriptionId?: string | null;
    gateway: string;
    transactionId: string;
    orderId?: string | null;
    amount: number;
    currency?: string;
    status: string;
    paymentMethod?: string | null;
    invoiceId?: string | null;
    paidAt?: Date | null;
  }): Promise<Payment> {
    const rows = await queryDatabase(
      `INSERT INTO payments (workspace_id, subscription_id, gateway, transaction_id, order_id, amount, currency, status, payment_method, invoice_id, paid_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10::uuid, $11)
       RETURNING id, workspace_id AS "workspaceId", subscription_id AS "subscriptionId", gateway,
                 transaction_id AS "transactionId", order_id AS "orderId", amount, currency, status,
                 payment_method AS "paymentMethod", invoice_id AS "invoiceId", paid_at AS "paidAt", created_at AS "createdAt"`,
      [
        payment.workspaceId,
        payment.subscriptionId || null,
        payment.gateway,
        payment.transactionId,
        payment.orderId || null,
        payment.amount,
        payment.currency || 'INR',
        payment.status,
        payment.paymentMethod || null,
        payment.invoiceId || null,
        payment.paidAt || null,
      ]
    );
    return rows[0];
  }

  async listForWorkspace(workspaceId: string): Promise<Payment[]> {
    const rows = await queryDatabase(
      `SELECT id, workspace_id AS "workspaceId", subscription_id AS "subscriptionId", gateway,
              transaction_id AS "transactionId", order_id AS "orderId", amount, currency, status,
              payment_method AS "paymentMethod", invoice_id AS "invoiceId", paid_at AS "paidAt", created_at AS "createdAt"
       FROM payments
       WHERE workspace_id = $1::uuid
       ORDER BY created_at DESC`,
      [workspaceId]
    );
    return rows;
  }

  async updateInvoice(id: string, invoiceId: string): Promise<void> {
    await queryDatabase(
      `UPDATE payments 
       SET invoice_id = $1::uuid 
       WHERE id = $2::uuid`,
      [invoiceId, id]
    );
  }
}
export const paymentRepository = new PaymentRepository();
