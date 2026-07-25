import { queryDatabase } from "../lib/database";
import { Payment } from "../models/billing.model";

export class PaymentRepository {
  async findByTransactionId(transactionId: string): Promise<Payment | null> {
    const rows = await queryDatabase(
      `SELECT id, workspace_id AS "workspaceId", subscription_id AS "subscriptionId", gateway,
              transaction_id AS "transactionId", order_id AS "orderId",
              razorpay_order_id AS "razorpayOrderId", razorpay_payment_id AS "razorpayPaymentId",
              razorpay_signature AS "razorpaySignature", transaction_reference AS "transactionReference",
              failure_reason AS "failureReason", amount, currency, status,
              payment_method AS "paymentMethod", invoice_id AS "invoiceId", paid_at AS "paidAt",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM payments
       WHERE transaction_id = $1`,
      [transactionId]
    );
    return rows[0] || null;
  }

  async findByOrderId(orderId: string): Promise<Payment | null> {
    const rows = await queryDatabase(
      `SELECT id, workspace_id AS "workspaceId", subscription_id AS "subscriptionId", gateway,
              transaction_id AS "transactionId", order_id AS "orderId",
              razorpay_order_id AS "razorpayOrderId", razorpay_payment_id AS "razorpayPaymentId",
              razorpay_signature AS "razorpaySignature", transaction_reference AS "transactionReference",
              failure_reason AS "failureReason", amount, currency, status,
              payment_method AS "paymentMethod", invoice_id AS "invoiceId", paid_at AS "paidAt",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM payments
       WHERE order_id = $1 OR razorpay_order_id = $1`,
      [orderId]
    );
    return rows[0] || null;
  }

  async findByRazorpayPaymentId(razorpayPaymentId: string): Promise<Payment | null> {
    const rows = await queryDatabase(
      `SELECT id, workspace_id AS "workspaceId", subscription_id AS "subscriptionId", gateway,
              transaction_id AS "transactionId", order_id AS "orderId",
              razorpay_order_id AS "razorpayOrderId", razorpay_payment_id AS "razorpayPaymentId",
              razorpay_signature AS "razorpaySignature", transaction_reference AS "transactionReference",
              failure_reason AS "failureReason", amount, currency, status,
              payment_method AS "paymentMethod", invoice_id AS "invoiceId", paid_at AS "paidAt",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM payments
       WHERE razorpay_payment_id = $1 OR transaction_id = $1`,
      [razorpayPaymentId]
    );
    return rows[0] || null;
  }

  async create(payment: {
    workspaceId: string;
    subscriptionId?: string | null;
    gateway: string;
    transactionId: string;
    orderId?: string | null;
    razorpayOrderId?: string | null;
    razorpayPaymentId?: string | null;
    razorpaySignature?: string | null;
    transactionReference?: string | null;
    failureReason?: string | null;
    amount: number;
    currency?: string;
    status: string;
    paymentMethod?: string | null;
    invoiceId?: string | null;
    paidAt?: Date | null;
  }): Promise<Payment> {
    const rows = await queryDatabase(
      `INSERT INTO payments (
         workspace_id, subscription_id, gateway, transaction_id, order_id,
         razorpay_order_id, razorpay_payment_id, razorpay_signature, transaction_reference,
         failure_reason, amount, currency, status, payment_method, invoice_id, paid_at
       )
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::uuid, $16)
       RETURNING id, workspace_id AS "workspaceId", subscription_id AS "subscriptionId", gateway,
                 transaction_id AS "transactionId", order_id AS "orderId",
                 razorpay_order_id AS "razorpayOrderId", razorpay_payment_id AS "razorpayPaymentId",
                 razorpay_signature AS "razorpaySignature", transaction_reference AS "transactionReference",
                 failure_reason AS "failureReason", amount, currency, status,
                 payment_method AS "paymentMethod", invoice_id AS "invoiceId", paid_at AS "paidAt",
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        payment.workspaceId,
        payment.subscriptionId || null,
        payment.gateway,
        payment.transactionId,
        payment.orderId || null,
        payment.razorpayOrderId || payment.orderId || null,
        payment.razorpayPaymentId || payment.transactionId || null,
        payment.razorpaySignature || null,
        payment.transactionReference || null,
        payment.failureReason || null,
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
              transaction_id AS "transactionId", order_id AS "orderId",
              razorpay_order_id AS "razorpayOrderId", razorpay_payment_id AS "razorpayPaymentId",
              razorpay_signature AS "razorpaySignature", transaction_reference AS "transactionReference",
              failure_reason AS "failureReason", amount, currency, status,
              payment_method AS "paymentMethod", invoice_id AS "invoiceId", paid_at AS "paidAt",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM payments
       WHERE workspace_id = $1::uuid
       ORDER BY created_at DESC`,
      [workspaceId]
    );
    return rows;
  }

  async listForWorkspaceWithFilter(params: {
    workspaceId: string;
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ payments: any[]; total: number; page: number; limit: number }> {
    const page = params.page || 1;
    const limit = params.limit || 10;
    const offset = (page - 1) * limit;

    let whereClause = `WHERE p.workspace_id = $1::uuid`;
    const queryParams: any[] = [params.workspaceId];
    let paramIdx = 2;

    if (params.status && params.status !== "all") {
      whereClause += ` AND p.status = $${paramIdx++}`;
      queryParams.push(params.status);
    }

    if (params.search && params.search.trim()) {
      const searchTerm = `%${params.search.trim()}%`;
      whereClause += ` AND (p.transaction_id ILIKE $${paramIdx} OR p.order_id ILIKE $${paramIdx} OR p.razorpay_payment_id ILIKE $${paramIdx} OR p.payment_method ILIKE $${paramIdx})`;
      queryParams.push(searchTerm);
      paramIdx++;
    }

    const countRows = await queryDatabase(
      `SELECT COUNT(*) as total FROM payments p ${whereClause}`,
      queryParams
    );
    const total = parseInt(countRows[0]?.total || "0", 10);

    const rows = await queryDatabase(
      `SELECT p.id, p.workspace_id AS "workspaceId", p.subscription_id AS "subscriptionId", p.gateway,
              p.transaction_id AS "transactionId", p.order_id AS "orderId",
              p.razorpay_order_id AS "razorpayOrderId", p.razorpay_payment_id AS "razorpayPaymentId",
              p.razorpay_signature AS "razorpaySignature", p.transaction_reference AS "transactionReference",
              p.failure_reason AS "failureReason", p.amount, p.currency, p.status,
              p.payment_method AS "paymentMethod", p.invoice_id AS "invoiceId", p.paid_at AS "paidAt",
              p.created_at AS "createdAt", p.updated_at AS "updatedAt",
              i.invoice_number AS "invoiceNumber", i.pdf_url AS "pdfUrl",
              sp.name AS "planName"
       FROM payments p
       LEFT JOIN invoices i ON i.id = p.invoice_id
       LEFT JOIN subscriptions s ON s.id = p.subscription_id
       LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
       ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...queryParams, limit, offset]
    );

    return {
      payments: rows,
      total,
      page,
      limit
    };
  }

  async updateInvoice(id: string, invoiceId: string): Promise<void> {
    await queryDatabase(
      `UPDATE payments 
       SET invoice_id = $1::uuid 
       WHERE id = $2::uuid`,
      [invoiceId, id]
    );
  }

  async findById(id: string): Promise<Payment | null> {
    const rows = await queryDatabase(
      `SELECT id, workspace_id AS "workspaceId", subscription_id AS "subscriptionId", gateway,
              transaction_id AS "transactionId", order_id AS "orderId",
              razorpay_order_id AS "razorpayOrderId", razorpay_payment_id AS "razorpayPaymentId",
              razorpay_signature AS "razorpaySignature", transaction_reference AS "transactionReference",
              failure_reason AS "failureReason", amount, currency, status,
              payment_method AS "paymentMethod", invoice_id AS "invoiceId", paid_at AS "paidAt",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM payments
       WHERE id = $1::uuid`,
      [id]
    );
    return rows[0] || null;
  }

  async updateStatus(id: string, status: string, failureReason?: string): Promise<void> {
    await queryDatabase(
      `UPDATE payments 
       SET status = $1, failure_reason = COALESCE($2, failure_reason)
       WHERE id = $3::uuid`,
      [status, failureReason || null, id]
    );
  }

  async listAll(): Promise<any[]> {
    const rows = await queryDatabase(
      `SELECT p.id, p.workspace_id AS "workspaceId", w.name AS "workspaceName", p.subscription_id AS "subscriptionId", p.gateway,
              p.transaction_id AS "transactionId", p.order_id AS "orderId", p.amount, p.currency, p.status,
              p.payment_method AS "paymentMethod", p.invoice_id AS "invoiceId", p.paid_at AS "paidAt", p.created_at AS "createdAt"
       FROM payments p
       INNER JOIN workspaces w ON w.id = p.workspace_id
       ORDER BY p.created_at DESC`
    );
    return rows;
  }

  async getRevenueStats(): Promise<{ totalRevenue: number; monthlyRevenue: number }> {
    const rows = await queryDatabase(
      `SELECT 
         COALESCE(SUM(amount), 0.00) AS "totalRevenue",
         COALESCE(SUM(CASE WHEN paid_at >= NOW() - INTERVAL '30 days' THEN amount ELSE 0.00 END), 0.00) AS "monthlyRevenue"
       FROM payments
       WHERE status = 'captured'`
    );
    return {
      totalRevenue: parseFloat(rows[0].totalRevenue),
      monthlyRevenue: parseFloat(rows[0].monthlyRevenue)
    };
  }
}
export const paymentRepository = new PaymentRepository();
