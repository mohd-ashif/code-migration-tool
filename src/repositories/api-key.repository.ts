import { queryDatabase } from "../lib/database";
import { ApiKey } from "../models/auth.model";

export function mapRowToApiKey(row: any): ApiKey {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    keyHash: row.key_hash,
    prefix: row.prefix,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : null,
    workspaceId: row.workspace_id || null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
  };
}

export class ApiKeyRepository {
  async findById(id: string): Promise<ApiKey | null> {
    const query = "SELECT * FROM api_keys WHERE id = $1::uuid AND deleted_at IS NULL";
    const rows = await queryDatabase(query, [id]);
    return rows.length > 0 ? mapRowToApiKey(rows[0]) : null;
  }

  async findByKeyHash(keyHash: string): Promise<ApiKey | null> {
    const query = "SELECT * FROM api_keys WHERE key_hash = $1 AND deleted_at IS NULL";
    const rows = await queryDatabase(query, [keyHash]);
    return rows.length > 0 ? mapRowToApiKey(rows[0]) : null;
  }

  async findByUserId(userId: string): Promise<ApiKey[]> {
    const query = "SELECT * FROM api_keys WHERE user_id = $1::uuid AND deleted_at IS NULL ORDER BY created_at DESC";
    const rows = await queryDatabase(query, [userId]);
    return rows.map(mapRowToApiKey);
  }

  async findByWorkspaceId(workspaceId: string): Promise<ApiKey[]> {
    const query = "SELECT * FROM api_keys WHERE workspace_id = $1::uuid AND deleted_at IS NULL ORDER BY created_at DESC";
    const rows = await queryDatabase(query, [workspaceId]);
    return rows.map(mapRowToApiKey);
  }

  async create(data: {
    userId: string;
    name: string;
    keyHash: string;
    prefix: string;
    expiresAt?: Date | null;
    workspaceId?: string | null;
  }): Promise<ApiKey> {
    const query = `
      INSERT INTO api_keys (user_id, name, key_hash, prefix, expires_at, workspace_id)
      VALUES ($1::uuid, $2, $3, $4, $5, $6::uuid)
      RETURNING *
    `;
    const rows = await queryDatabase(query, [
      data.userId,
      data.name,
      data.keyHash,
      data.prefix,
      data.expiresAt ?? null,
      data.workspaceId ?? null,
    ]);
    return mapRowToApiKey(rows[0]);
  }

  async updateLastUsed(id: string): Promise<void> {
    const query = "UPDATE api_keys SET last_used_at = NOW() WHERE id = $1::uuid";
    await queryDatabase(query, [id]);
  }

  async deleteSoft(id: string, userId: string): Promise<boolean> {
    const query = `
      UPDATE api_keys
      SET deleted_at = NOW()
      WHERE id = $1::uuid AND user_id = $2::uuid AND deleted_at IS NULL
      RETURNING id
    `;
    const rows = await queryDatabase(query, [id, userId]);
    return rows.length > 0;
  }
}
