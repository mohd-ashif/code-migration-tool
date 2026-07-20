import { queryDatabase } from "../lib/database";
import { Coupon, CouponRedemption } from "../models/billing.model";

export class CouponRepository {
  async findByCode(code: string): Promise<Coupon | null> {
    const rows = await queryDatabase(
      `SELECT id, code, discount_type AS "discountType", discount_value AS "discountValue", 
              duration, duration_in_months AS "durationInMonths", max_redemptions AS "maxRedemptions", 
              times_redeemed AS "timesRedeemed", expires_at AS "expiresAt", is_active AS "isActive", created_at AS "createdAt"
       FROM coupons
       WHERE LOWER(code) = LOWER($1) AND is_active = true`,
      [code.trim()]
    );
    return rows[0] || null;
  }

  async findById(id: string): Promise<Coupon | null> {
    const rows = await queryDatabase(
      `SELECT id, code, discount_type AS "discountType", discount_value AS "discountValue", 
              duration, duration_in_months AS "durationInMonths", max_redemptions AS "maxRedemptions", 
              times_redeemed AS "timesRedeemed", expires_at AS "expiresAt", is_active AS "isActive", created_at AS "createdAt"
       FROM coupons
       WHERE id = $1::uuid`,
      [id]
    );
    return rows[0] || null;
  }

  async incrementRedemptions(id: string): Promise<void> {
    await queryDatabase(
      `UPDATE coupons 
       SET times_redeemed = times_redeemed + 1 
       WHERE id = $1::uuid`,
      [id]
    );
  }

  async createRedemption(
    couponId: string,
    workspaceId: string,
    subscriptionId?: string | null
  ): Promise<CouponRedemption> {
    const rows = await queryDatabase(
      `INSERT INTO coupon_redemptions (coupon_id, workspace_id, subscription_id)
       VALUES ($1::uuid, $2::uuid, $3::uuid)
       RETURNING id, coupon_id AS "couponId", workspace_id AS "workspaceId", subscription_id AS "subscriptionId", redeemed_at AS "redeemedAt"`,
      [couponId, workspaceId, subscriptionId || null]
    );
    await this.incrementRedemptions(couponId);
    return rows[0];
  }

  async findActiveRedemption(workspaceId: string): Promise<(CouponRedemption & { coupon: Coupon }) | null> {
    const rows = await queryDatabase(
      `SELECT r.id, r.coupon_id AS "couponId", r.workspace_id AS "workspaceId", r.subscription_id AS "subscriptionId", r.redeemed_at AS "redeemedAt",
              c.code, c.discount_type AS "discountType", c.discount_value AS "discountValue", c.duration
       FROM coupon_redemptions r
       INNER JOIN coupons c ON c.id = r.coupon_id
       WHERE r.workspace_id = $1::uuid
       ORDER BY r.redeemed_at DESC
       LIMIT 1`,
      [workspaceId]
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      couponId: row.couponId,
      workspaceId: row.workspaceId,
      subscriptionId: row.subscriptionId,
      redeemedAt: row.redeemedAt,
      coupon: {
        id: row.couponId,
        code: row.code,
        discountType: row.discountType,
        discountValue: parseFloat(row.discountValue),
        duration: row.duration,
        timesRedeemed: 0,
        isActive: true,
        createdAt: row.redeemedAt,
      },
    };
  }

  async save(coupon: {
    code: string;
    discountType: 'percentage' | 'fixed';
    discountValue: number;
    duration?: 'once' | 'repeating' | 'forever';
    durationInMonths?: number;
    maxRedemptions?: number;
    expiresAt?: Date | null;
  }): Promise<Coupon> {
    const rows = await queryDatabase(
      `INSERT INTO coupons (code, discount_type, discount_value, duration, duration_in_months, max_redemptions, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (code) DO UPDATE 
       SET discount_value = EXCLUDED.discount_value, is_active = true
       RETURNING id, code, discount_type AS "discountType", discount_value AS "discountValue", 
                 duration, duration_in_months AS "durationInMonths", max_redemptions AS "maxRedemptions", 
                 times_redeemed AS "timesRedeemed", expires_at AS "expiresAt", is_active AS "isActive", created_at AS "createdAt"`,
      [
        coupon.code.toUpperCase().trim(),
        coupon.discountType,
        coupon.discountValue,
        coupon.duration || 'once',
        coupon.durationInMonths || null,
        coupon.maxRedemptions || null,
        coupon.expiresAt || null,
      ]
    );
    return rows[0];
  }
}
export const couponRepository = new CouponRepository();
