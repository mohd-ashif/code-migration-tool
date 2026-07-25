import { queryDatabase } from "../lib/database";

export interface WebhookLog {
  id: string;
  eventId?: string;
  eventType: string;
  payload: any;
  status: string; // processed, failed, skipped
  errorMessage?: string;
  createdAt: Date;
}

export class WebhookLogRepository {
  async create(params: {
    eventId?: string;
    eventType: string;
    payload: any;
    status?: string;
    errorMessage?: string;
  }): Promise<WebhookLog> {
    const rows = await queryDatabase(
      `INSERT INTO webhook_logs (event_id, event_type, payload, status, error_message)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (event_id) DO UPDATE 
       SET status = EXCLUDED.status, error_message = EXCLUDED.error_message
       RETURNING id, event_id as "eventId", event_type as "eventType", payload, status, error_message as "errorMessage", created_at as "createdAt"`,
      [
        params.eventId || null,
        params.eventType,
        JSON.stringify(params.payload),
        params.status || "processed",
        params.errorMessage || null
      ]
    );
    return rows[0];
  }

  async findByEventId(eventId: string): Promise<WebhookLog | null> {
    if (!eventId) return null;
    const rows = await queryDatabase(
      `SELECT id, event_id as "eventId", event_type as "eventType", payload, status, error_message as "errorMessage", created_at as "createdAt"
       FROM webhook_logs
       WHERE event_id = $1`,
      [eventId]
    );
    return rows[0] || null;
  }
}

export const webhookLogRepository = new WebhookLogRepository();
