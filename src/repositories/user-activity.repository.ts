import { queryDatabase } from "../lib/database";
import { UserActivity } from "../models/auth.model";

export function mapRowToUserActivity(row: any): UserActivity {
  return {
    id: row.id,
    userId: row.user_id,
    action: row.action,
    metadata: row.metadata,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: new Date(row.created_at),
  };
}

export class UserActivityRepository {
  async create(data: {
    userId: string;
    action: string;
    metadata?: any;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<UserActivity> {
    const query = `
      INSERT INTO user_activities (user_id, action, metadata, ip_address, user_agent)
      VALUES ($1::uuid, $2, $3, $4, $5)
      RETURNING *
    `;
    const rows = await queryDatabase(query, [
      data.userId,
      data.action,
      data.metadata ? JSON.stringify(data.metadata) : null,
      data.ipAddress ?? null,
      data.userAgent ?? null,
    ]);
    return mapRowToUserActivity(rows[0]);
  }

  async findByUserId(userId: string, limit = 50): Promise<UserActivity[]> {
    const query = `
      SELECT * FROM user_activities
      WHERE user_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT $2
    `;
    const rows = await queryDatabase(query, [userId, limit]);
    return rows.map(mapRowToUserActivity);
  }
}
