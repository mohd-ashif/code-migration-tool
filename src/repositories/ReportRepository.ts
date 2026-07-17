import { queryDatabase } from "../lib/database";
import { MigrationReport } from "../models/migration.model";

export function mapRowToReport(row: any): MigrationReport {
  return {
    id: row.id,
    jobId: row.job_id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    summary: row.summary ?? "",
    qualityScore: row.quality_score ?? 0,
    warnings: Array.isArray(row.warnings) ? row.warnings : [],
    errors: Array.isArray(row.errors) ? row.errors : [],
    aiSelfHealing: Array.isArray(row.ai_self_healing) ? row.ai_self_healing : [],
    compilerOutput: row.compiler_output ?? "",
    dependencyGraph: row.dependency_graph ?? null,
    metrics: row.metrics ?? { migratedFiles: 0, warningsCount: 0, errorsCount: 0 },
    reportJson: row.report_json ?? null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
  };
}

export class ReportRepository {
  async findById(jobId: string, userId: string, workspaceId: string): Promise<MigrationReport | null> {
    const query = `
      SELECT * FROM migration_reports
      WHERE job_id = $1::uuid 
        AND user_id = $2::uuid 
        AND workspace_id = $3::uuid 
        AND deleted_at IS NULL
    `;
    const rows = await queryDatabase(query, [jobId, userId, workspaceId]);
    return rows.length > 0 ? mapRowToReport(rows[0]) : null;
  }

  async findByUserAndWorkspace(
    userId: string,
    workspaceId: string,
    filters: { limit?: number; offset?: number } = {}
  ): Promise<{ reports: MigrationReport[]; total: number }> {
    const conditions = ["user_id = $1::uuid", "workspace_id = $2::uuid", "deleted_at IS NULL"];
    const params: any[] = [userId, workspaceId];

    const whereClause = conditions.join(" AND ");

    const countQuery = `SELECT COUNT(*) as total FROM migration_reports WHERE ${whereClause}`;
    const countRows = await queryDatabase(countQuery, params);
    const total = parseInt(countRows[0]?.total ?? "0", 10);

    const limit = filters.limit !== undefined ? filters.limit : 15;
    const offset = filters.offset !== undefined ? filters.offset : 0;

    params.push(limit, offset);
    const query = `
      SELECT * FROM migration_reports
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4
    `;

    const rows = await queryDatabase(query, params);
    return {
      reports: rows.map(mapRowToReport),
      total,
    };
  }

  async create(data: {
    jobId: string;
    workspaceId: string;
    userId: string;
    summary: string;
    qualityScore: number;
    warnings: string[];
    errors: string[];
    aiSelfHealing: string[];
    compilerOutput: string;
    dependencyGraph: any;
    metrics: any;
    reportJson: any;
  }): Promise<MigrationReport> {
    const query = `
      INSERT INTO migration_reports (
        job_id, workspace_id, user_id, summary, quality_score,
        warnings, errors, ai_self_healing, compiler_output,
        dependency_graph, metrics, report_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;
    const rows = await queryDatabase(query, [
      data.jobId,
      data.workspaceId,
      data.userId,
      data.summary,
      data.qualityScore,
      JSON.stringify(data.warnings),
      JSON.stringify(data.errors),
      JSON.stringify(data.aiSelfHealing),
      data.compilerOutput,
      JSON.stringify(data.dependencyGraph),
      JSON.stringify(data.metrics),
      JSON.stringify(data.reportJson),
    ]);
    return mapRowToReport(rows[0]);
  }

  async softDelete(jobId: string, userId: string, workspaceId: string): Promise<boolean> {
    const query = `
      UPDATE migration_reports
      SET deleted_at = NOW()
      WHERE job_id = $1::uuid 
        AND user_id = $2::uuid 
        AND workspace_id = $3::uuid 
        AND deleted_at IS NULL
      RETURNING id
    `;
    const rows = await queryDatabase(query, [jobId, userId, workspaceId]);
    return rows.length > 0;
  }
}
