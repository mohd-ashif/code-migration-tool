import { queryDatabase } from "../lib/database";
import { Invoice, InvoiceItem } from "../models/billing.model";

export class InvoiceRepository {
  async getNextInvoiceNumber(): Promise<string> {
    const currentYear = new Date().getFullYear();
    const rows = await queryDatabase(
      `SELECT COUNT(*) as count 
       FROM invoices 
       WHERE invoice_number LIKE $1`,
      [`INV-${currentYear}-%`]
    );
    const nextNum = (parseInt(rows[0].count, 10) + 1).toString().padStart(4, "0");
    return `INV-${currentYear}-${nextNum}`;
  }

  async create(
    invoice: {
      workspaceId: string;
      subscriptionId?: string | null;
      paymentId?: string | null;
      invoiceNumber: string;
      subtotal: number;
      cgst: number;
      sgst: number;
      igst: number;
      discount: number;
      total: number;
      currency?: string;
      status: 'paid' | 'failed' | 'pending' | 'cancelled';
      pdfUrl?: string | null;
      billingDetails?: any;
    },
    items: Array<{ description: string; amount: number }>
  ): Promise<Invoice & { items: InvoiceItem[] }> {
    const invRows = await queryDatabase(
      `INSERT INTO invoices (workspace_id, subscription_id, payment_id, invoice_number, subtotal, cgst, sgst, igst, discount, total, currency, status, pdf_url, billing_details)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
       RETURNING id, workspace_id AS "workspaceId", subscription_id AS "subscriptionId", payment_id AS "paymentId",
                 invoice_number AS "invoiceNumber", subtotal, cgst, sgst, igst, discount, total, currency, status,
                 pdf_url AS "pdfUrl", billing_details AS "billingDetails", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        invoice.workspaceId,
        invoice.subscriptionId || null,
        invoice.paymentId || null,
        invoice.invoiceNumber,
        invoice.subtotal,
        invoice.cgst,
        invoice.sgst,
        invoice.igst,
        invoice.discount,
        invoice.total,
        invoice.currency || 'INR',
        invoice.status,
        invoice.pdfUrl || null,
        JSON.stringify(invoice.billingDetails || {}),
      ]
    );

    const savedInvoice = invRows[0];
    const savedItems: InvoiceItem[] = [];

    for (const item of items) {
      const itemRows = await queryDatabase(
        `INSERT INTO invoice_items (invoice_id, description, amount)
         VALUES ($1::uuid, $2, $3)
         RETURNING id, invoice_id AS "invoiceId", description, amount, created_at AS "createdAt"`,
        [savedInvoice.id, item.description, item.amount]
      );
      savedItems.push(itemRows[0]);
    }

    return {
      ...savedInvoice,
      items: savedItems,
    };
  }

  async findById(id: string, workspaceId?: string): Promise<(Invoice & { items: InvoiceItem[] }) | null> {
    const values: unknown[] = [id];
    let sql = `SELECT id, workspace_id AS "workspaceId", subscription_id AS "subscriptionId", payment_id AS "paymentId",
                      invoice_number AS "invoiceNumber", subtotal, cgst, sgst, igst, discount, total, currency, status,
                      pdf_url AS "pdfUrl", billing_details AS "billingDetails", created_at AS "createdAt", updated_at AS "updatedAt"
               FROM invoices
               WHERE id = $1::uuid`;

    if (workspaceId) {
      sql += " AND workspace_id = $2::uuid";
      values.push(workspaceId);
    }

    const invRows = await queryDatabase(sql, values);
    if (invRows.length === 0) return null;

    const savedInvoice = invRows[0];
    const itemRows = await queryDatabase(
      `SELECT id, invoice_id AS "invoiceId", description, amount, created_at AS "createdAt"
       FROM invoice_items
       WHERE invoice_id = $1::uuid
       ORDER BY created_at ASC`,
      [savedInvoice.id]
    );

    return {
      ...savedInvoice,
      items: itemRows,
    };
  }

  async listForWorkspace(workspaceId: string): Promise<Invoice[]> {
    const rows = await queryDatabase(
      `SELECT id, workspace_id AS "workspaceId", subscription_id AS "subscriptionId", payment_id AS "paymentId",
              invoice_number AS "invoiceNumber", subtotal, cgst, sgst, igst, discount, total, currency, status,
              pdf_url AS "pdfUrl", billing_details AS "billingDetails", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM invoices
       WHERE workspace_id = $1::uuid
       ORDER BY created_at DESC`,
      [workspaceId]
    );
    return rows;
  }

  async updatePdfUrl(id: string, pdfUrl: string): Promise<void> {
    await queryDatabase(
      `UPDATE invoices 
       SET pdf_url = $1, updated_at = NOW() 
       WHERE id = $2::uuid`,
      [pdfUrl, id]
    );
  }
}
export const invoiceRepository = new InvoiceRepository();
