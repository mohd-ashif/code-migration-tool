import { queryDatabase } from "../lib/database";
import { Workspace } from "../models/workspace.model";

export class WorkspaceRepository {
  async create(ws: { 
    name: string; 
    slug: string; 
    ownerId: string; 
    description?: string | null; 
    logoUrl?: string | null; 
    planId?: string;
    storageLimit?: number;
    timezone?: string;
    country?: string | null;
  }): Promise<Workspace> {
    const rows = await queryDatabase(
      `INSERT INTO workspaces (
         name, slug, owner_id, description, logo_url, plan_id, 
         storage_used, storage_limit, migration_count, status, timezone, country
       )
       VALUES ($1, $2, $3, $4, $5, $6, 0, $7, 0, 'active', $8, $9)
       RETURNING id, name, slug, description, logo_url AS "logoUrl", owner_id AS "ownerId", 
                 plan_id AS "planId", storage_used AS "storageUsed", storage_limit AS "storageLimit", 
                 migration_count AS "migrationCount", status, timezone, country, 
                 created_at AS "createdAt", updated_at AS "updatedAt", deleted_at AS "deletedAt"`,
      [
        ws.name,
        ws.slug,
        ws.ownerId,
        ws.description || null,
        ws.logoUrl || null,
        ws.planId || 'free',
        ws.storageLimit || 104857600, // 100MB
        ws.timezone || 'UTC',
        ws.country || null
      ]
    );
    return rows[0];
  }

  async findById(id: string): Promise<Workspace | null> {
    const rows = await queryDatabase(
      `SELECT id, name, slug, description, logo_url AS "logoUrl", owner_id AS "ownerId", 
              plan_id AS "planId", storage_used AS "storageUsed", storage_limit AS "storageLimit", 
              migration_count AS "migrationCount", status, timezone, country, 
              created_at AS "createdAt", updated_at AS "updatedAt", deleted_at AS "deletedAt"
       FROM workspaces
       WHERE id = $1::uuid AND deleted_at IS NULL`,
      [id]
    );
    return rows[0] || null;
  }

  async findBySlug(slug: string): Promise<Workspace | null> {
    const rows = await queryDatabase(
      `SELECT id, name, slug, description, logo_url AS "logoUrl", owner_id AS "ownerId", 
              plan_id AS "planId", storage_used AS "storageUsed", storage_limit AS "storageLimit", 
              migration_count AS "migrationCount", status, timezone, country, 
              created_at AS "createdAt", updated_at AS "updatedAt", deleted_at AS "deletedAt"
       FROM workspaces
       WHERE LOWER(slug) = LOWER($1) AND deleted_at IS NULL`,
      [slug]
    );
    return rows[0] || null;
  }

  async update(id: string, updates: Partial<Workspace>): Promise<Workspace> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const columnMapping: Record<string, string> = {
      name: 'name',
      slug: 'slug',
      description: 'description',
      logoUrl: 'logo_url',
      ownerId: 'owner_id',
      planId: 'plan_id',
      storageUsed: 'storage_used',
      storageLimit: 'storage_limit',
      migrationCount: 'migration_count',
      status: 'status',
      timezone: 'timezone',
      country: 'country'
    };

    for (const [key, dbCol] of Object.entries(columnMapping)) {
      if (updates[key as keyof typeof updates] !== undefined) {
        fields.push(`${dbCol} = $${idx++}`);
        values.push(updates[key as keyof typeof updates]);
      }
    }

    if (fields.length === 0) {
      const current = await this.findById(id);
      if (!current) throw new Error("Workspace not found");
      return current;
    }

    values.push(id);
    const rows = await queryDatabase(
      `UPDATE workspaces
       SET ${fields.join(", ")}, updated_at = NOW()
       WHERE id = $${idx}::uuid AND deleted_at IS NULL
       RETURNING id, name, slug, description, logo_url AS "logoUrl", owner_id AS "ownerId", 
                 plan_id AS "planId", storage_used AS "storageUsed", storage_limit AS "storageLimit", 
                 migration_count AS "migrationCount", status, timezone, country, 
                 created_at AS "createdAt", updated_at AS "updatedAt", deleted_at AS "deletedAt"`,
      values
    );
    return rows[0];
  }

  async delete(id: string): Promise<void> {
    await queryDatabase(
      `UPDATE workspaces SET deleted_at = NOW() WHERE id = $1::uuid`,
      [id]
    );
    await queryDatabase(
      `UPDATE workspace_members SET deleted_at = NOW() WHERE workspace_id = $1::uuid`,
      [id]
    );
  }

  async listUserWorkspaces(userId: string): Promise<(Workspace & { role: string })[]> {
    const rows = await queryDatabase(
      `SELECT w.id, w.name, w.slug, w.description, w.logo_url AS "logoUrl", w.owner_id AS "ownerId", 
              w.plan_id AS "planId", w.storage_used AS "storageUsed", w.storage_limit AS "storageLimit", 
              w.migration_count AS "migrationCount", w.status, w.timezone, w.country, 
              w.created_at AS "createdAt", w.updated_at AS "updatedAt", w.deleted_at AS "deletedAt",
              wm.role
       FROM workspaces w
       INNER JOIN workspace_members wm ON wm.workspace_id = w.id
       WHERE wm.user_id = $1::uuid AND w.deleted_at IS NULL AND wm.deleted_at IS NULL`,
      [userId]
    );
    return rows;
  }
}
