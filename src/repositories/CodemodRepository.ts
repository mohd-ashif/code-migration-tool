import { queryDatabase } from "../lib/database";
import { CodemodDto } from "../types/framework.types";

function mapCodemod(row: any): CodemodDto {
  return {
    id: row.id,
    frameworkId: row.framework_id,
    engineId: row.engine_id ?? null,
    name: row.name,
    description: row.description ?? null,
    enabled: row.enabled,
    priority: row.priority,
    version: row.version,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

export class CodemodRepository {
  async findAll(frameworkId?: string): Promise<CodemodDto[]> {
    let query = `SELECT * FROM codemods`;
    const params: any[] = [];
    if (frameworkId) {
      query += ` WHERE framework_id = $1`;
      params.push(frameworkId);
    }
    query += ` ORDER BY priority DESC, name ASC`;
    const rows = await queryDatabase(query, params);
    return rows.map(mapCodemod);
  }

  async findById(id: string): Promise<CodemodDto | null> {
    const rows = await queryDatabase(`SELECT * FROM codemods WHERE id = $1`, [id]);
    if (!rows.length) return null;
    return mapCodemod(rows[0]);
  }

  async updateCodemod(id: string, patch: Partial<CodemodDto>): Promise<CodemodDto | null> {
    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    if (patch.enabled !== undefined) {
      sets.push(`enabled = $${idx++}`);
      vals.push(patch.enabled);
    }
    if (patch.priority !== undefined) {
      sets.push(`priority = $${idx++}`);
      vals.push(patch.priority);
    }

    if (sets.length === 0) return this.findById(id);

    sets.push(`updated_at = NOW()`);
    vals.push(id);

    const rows = await queryDatabase(`
      UPDATE codemods
      SET ${sets.join(", ")}
      WHERE id = $${idx}
      RETURNING *
    `, vals);

    if (!rows.length) return null;
    return mapCodemod(rows[0]);
  }
}
