import { queryDatabase } from "../lib/database";

export interface PaymentEvent {
  id: string;
  paymentId?: string | null;
  workspaceId?: string | null;
  eventType: string; // Payment Created, Payment Authorized, Payment Captured, Payment Failed, Payment Refunded, Subscription Renewed, Subscription Cancelled, Webhook Received
  payload?: any;
  createdAt: Date;
}

export class PaymentEventRepository {
  async create(params: {
    paymentId?: string;
    workspaceId?: string;
    eventType: string;
    payload?: any;
  }): Promise<PaymentEvent> {
    const rows = await queryDatabase(
      `INSERT INTO payment_events (payment_id, workspace_id, event_type, payload)
       VALUES ($1, $2, $3, $4)
       RETURNING id, payment_id as "paymentId", workspace_id as "workspaceId", event_type as "eventType", payload, created_at as "createdAt"`,
      [params.paymentId || null, params.workspaceId || null, params.eventType, params.payload ? JSON.stringify(params.payload) : null]
    );
    return rows[0];
  }

  async listForPayment(paymentId: string): Promise<PaymentEvent[]> {
    const rows = await queryDatabase(
      `SELECT id, payment_id as "paymentId", workspace_id as "workspaceId", event_type as "eventType", payload, created_at as "createdAt"
       FROM payment_events
       WHERE payment_id = $1
       ORDER BY created_at DESC`,
      [paymentId]
    );
    return rows;
  }

  async listForWorkspace(workspaceId: string): Promise<PaymentEvent[]> {
    const rows = await queryDatabase(
      `SELECT id, payment_id as "paymentId", workspace_id as "workspaceId", event_type as "eventType", payload, created_at as "createdAt"
       FROM payment_events
       WHERE workspace_id = $1
       ORDER BY created_at DESC`,
      [workspaceId]
    );
    return rows;
  }
}

export const paymentEventRepository = new PaymentEventRepository();
