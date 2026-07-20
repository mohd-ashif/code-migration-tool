import { queryDatabase } from "../lib/database";
import { AuthProvider } from "../models/auth.model";


export function mapRowToAuthProvider(row: any): AuthProvider {
  return {
    id: row.id,
    userId: row.user_id,
    providerName: row.provider_name,
    providerUserId: row.provider_user_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
  };
}

export class AuthProviderRepository {

  async findById(id: string, includeDeleted = false): Promise<AuthProvider | null> {
    const query = includeDeleted
      ? "SELECT * FROM auth_providers WHERE id = $1::uuid"
      : "SELECT * FROM auth_providers WHERE id = $1::uuid AND deleted_at IS NULL";
    
    const rows = await queryDatabase(query, [id]);
    return rows.length > 0 ? mapRowToAuthProvider(rows[0]) : null;
  }


  async findByProvider(providerName: string, providerUserId: string, includeDeleted = false): Promise<AuthProvider | null> {
    const query = includeDeleted
      ? "SELECT * FROM auth_providers WHERE provider_name = $1 AND provider_user_id = $2"
      : "SELECT * FROM auth_providers WHERE provider_name = $1 AND provider_user_id = $2 AND deleted_at IS NULL";
    
    const rows = await queryDatabase(query, [providerName, providerUserId]);
    return rows.length > 0 ? mapRowToAuthProvider(rows[0]) : null;
  }


  async findByUserId(userId: string, includeDeleted = false): Promise<AuthProvider[]> {
    const query = includeDeleted
      ? "SELECT * FROM auth_providers WHERE user_id = $1::uuid ORDER BY created_at ASC"
      : "SELECT * FROM auth_providers WHERE user_id = $1::uuid AND deleted_at IS NULL ORDER BY created_at ASC";
    
    const rows = await queryDatabase(query, [userId]);
    return rows.map(mapRowToAuthProvider);
  }


  async create(data: {
    userId: string;
    providerName: string;
    providerUserId: string;
  }): Promise<AuthProvider> {
    const query = `
      INSERT INTO auth_providers (user_id, provider_name, provider_user_id)
      VALUES ($1::uuid, $2, $3)
      RETURNING *
    `;
    const rows = await queryDatabase(query, [
      data.userId,
      data.providerName,
      data.providerUserId,
    ]);
    return mapRowToAuthProvider(rows[0]);
  }


  async deleteSoft(id: string): Promise<boolean> {
    const query = `
      UPDATE auth_providers
      SET deleted_at = NOW()
      WHERE id = $1::uuid AND deleted_at IS NULL
      RETURNING id
    `;
    const rows = await queryDatabase(query, [id]);
    return rows.length > 0;
  }

  async deleteByProviderAndUser(userId: string, providerName: string): Promise<boolean> {
    const query = `
      UPDATE auth_providers
      SET deleted_at = NOW()
      WHERE user_id = $1::uuid AND provider_name = $2 AND deleted_at IS NULL
      RETURNING id
    `;
    const rows = await queryDatabase(query, [userId, providerName]);
    return rows.length > 0;
  }


  async deleteHard(id: string): Promise<boolean> {
    const query = "DELETE FROM auth_providers WHERE id = $1::uuid RETURNING id";
    const rows = await queryDatabase(query, [id]);
    return rows.length > 0;
  }
}
