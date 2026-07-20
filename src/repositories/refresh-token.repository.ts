import { queryDatabase } from "../lib/database";
import { RefreshToken } from "../models/auth.model";


export function mapRowToRefreshToken(row: any): RefreshToken {
  return {
    id: row.id,
    userId: row.user_id,
    token: row.token,
    expiresAt: new Date(row.expires_at),
    isRevoked: row.is_revoked,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
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
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<RefreshToken> {
    const query = `
      INSERT INTO refresh_tokens (user_id, token, expires_at, ip_address, user_agent)
      VALUES ($1::uuid, $2, $3::timestamptz, $4, $5)
      RETURNING *
    `;
    const rows = await queryDatabase(query, [
      data.userId,
      data.token,
      data.expiresAt,
      data.ipAddress ?? null,
      data.userAgent ?? null,
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

  async findActiveByUserId(userId: string): Promise<RefreshToken[]> {
    const query = `
      SELECT * FROM refresh_tokens
      WHERE user_id = $1::uuid AND is_revoked = FALSE AND expires_at > NOW() AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;
    const rows = await queryDatabase(query, [userId]);
    return rows.map(mapRowToRefreshToken);
  }

  async revokeById(id: string, userId: string): Promise<boolean> {
    const query = `
      UPDATE refresh_tokens
      SET is_revoked = TRUE
      WHERE id = $1::uuid AND user_id = $2::uuid AND is_revoked = FALSE AND deleted_at IS NULL
      RETURNING id
    `;
    const rows = await queryDatabase(query, [id, userId]);
    return rows.length > 0;
  }

  async revokeAllExcept(userId: string, currentToken: string): Promise<boolean> {
    const query = `
      UPDATE refresh_tokens
      SET is_revoked = TRUE
      WHERE user_id = $1::uuid AND token <> $2 AND is_revoked = FALSE AND deleted_at IS NULL
      RETURNING id
    `;
    const rows = await queryDatabase(query, [userId, currentToken]);
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
