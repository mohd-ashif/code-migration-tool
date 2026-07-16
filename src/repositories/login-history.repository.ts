import { queryDatabase } from "../lib/database";
import { LoginHistory } from "../models/auth.model";

/**
 * Maps a raw database row to the LoginHistory model interface.
 */
export function mapRowToLoginHistory(row: any): LoginHistory {
  return {
    id: row.id,
    userId: row.user_id,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    loginStatus: row.login_status,
    failureReason: row.failure_reason,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
  };
}

export class LoginHistoryRepository {
  /**
   * Log a login attempt.
   */
  async create(data: {
    userId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    loginStatus: string;
    failureReason?: string | null;
  }): Promise<LoginHistory> {
    const query = `
      INSERT INTO login_history (user_id, ip_address, user_agent, login_status, failure_reason)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const rows = await queryDatabase(query, [
      data.userId ?? null,
      data.ipAddress ?? null,
      data.userAgent ?? null,
      data.loginStatus,
      data.failureReason ?? null,
    ]);
    return mapRowToLoginHistory(rows[0]);
  }

  /**
   * Get login attempts for a specific user ID.
   */
  async findByUserId(userId: string, limit = 50, includeDeleted = false): Promise<LoginHistory[]> {
    const query = includeDeleted
      ? "SELECT * FROM login_history WHERE user_id = $1::uuid ORDER BY created_at DESC LIMIT $2"
      : "SELECT * FROM login_history WHERE user_id = $1::uuid AND deleted_at IS NULL ORDER BY created_at DESC LIMIT $2";
    
    const rows = await queryDatabase(query, [userId, limit]);
    return rows.map(mapRowToLoginHistory);
  }

  /**
   * Soft deletes a login history entry.
   */
  async deleteSoft(id: string): Promise<boolean> {
    const query = `
      UPDATE login_history
      SET deleted_at = NOW()
      WHERE id = $1::uuid AND deleted_at IS NULL
      RETURNING id
    `;
    const rows = await queryDatabase(query, [id]);
    return rows.length > 0;
  }

  /**
   * Hard deletes a login history entry.
   */
  async deleteHard(id: string): Promise<boolean> {
    const query = "DELETE FROM login_history WHERE id = $1::uuid RETURNING id";
    const rows = await queryDatabase(query, [id]);
    return rows.length > 0;
  }
}
