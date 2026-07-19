import { queryDatabase } from "../lib/database";
import {
  FrameworkRow,
  FrameworkVersionRow,
  CodemodRow,
  SupportedMigrationRow,
  CompilerSettingsRow,
  FrameworkDto,
  FrameworkVersionDto,
  SupportedMigrationDto,
  CompilerSettingsDto,
  FrameworkDetailDto,
} from "../types/framework.types";
import { EngineRepository } from "./EngineRepository";

// ── Row → DTO mappers ─────────────────────────────────────────────────────────

function mapFramework(row: any): FrameworkDto {
  return {
    id:               row.id,
    name:             row.name,
    slug:             row.slug,
    displayName:      row.display_name,
    logo:             row.logo,
    category:         row.category,
    currentVersion:   row.current_version,
    description:      row.description ?? null,
    documentationUrl: row.documentation_url ?? null,
    homepageUrl:      row.homepage_url ?? null,
    status:           row.status,
    engineCount:      row.engine_count != null ? parseInt(row.engine_count, 10) : undefined,
    codemodCount:     row.codemod_count != null ? parseInt(row.codemod_count, 10) : undefined,
    migrationsRun:    row.migrations_run != null ? parseInt(row.migrations_run, 10) : undefined,
    avgSuccessRate:   row.avg_success_rate != null ? parseFloat(row.avg_success_rate) : undefined,
    createdAt:        new Date(row.created_at).toISOString(),
    updatedAt:        new Date(row.updated_at).toISOString(),
  };
}

function mapVersion(row: any): FrameworkVersionDto {
  return {
    id:                  row.id,
    frameworkId:         row.framework_id,
    version:             row.version,
    releaseDate:         row.release_date ? new Date(row.release_date).toISOString().split("T")[0] : null,
    isLatest:            row.is_latest,
    isSupported:         row.is_supported,
    minimumNodeVersion:  row.minimum_node_version ?? null,
    notes:               row.notes ?? null,
  };
}

function mapCodemod(row: any): import("../types/framework.types").CodemodDto {
  return {
    id:          row.id,
    frameworkId: row.framework_id,
    engineId:    row.engine_id ?? null,
    name:        row.name,
    description: row.description ?? null,
    enabled:     row.enabled,
    priority:    row.priority,
    version:     row.version,
    createdAt:   new Date(row.created_at).toISOString(),
    updatedAt:   new Date(row.updated_at).toISOString(),
  };
}

function mapSupportedMigration(row: any): SupportedMigrationDto {
  return {
    id:                   row.id,
    source:               row.source_slug,
    sourceName:           row.source_name,
    target:               row.target_slug,
    targetName:           row.target_name,
    supported:            row.supported,
    qualityScore:         row.quality_score,
    stability:            row.stability,
    estimatedSuccessRate: parseFloat(row.estimated_success_rate),
  };
}

function mapSettings(row: any): CompilerSettingsDto {
  return {
    id:                   row.id,
    frameworkId:          row.framework_id,
    parallelProcessing:   row.parallel_processing,
    optimization:         row.optimization,
    treeShaking:          row.tree_shaking,
    sourceMaps:           row.source_maps,
    strictMode:           row.strict_mode,
    experimentalFeatures: row.experimental_features,
    maxFileSize:          row.max_file_size,
    timeout:              row.timeout,
    memoryLimit:          row.memory_limit,
  };
}

// ── Repository ────────────────────────────────────────────────────────────────

export class FrameworkRepository {
  private engineRepo = new EngineRepository();

  /**
   * GET /api/frameworks — all frameworks with aggregate stats joined
   */
  async findAll(): Promise<FrameworkDto[]> {
    const rows = await queryDatabase(`
      SELECT
        f.*,
        COUNT(DISTINCT me.id)::int                        AS engine_count,
        COUNT(DISTINCT c.id)::int                         AS codemod_count,
        COALESCE(SUM(me.migrations_run), 0)::int          AS migrations_run,
        COALESCE(AVG(sm.estimated_success_rate), 0)::float AS avg_success_rate
      FROM frameworks f
      LEFT JOIN migration_engines  me ON me.framework_id = f.id AND me.status = 'active'
      LEFT JOIN codemods            c ON c.framework_id  = f.id AND c.enabled = true
      LEFT JOIN supported_migrations sm
             ON sm.source_framework_id = f.id AND sm.supported = true
      GROUP BY f.id
      ORDER BY f.name ASC
    `);
    return rows.map(mapFramework);
  }

  /**
   * GET /api/frameworks/:id — full detail including related entities
   */
  async findById(id: string): Promise<FrameworkDetailDto | null> {
    // Framework base
    const fwRows = await queryDatabase(`
      SELECT f.*,
        COUNT(DISTINCT me.id)::int                        AS engine_count,
        COUNT(DISTINCT c.id)::int                         AS codemod_count,
        COALESCE(SUM(me.migrations_run), 0)::int          AS migrations_run,
        COALESCE(AVG(sm.estimated_success_rate), 0)::float AS avg_success_rate
      FROM frameworks f
      LEFT JOIN migration_engines  me ON me.framework_id = f.id AND me.status = 'active'
      LEFT JOIN codemods            c ON c.framework_id  = f.id AND c.enabled = true
      LEFT JOIN supported_migrations sm
             ON sm.source_framework_id = f.id AND sm.supported = true
      WHERE f.id = $1
      GROUP BY f.id
    `, [id]);

    if (!fwRows.length) return null;

    const [versionsRows, enginesRows, codemodsRows, matrixRows, settingsRows] = await Promise.all([
      queryDatabase(`SELECT * FROM framework_versions WHERE framework_id = $1 ORDER BY release_date DESC NULLS LAST`, [id]),
      this.engineRepo.findByFrameworkId(id),
      queryDatabase(`SELECT * FROM codemods WHERE framework_id = $1 ORDER BY priority DESC, name ASC`, [id]),
      queryDatabase(`
        SELECT sm.*,
          fs.slug AS source_slug, fs.name AS source_name,
          ft.slug AS target_slug, ft.name AS target_name
        FROM supported_migrations sm
        JOIN frameworks fs ON fs.id = sm.source_framework_id
        JOIN frameworks ft ON ft.id = sm.target_framework_id
        WHERE sm.source_framework_id = $1 OR sm.target_framework_id = $1
        ORDER BY sm.quality_score DESC
      `, [id]),
      queryDatabase(`SELECT * FROM compiler_settings WHERE framework_id = $1`, [id]),
    ]);

    return {
      framework:          mapFramework(fwRows[0]),
      versions:           versionsRows.map(mapVersion),
      engines:            enginesRows,
      codemods:           codemodsRows.map(mapCodemod),
      supportedMigrations: matrixRows.map(mapSupportedMigration),
      settings:           settingsRows.length ? mapSettings(settingsRows[0]) : null,
    };
  }

  /**
   * GET /api/migration-matrix — full cross-framework capability matrix
   */
  async findMigrationMatrix(): Promise<SupportedMigrationDto[]> {
    const rows = await queryDatabase(`
      SELECT sm.*,
        fs.slug AS source_slug, fs.name AS source_name,
        ft.slug AS target_slug, ft.name AS target_name
      FROM supported_migrations sm
      JOIN frameworks fs ON fs.id = sm.source_framework_id
      JOIN frameworks ft ON ft.id = sm.target_framework_id
      ORDER BY sm.quality_score DESC, fs.name ASC, ft.name ASC
    `);
    return rows.map(mapSupportedMigration);
  }

  /**
   * GET compiler settings for a framework
   */
  async findSettings(frameworkId: string): Promise<CompilerSettingsDto | null> {
    const rows = await queryDatabase(
      `SELECT * FROM compiler_settings WHERE framework_id = $1`,
      [frameworkId]
    );
    return rows.length ? mapSettings(rows[0]) : null;
  }

  /**
   * PATCH compiler settings (admin only)
   */
  async updateSettings(id: string, patch: Partial<CompilerSettingsDto>): Promise<CompilerSettingsDto | null> {
    const colMap: Record<string, string> = {
      parallelProcessing:   "parallel_processing",
      optimization:         "optimization",
      treeShaking:          "tree_shaking",
      sourceMaps:           "source_maps",
      strictMode:           "strict_mode",
      experimentalFeatures: "experimental_features",
      maxFileSize:          "max_file_size",
      timeout:              "timeout",
      memoryLimit:          "memory_limit",
    };

    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;

    for (const [key, col] of Object.entries(colMap)) {
      if (patch[key as keyof CompilerSettingsDto] !== undefined) {
        sets.push(`${col} = $${idx++}`);
        vals.push(patch[key as keyof CompilerSettingsDto]);
      }
    }

    if (!sets.length) return null;

    sets.push(`updated_at = NOW()`);
    vals.push(id);

    const rows = await queryDatabase(
      `UPDATE compiler_settings SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      vals
    );
    return rows.length ? mapSettings(rows[0]) : null;
  }
}
