import { queryDatabase } from "../lib/database";
import { User } from "../models/auth.model";


export function mapRowToUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    isEmailVerified: row.is_email_verified,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
  };
}

export class UserRepository {

  async findById(id: string, includeDeleted = false): Promise<User | null> {
    const query = includeDeleted
      ? "SELECT * FROM users WHERE id = $1::uuid"
      : "SELECT * FROM users WHERE id = $1::uuid AND deleted_at IS NULL";
    
    const rows = await queryDatabase(query, [id]);
    return rows.length > 0 ? mapRowToUser(rows[0]) : null;
  }

  async findByEmail(email: string, includeDeleted = false): Promise<User | null> {
    const query = includeDeleted
      ? "SELECT * FROM users WHERE LOWER(email) = LOWER($1)"
      : "SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL";
    
    const rows = await queryDatabase(query, [email]);
    return rows.length > 0 ? mapRowToUser(rows[0]) : null;
  }

  async create(data: {
    email: string;
    passwordHash?: string | null;
    isEmailVerified?: boolean;
  }): Promise<User> {
    const isEmailVerified = data.isEmailVerified ?? false;
    const query = `
      INSERT INTO users (email, password_hash, is_email_verified)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const rows = await queryDatabase(query, [
      data.email.trim(),
      data.passwordHash ?? null,
      isEmailVerified,
    ]);
    return mapRowToUser(rows[0]);
  }


  async update(
    id: string,
    updates: Partial<{
      email: string;
      passwordHash: string | null;
      isEmailVerified: boolean;
      deletedAt: Date | null;
    }>
  ): Promise<User | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let placeholderIndex = 1;

    // Normalizing keys to snake_case for DB columns
    if (updates.email !== undefined) {
      fields.push(`email = $${placeholderIndex++}`);
      values.push(updates.email.trim());
    }
    if (updates.passwordHash !== undefined) {
      fields.push(`password_hash = $${placeholderIndex++}`);
      values.push(updates.passwordHash);
    }
    if (updates.isEmailVerified !== undefined) {
      fields.push(`is_email_verified = $${placeholderIndex++}`);
      values.push(updates.isEmailVerified);
    }
    if (updates.deletedAt !== undefined) {
      fields.push(`deleted_at = $${placeholderIndex++}`);
      values.push(updates.deletedAt);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const query = `
      UPDATE users
      SET ${fields.join(", ")}
      WHERE id = $${placeholderIndex}
      RETURNING *
    `;

    const rows = await queryDatabase(query, values);
    return rows.length > 0 ? mapRowToUser(rows[0]) : null;
  }


  async deleteSoft(id: string): Promise<boolean> {
    const query = `
      UPDATE users
      SET deleted_at = NOW()
      WHERE id = $1::uuid AND deleted_at IS NULL
      RETURNING id
    `;
    const rows = await queryDatabase(query, [id]);
    return rows.length > 0;
  }


  async deleteHard(id: string): Promise<boolean> {
    const query = "DELETE FROM users WHERE id = $1::uuid RETURNING id";
    const rows = await queryDatabase(query, [id]);
    return rows.length > 0;
  }
}
