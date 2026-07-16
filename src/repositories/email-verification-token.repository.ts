import { queryDatabase } from "../lib/database";
import { EmailVerificationToken } from "../models/auth.model";


export function mapRowToEmailVerificationToken(row: any): EmailVerificationToken {
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

export class EmailVerificationTokenRepository {

  async findByToken(token: string, includeDeleted = false): Promise<EmailVerificationToken | null> {
    const query = includeDeleted
      ? "SELECT * FROM email_verification_tokens WHERE token = $1"
      : "SELECT * FROM email_verification_tokens WHERE token = $1 AND deleted_at IS NULL";
    
    const rows = await queryDatabase(query, [token]);
    return rows.length > 0 ? mapRowToEmailVerificationToken(rows[0]) : null;
  }


  async create(data: {
    userId: string;
    token: string;
    expiresAt: Date;
  }): Promise<EmailVerificationToken> {
    const query = `
      INSERT INTO email_verification_tokens (user_id, token, expires_at)
      VALUES ($1::uuid, $2, $3::timestamptz)
      RETURNING *
    `;
    const rows = await queryDatabase(query, [
      data.userId,
      data.token,
      data.expiresAt,
    ]);
    return mapRowToEmailVerificationToken(rows[0]);
  }

  async markAsUsed(token: string): Promise<boolean> {
    const query = `
      UPDATE email_verification_tokens
      SET is_used = TRUE
      WHERE token = $1 AND is_used = FALSE AND deleted_at IS NULL
      RETURNING id
    `;
    const rows = await queryDatabase(query, [token]);
    return rows.length > 0;
  }


  async invalidateAllForUser(userId: string): Promise<boolean> {
    const query = `
      UPDATE email_verification_tokens
      SET is_used = TRUE
      WHERE user_id = $1::uuid AND is_used = FALSE AND deleted_at IS NULL
      RETURNING id
    `;
    const rows = await queryDatabase(query, [userId]);
    return rows.length > 0;
  }


  async deleteSoft(id: string): Promise<boolean> {
    const query = `
      UPDATE email_verification_tokens
      SET deleted_at = NOW()
      WHERE id = $1::uuid AND deleted_at IS NULL
      RETURNING id
    `;
    const rows = await queryDatabase(query, [id]);
    return rows.length > 0;
  }

  async deleteHard(id: string): Promise<boolean> {
    const query = "DELETE FROM email_verification_tokens WHERE id = $1::uuid RETURNING id";
    const rows = await queryDatabase(query, [id]);
    return rows.length > 0;
  }
}
