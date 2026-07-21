import { queryDatabase } from "../lib/database";
import { Subscription } from "../models/billing.model";

export class SubscriptionRepository {
  async findByWorkspaceId(workspaceId: string): Promise<Subscription | null> {
    const rows = await queryDatabase(
      `SELECT s.id, s.workspace_id AS "workspaceId", s.plan_id AS "planId", s.status, 
              s.billing_cycle AS "billingCycle", s.trial_start AS "trialStart", s.trial_end AS "trialEnd",
              s.starts_at AS "startsAt", s.expires_at AS "expiresAt", s.cancel_at AS "cancel_at", 
              s.renew_at AS "renewAt", s.payment_provider AS "paymentProvider", 
              s.provider_subscription_id AS "providerSubscriptionId", 
              s.created_at AS "createdAt", s.updated_at AS "updatedAt"
       FROM subscriptions s
       INNER JOIN workspace_subscriptions ws ON ws.subscription_id = s.id
       WHERE ws.workspace_id = $1::uuid AND s.status != 'cancelled'
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [workspaceId]
    );
    return rows[0] || null;
  }

  async findByProviderId(providerSubscriptionId: string): Promise<Subscription | null> {
    const rows = await queryDatabase(
      `SELECT id, workspace_id AS "workspaceId", plan_id AS "planId", status, 
              billing_cycle AS "billingCycle", trial_start AS "trialStart", trial_end AS "trialEnd",
              starts_at AS "startsAt", expires_at AS "expiresAt", cancel_at AS "cancel_at", 
              renew_at AS "renewAt", payment_provider AS "paymentProvider", 
              provider_subscription_id AS "providerSubscriptionId", 
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM subscriptions
       WHERE provider_subscription_id = $1`,
      [providerSubscriptionId]
    );
    return rows[0] || null;
  }

  async findById(id: string): Promise<Subscription | null> {
    const rows = await queryDatabase(
      `SELECT id, workspace_id AS "workspaceId", plan_id AS "planId", status, 
              billing_cycle AS "billingCycle", trial_start AS "trialStart", trial_end AS "trialEnd",
              starts_at AS "startsAt", expires_at AS "expiresAt", cancel_at AS "cancel_at", 
              renew_at AS "renewAt", payment_provider AS "paymentProvider", 
              provider_subscription_id AS "providerSubscriptionId", 
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM subscriptions
       WHERE id = $1::uuid`,
      [id]
    );
    return rows[0] || null;
  }

  async create(sub: {
    workspaceId: string;
    planId: string;
    status: string;
    billingCycle: string;
    trialStart?: Date | null;
    trialEnd?: Date | null;
    startsAt: Date;
    expiresAt?: Date | null;
    cancelAt?: Date | null;
    renewAt?: Date | null;
    paymentProvider?: string;
    providerSubscriptionId?: string | null;
  }): Promise<Subscription> {
    const rows = await queryDatabase(
      `INSERT INTO subscriptions (workspace_id, plan_id, status, billing_cycle, trial_start, trial_end, starts_at, expires_at, cancel_at, renew_at, payment_provider, provider_subscription_id)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, workspace_id AS "workspaceId", plan_id AS "planId", status, billing_cycle AS "billingCycle", 
                 trial_start AS "trialStart", trial_end AS "trialEnd", starts_at AS "startsAt", 
                 expires_at AS "expiresAt", cancel_at AS "cancel_at", renew_at AS "renewAt", 
                 payment_provider AS "paymentProvider", provider_subscription_id AS "providerSubscriptionId", 
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        sub.workspaceId,
        sub.planId,
        sub.status,
        sub.billingCycle,
        sub.trialStart || null,
        sub.trialEnd || null,
        sub.startsAt,
        sub.expiresAt || null,
        sub.cancelAt || null,
        sub.renewAt || null,
        sub.paymentProvider || 'razorpay',
        sub.providerSubscriptionId || null,
      ]
    );
    
    const newSub = rows[0];
    await this.mapWorkspaceSubscription(sub.workspaceId, newSub.id);
    return newSub;
  }

  async update(id: string, sub: Partial<Subscription>): Promise<Subscription> {
    const keys = Object.keys(sub) as Array<keyof Subscription>;
    if (keys.length === 0) {
      const current = await this.findById(id);
      if (!current) throw new Error("Subscription not found");
      return current;
    }

    const queryParts = [];
    const values = [];
    let i = 1;

    // Map TS camelCase properties to DB snake_case columns
    const mappings: Record<string, string> = {
      workspaceId: "workspace_id",
      planId: "plan_id",
      status: "status",
      billingCycle: "billing_cycle",
      trialStart: "trial_start",
      trialEnd: "trial_end",
      startsAt: "starts_at",
      expiresAt: "expires_at",
      cancelAt: "cancel_at",
      renewAt: "renew_at",
      paymentProvider: "payment_provider",
      providerSubscriptionId: "provider_subscription_id"
    };

    for (const key of keys) {
      const dbCol = mappings[key] || key;
      queryParts.push(`${dbCol} = $${i}`);
      values.push(sub[key]);
      i++;
    }

    values.push(id);
    const sql = `UPDATE subscriptions SET ${queryParts.join(", ")}, updated_at = NOW() WHERE id = $${i} RETURNING *`;
    const rows = await queryDatabase(sql, values);
    
    // Parse response fields back to camelCase
    const row = rows[0];
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      planId: row.plan_id,
      status: row.status,
      billingCycle: row.billing_cycle,
      trialStart: row.trial_start,
      trialEnd: row.trial_end,
      startsAt: row.starts_at,
      expiresAt: row.expires_at,
      cancelAt: row.cancel_at,
      renewAt: row.renew_at,
      paymentProvider: row.payment_provider,
      providerSubscriptionId: row.provider_subscription_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async mapWorkspaceSubscription(workspaceId: string, subscriptionId: string): Promise<void> {
    await queryDatabase(
      `INSERT INTO workspace_subscriptions (workspace_id, subscription_id)
       VALUES ($1::uuid, $2::uuid)
       ON CONFLICT (workspace_id) DO UPDATE SET subscription_id = EXCLUDED.subscription_id`,
      [workspaceId, subscriptionId]
    );
  }

  async saveEvent(subscriptionId: string | null, eventType: string, payload: any): Promise<void> {
    await queryDatabase(
      `INSERT INTO subscription_events (subscription_id, event_type, payload)
       VALUES ($1::uuid, $2, $3::jsonb)`,
      [subscriptionId, eventType, JSON.stringify(payload)]
    );
  }

  async listAll(): Promise<any[]> {
    const rows = await queryDatabase(
      `SELECT s.id, s.workspace_id AS "workspaceId", w.name AS "workspaceName", 
              s.plan_id AS "planId", p.name AS "planName", s.status, s.billing_cycle AS "billingCycle", 
              s.starts_at AS "startsAt", s.expires_at AS "expiresAt", s.created_at AS "createdAt"
       FROM subscriptions s
       INNER JOIN workspaces w ON w.id = s.workspace_id
       INNER JOIN subscription_plans p ON p.id = s.plan_id
       ORDER BY s.created_at DESC`
    );
    return rows;
  }
}
export const subscriptionRepository = new SubscriptionRepository();
