import { queryDatabase } from "../lib/database";
import { PasswordResetToken } from "../models/auth.model";


export function mapRowToPasswordResetToken(row: any): PasswordResetToken {
  return {
    id: row.id,
    userId: row.user_id,
    token: row.token,
    expiresAt: new Date(row.expires_at),
    isUsed: row.is_used,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
  };
}

export class PasswordResetTokenRepository {

  async findByToken(token: string, includeDeleted = false): Promise<PasswordResetToken | null> {
    const query = includeDeleted
      ? "SELECT * FROM password_reset_tokens WHERE token = $1"
      : "SELECT * FROM password_reset_tokens WHERE token = $1 AND deleted_at IS NULL";
    
    const rows = await queryDatabase(query, [token]);
    return rows.length > 0 ? mapRowToPasswordResetToken(rows[0]) : null;
  }


  async create(data: {
    userId: string;
    token: string;
    expiresAt: Date;
  }): Promise<PasswordResetToken> {
    const query = `
      INSERT INTO password_reset_tokens (user_id, token, expires_at)
      VALUES ($1::uuid, $2, $3::timestamptz)
      RETURNING *
    `;
    const rows = await queryDatabase(query, [
      data.userId,
      data.token,
      data.expiresAt,
    ]);
    return mapRowToPasswordResetToken(rows[0]);
  }


  async markAsUsed(token: string): Promise<boolean> {
    const query = `
      UPDATE password_reset_tokens
      SET is_used = TRUE
      WHERE token = $1 AND is_used = FALSE AND deleted_at IS NULL
      RETURNING id
    `;
    const rows = await queryDatabase(query, [token]);
    return rows.length > 0;
  }


  async invalidateAllForUser(userId: string): Promise<boolean> {
    const query = `
      UPDATE password_reset_tokens
      SET is_used = TRUE
      WHERE user_id = $1::uuid AND is_used = FALSE AND deleted_at IS NULL
      RETURNING id
    `;
    const rows = await queryDatabase(query, [userId]);
    return rows.length > 0;
  }

  async deleteSoft(id: string): Promise<boolean> {
    const query = `
      UPDATE password_reset_tokens
      SET deleted_at = NOW()
      WHERE id = $1::uuid AND deleted_at IS NULL
      RETURNING id
    `;
    const rows = await queryDatabase(query, [id]);
    return rows.length > 0;
  }


  async deleteHard(id: string): Promise<boolean> {
    const query = "DELETE FROM password_reset_tokens WHERE id = $1::uuid RETURNING id";
    const rows = await queryDatabase(query, [id]);
    return rows.length > 0;
  }
}
