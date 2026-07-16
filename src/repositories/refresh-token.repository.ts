import { queryDatabase } from "../lib/database";
import { RefreshToken } from "../models/auth.model";


export function mapRowToRefreshToken(row: any): RefreshToken {
  return {
    id: row.id,
    userId: row.user_id,
    token: row.token,
    expiresAt: new Date(row.expires_at),
    isRevoked: row.is_revoked,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
  };
}

export class RefreshTokenRepository {

  async findByToken(token: string, includeDeleted = false): Promise<RefreshToken | null> {
    const query = includeDeleted
      ? "SELECT * FROM refresh_tokens WHERE token = $1"
      : "SELECT * FROM refresh_tokens WHERE token = $1 AND deleted_at IS NULL";
    
    const rows = await queryDatabase(query, [token]);
    return rows.length > 0 ? mapRowToRefreshToken(rows[0]) : null;
  }


  async create(data: {
    userId: string;
    token: string;
    expiresAt: Date;
  }): Promise<RefreshToken> {
    const query = `
      INSERT INTO refresh_tokens (user_id, token, expires_at)
      VALUES ($1::uuid, $2, $3::timestamptz)
      RETURNING *
    `;
    const rows = await queryDatabase(query, [
      data.userId,
      data.token,
      data.expiresAt,
    ]);
    return mapRowToRefreshToken(rows[0]);
  }

  async revoke(token: string): Promise<boolean> {
    const query = `
      UPDATE refresh_tokens
      SET is_revoked = TRUE
      WHERE token = $1 AND is_revoked = FALSE AND deleted_at IS NULL
      RETURNING id
    `;
    const rows = await queryDatabase(query, [token]);
    return rows.length > 0;
  }

  async revokeAllForUser(userId: string): Promise<boolean> {
    const query = `
      UPDATE refresh_tokens
      SET is_revoked = TRUE
      WHERE user_id = $1::uuid AND is_revoked = FALSE AND deleted_at IS NULL
      RETURNING id
    `;
    const rows = await queryDatabase(query, [userId]);
    return rows.length > 0;
  }


  async deleteSoft(id: string): Promise<boolean> {
    const query = `
      UPDATE refresh_tokens
      SET deleted_at = NOW()
      WHERE id = $1::uuid AND deleted_at IS NULL
      RETURNING id
    `;
    const rows = await queryDatabase(query, [id]);
    return rows.length > 0;
  }


  async deleteHard(id: string): Promise<boolean> {
    const query = "DELETE FROM refresh_tokens WHERE id = $1::uuid RETURNING id";
    const rows = await queryDatabase(query, [id]);
    return rows.length > 0;
  }
}
