import { queryDatabase } from "../lib/database";
import { MigrationJob } from "../models/migration.model";

export function mapRowToJob(row: any): MigrationJob {
  const request = row.request || {};
  const source = row.source_framework || request.sourceFramework || null;
  const target = row.target_framework || request.targetFramework || null;

  // Calculate size from files in request if project_size is null/0
  let projectSize = row.project_size ? parseInt(row.project_size, 10) : 0;
  if (!projectSize && request.projectFiles) {
    for (const f of request.projectFiles) {
      if (f.content) {
        projectSize += Buffer.byteLength(f.content, "utf8");
      }
    }
  }

  // Calculate project name if project_name is null
  let projectName = row.project_name;
  if (!projectName) {
    if (request.projectFiles) {
      const pkg = request.projectFiles.find((f: any) => f.path === "package.json");
      if (pkg) {
        try {
          const parsed = JSON.parse(pkg.content);
          if (parsed.name) {
            projectName = parsed.name;
          }
        } catch (e) {
          // Ignore
        }
      }
    }
    if (!projectName) {
      projectName = `Project_${source || "unknown"}_to_${target}`;
    }
  }

  return {
    id: row.id,
    status: row.status,
    progress: row.progress ?? 0,
    result: row.result ?? null,
    message: row.message ?? null,
    request: row.request ?? null,
    workspace_id: row.workspace_id ?? null,
    user_id: row.user_id ?? null,
    projectName: projectName,
    projectSize: projectSize,
    sourceFramework: source,
    targetFramework: target,
    warningsCount: row.warnings_count ?? 0,
    errorsCount: row.errors_count ?? 0,
    startedAt: row.started_at ? new Date(row.started_at) : (row.created_at ? new Date(row.created_at) : null),
    completedAt: row.completed_at ? new Date(row.completed_at) : (row.status === "completed" && row.updated_at ? new Date(row.updated_at) : null),
    downloadCount: row.download_count ?? 0,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
    created_at: row.created_at ? new Date(row.created_at) : null,
    updated_at: row.updated_at ? new Date(row.updated_at) : null,
    deleted_at: row.deleted_at ? new Date(row.deleted_at) : null,
  };
}

export class MigrationRepository {
  async findById(jobId: string, userId: string, workspaceId: string): Promise<MigrationJob | null> {
    const query = `
      SELECT * FROM migration_jobs
      WHERE id = $1::uuid 
        AND user_id = $2::uuid 
        AND workspace_id = $3::uuid 
        AND deleted_at IS NULL
    `;
    const rows = await queryDatabase(query, [jobId, userId, workspaceId]);
    return rows.length > 0 ? mapRowToJob(rows[0]) : null;
  }

  // Find job without ownership checks (for internal worker updates, but still filters deleted_at)
  async findByIdInternal(jobId: string): Promise<MigrationJob | null> {
    const query = `SELECT * FROM migration_jobs WHERE id = $1::uuid AND deleted_at IS NULL`;
    const rows = await queryDatabase(query, [jobId]);
    return rows.length > 0 ? mapRowToJob(rows[0]) : null;
  }

  async findByUserAndWorkspace(
    userId: string,
    workspaceId: string,
    filters: {
      search?: string;
      status?: string;
      sourceFramework?: string;
      targetFramework?: string;
      dateFrom?: string;
      dateTo?: string;
      sortBy?: string;
      sortOrder?: "ASC" | "DESC";
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ jobs: MigrationJob[]; total: number }> {
    const conditions: string[] = ["user_id = $1::uuid", "workspace_id = $2::uuid", "deleted_at IS NULL"];
    const params: any[] = [userId, workspaceId];
    let paramIndex = 3;

    if (filters.search) {
      conditions.push(`(project_name ILIKE $${paramIndex} OR id::text ILIKE $${paramIndex})`);
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    if (filters.status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(filters.status);
      paramIndex++;
    }

    if (filters.sourceFramework) {
      conditions.push(`source_framework = $${paramIndex}`);
      params.push(filters.sourceFramework);
      paramIndex++;
    }

    if (filters.targetFramework) {
      conditions.push(`target_framework = $${paramIndex}`);
      params.push(filters.targetFramework);
      paramIndex++;
    }

    if (filters.dateFrom) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(new Date(filters.dateFrom));
      paramIndex++;
    }

    if (filters.dateTo) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(new Date(filters.dateTo));
      paramIndex++;
    }

    const whereClause = conditions.join(" AND ");

    // Count total matching
    const countQuery = `SELECT COUNT(*) as total FROM migration_jobs WHERE ${whereClause}`;
    const countRows = await queryDatabase(countQuery, params);
    const total = parseInt(countRows[0]?.total ?? "0", 10);

    // Sorting
    const validSortFields = ["created_at", "project_name", "status", "project_size", "warnings_count", "errors_count"];
    const sortBy = validSortFields.includes(filters.sortBy || "") ? filters.sortBy : "created_at";
    const sortOrder = filters.sortOrder === "ASC" ? "ASC" : "DESC";

    // Pagination
    const limit = filters.limit !== undefined ? filters.limit : 15;
    const offset = filters.offset !== undefined ? filters.offset : 0;

    params.push(limit, offset);
    const query = `
      SELECT * FROM migration_jobs
      WHERE ${whereClause}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const rows = await queryDatabase(query, params);
    return {
      jobs: rows.map(mapRowToJob),
      total,
    };
  }

  async create(data: {
    id: string;
    status: string;
    request: any;
    progress?: number;
    workspaceId: string;
    userId: string;
    projectName?: string;
    projectSize?: number;
    sourceFramework?: string;
    targetFramework?: string;
  }): Promise<MigrationJob> {
    const query = `
      INSERT INTO migration_jobs (
        id, status, request, progress, workspace_id, user_id, 
        project_name, project_size, source_framework, target_framework,
        started_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING *
    `;
    const rows = await queryDatabase(query, [
      data.id,
      data.status,
      JSON.stringify(data.request),
      data.progress ?? 0,
      data.workspaceId,
      data.userId,
      data.projectName ?? "Unnamed Project",
      data.projectSize ?? 0,
      data.sourceFramework ?? null,
      data.targetFramework ?? null,
    ]);
    return mapRowToJob(rows[0]);
  }

  async update(jobId: string, updates: Partial<MigrationJob & { started_at: Date; completed_at: Date; download_count: number }>): Promise<MigrationJob | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let placeholderIndex = 1;

    // Direct mapping updates
    const mapping: Record<string, string> = {
      status: "status",
      progress: "progress",
      result: "result",
      message: "message",
      projectName: "project_name",
      projectSize: "project_size",
      sourceFramework: "source_framework",
      targetFramework: "target_framework",
      warningsCount: "warnings_count",
      errorsCount: "errors_count",
      startedAt: "started_at",
      completedAt: "completed_at",
      downloadCount: "download_count",
    };

    for (const [key, dbCol] of Object.entries(mapping)) {
      if (updates[key as keyof typeof updates] !== undefined) {
        fields.push(`${dbCol} = $${placeholderIndex++}`);
        const val = updates[key as keyof typeof updates];
        values.push(typeof val === "object" && val !== null && !(val instanceof Date) ? JSON.stringify(val) : val);
      }
    }

    if (fields.length === 0) {
      return this.findByIdInternal(jobId);
    }

    values.push(jobId);
    const query = `
      UPDATE migration_jobs
      SET ${fields.join(", ")}, updated_at = NOW()
      WHERE id = $${placeholderIndex}
      RETURNING *
    `;

    const rows = await queryDatabase(query, values);
    return rows.length > 0 ? mapRowToJob(rows[0]) : null;
  }

  async softDelete(jobId: string, userId: string, workspaceId: string): Promise<boolean> {
    const query = `
      UPDATE migration_jobs
      SET deleted_at = NOW()
      WHERE id = $1::uuid 
        AND user_id = $2::uuid 
        AND workspace_id = $3::uuid 
        AND deleted_at IS NULL
      RETURNING id
    `;
    const rows = await queryDatabase(query, [jobId, userId, workspaceId]);
    return rows.length > 0;
  }

  async getRecentJobs(userId: string, workspaceId: string, limit = 10): Promise<MigrationJob[]> {
    const query = `
      SELECT * FROM migration_jobs
      WHERE user_id = $1::uuid 
        AND workspace_id = $2::uuid 
        AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT $3
    `;
    const rows = await queryDatabase(query, [userId, workspaceId, limit]);
    return rows.map(mapRowToJob);
  }

  async getStats(userId: string, workspaceId: string): Promise<{
    totalJobs: number;
    totalDownloads: number;
    totalWarnings: number;
    totalErrors: number;
  }> {
    const query = `
      SELECT 
        COUNT(*) as total_jobs,
        SUM(download_count) as total_downloads,
        SUM(warnings_count) as total_warnings,
        SUM(errors_count) as total_errors
      FROM migration_jobs
      WHERE user_id = $1::uuid 
        AND workspace_id = $2::uuid 
        AND deleted_at IS NULL
    `;
    const rows = await queryDatabase(query, [userId, workspaceId]);
    const r = rows[0] || {};
    return {
      totalJobs: parseInt(r.total_jobs ?? "0", 10),
      totalDownloads: parseInt(r.total_downloads ?? "0", 10),
      totalWarnings: parseInt(r.total_warnings ?? "0", 10),
      totalErrors: parseInt(r.total_errors ?? "0", 10),
    };
  }
}
