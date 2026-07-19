import { queryDatabase } from "../lib/database";
import { MigrationEngineDto, FrameworkStatus, OptimizationLevel, EngineType } from "../types/framework.types";

function mapEngine(row: any): MigrationEngineDto {
  return {
    id: row.id,
    frameworkId: row.framework_id,
    frameworkName: row.framework_name,
    frameworkSlug: row.framework_slug,
    engineName: row.engine_name,
    engineType: row.engine_type as EngineType,
    status: row.status as FrameworkStatus,
    optimizationLevel: row.optimization_level as OptimizationLevel,
    compilerVersion: row.compiler_version,
    astVersion: row.ast_version,
    activeCodemods: row.active_codemods,
    supported: row.supported,
    migrationsRun: row.migrations_run,
    avgDurationMs: row.avg_duration_ms,
    lastUpdated: new Date(row.last_updated).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

export class EngineRepository {
  async findAll(): Promise<MigrationEngineDto[]> {
    const rows = await queryDatabase(`
      SELECT me.*, f.name as framework_name, f.slug as framework_slug
      FROM migration_engines me
      JOIN frameworks f ON f.id = me.framework_id
      ORDER BY me.engine_name ASC
    `);
    return rows.map(mapEngine);
  }

  async findById(id: string): Promise<MigrationEngineDto | null> {
    const rows = await queryDatabase(`
      SELECT me.*, f.name as framework_name, f.slug as framework_slug
      FROM migration_engines me
      JOIN frameworks f ON f.id = me.framework_id
      WHERE me.id = $1
    `, [id]);
    if (!rows.length) return null;
    return mapEngine(rows[0]);
  }

  async findByFrameworkId(frameworkId: string): Promise<MigrationEngineDto[]> {
    const rows = await queryDatabase(`
      SELECT me.*, f.name as framework_name, f.slug as framework_slug
      FROM migration_engines me
      JOIN frameworks f ON f.id = me.framework_id
      WHERE me.framework_id = $1
      ORDER BY me.engine_name ASC
    `, [frameworkId]);
    return rows.map(mapEngine);
  }

  async updateEngine(id: string, patch: Partial<MigrationEngineDto>): Promise<MigrationEngineDto | null> {
    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    if (patch.status !== undefined) {
      sets.push(`status = $${idx++}`);
      vals.push(patch.status);
    }
    if (patch.optimizationLevel !== undefined) {
      sets.push(`optimization_level = $${idx++}`);
      vals.push(patch.optimizationLevel);
    }
    if (patch.compilerVersion !== undefined) {
      sets.push(`compiler_version = $${idx++}`);
      vals.push(patch.compilerVersion);
    }
    if (patch.astVersion !== undefined) {
      sets.push(`ast_version = $${idx++}`);
      vals.push(patch.astVersion);
    }
    if (patch.supported !== undefined) {
      sets.push(`supported = $${idx++}`);
      vals.push(patch.supported);
    }

    if (sets.length === 0) return this.findById(id);

    sets.push(`updated_at = NOW()`);
    sets.push(`last_updated = NOW()`);
    vals.push(id);

    const rows = await queryDatabase(`
      UPDATE migration_engines
      SET ${sets.join(", ")}
      WHERE id = $${idx}
      RETURNING *
    `, vals);

    if (!rows.length) return null;

    // To get joined info, fetch again
    return this.findById(id);
  }

  async incrementMigrationsRun(id: string, durationMs: number): Promise<void> {
    await queryDatabase(`
      UPDATE migration_engines
      SET migrations_run = migrations_run + 1,
          avg_duration_ms = CASE 
            WHEN migrations_run = 0 THEN $1 
            ELSE (avg_duration_ms * migrations_run + $1) / (migrations_run + 1) 
          END,
          last_updated = NOW(),
          updated_at = NOW()
      WHERE id = $2
    `, [durationMs, id]);
  }

  async getCompilerHealth(): Promise<{ engines: number; healthy: number; warnings: number; failed: number; experimental: number; totalMigrationsRun: number; avgDurationMs: number }> {
    const rows = await queryDatabase(`
      SELECT 
        COUNT(*)::int as engines,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END)::int as healthy,
        SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END)::int as warnings,
        SUM(CASE WHEN status IN ('inactive', 'deprecated') THEN 1 ELSE 0 END)::int as failed,
        SUM(CASE WHEN status = 'experimental' THEN 1 ELSE 0 END)::int as experimental,
        COALESCE(SUM(migrations_run), 0)::int as total_migrations_run,
        COALESCE(AVG(avg_duration_ms), 0)::int as avg_duration_ms
      FROM migration_engines
    `);

    const row = rows[0] || {};
    return {
      engines: row.engines || 0,
      healthy: row.healthy || 0,
      warnings: row.warnings || 0,
      failed: row.failed || 0,
      experimental: row.experimental || 0,
      totalMigrationsRun: row.total_migrations_run || 0,
      avgDurationMs: row.avg_duration_ms || 0
    };
  }
}
