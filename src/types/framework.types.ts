// ── Framework Management — TypeScript Type Definitions ────────────────────────

export type FrameworkStatus = "active" | "inactive" | "maintenance" | "experimental" | "deprecated";
export type EngineType      = "ast" | "sfc" | "compiler" | "optimizer" | "translator" | "mapper";
export type OptimizationLevel = "ultra" | "high" | "medium" | "low";
export type Stability       = "stable" | "beta" | "experimental" | "unstable";

// ── DB Row Shapes ─────────────────────────────────────────────────────────────

export interface FrameworkRow {
  id: string;
  name: string;
  slug: string;
  display_name: string;
  logo: string;
  category: string;
  current_version: string;
  description: string | null;
  documentation_url: string | null;
  homepage_url: string | null;
  status: FrameworkStatus;
  created_at: Date;
  updated_at: Date;
}

export interface FrameworkVersionRow {
  id: string;
  framework_id: string;
  version: string;
  release_date: Date | null;
  is_latest: boolean;
  is_supported: boolean;
  minimum_node_version: string | null;
  notes: string | null;
  created_at: Date;
}

export interface MigrationEngineRow {
  id: string;
  framework_id: string;
  engine_name: string;
  engine_type: EngineType;
  status: FrameworkStatus;
  optimization_level: OptimizationLevel;
  compiler_version: string;
  ast_version: string;
  active_codemods: number;
  supported: boolean;
  migrations_run: number;
  avg_duration_ms: number;
  last_updated: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CodemodRow {
  id: string;
  framework_id: string;
  engine_id: string | null;
  name: string;
  description: string | null;
  enabled: boolean;
  priority: number;
  version: string;
  created_at: Date;
  updated_at: Date;
}

export interface SupportedMigrationRow {
  id: string;
  source_framework_id: string;
  target_framework_id: string;
  supported: boolean;
  quality_score: number;
  stability: Stability;
  estimated_success_rate: number;
  created_at: Date;
}

export interface CompilerSettingsRow {
  id: string;
  framework_id: string;
  parallel_processing: boolean;
  optimization: boolean;
  tree_shaking: boolean;
  source_maps: boolean;
  strict_mode: boolean;
  experimental_features: boolean;
  max_file_size: number;
  timeout: number;
  memory_limit: number;
  created_at: Date;
  updated_at: Date;
}

// ── API DTOs (camelCase for frontend) ────────────────────────────────────────

export interface FrameworkDto {
  id: string;
  name: string;
  slug: string;
  displayName: string;
  logo: string;
  category: string;
  currentVersion: string;
  description: string | null;
  documentationUrl: string | null;
  homepageUrl: string | null;
  status: FrameworkStatus;
  // Joined stats
  engineCount?: number;
  codemodCount?: number;
  migrationsRun?: number;
  avgSuccessRate?: number;
  createdAt: string;
  updatedAt: string;
}

export interface FrameworkVersionDto {
  id: string;
  frameworkId: string;
  version: string;
  releaseDate: string | null;
  isLatest: boolean;
  isSupported: boolean;
  minimumNodeVersion: string | null;
  notes: string | null;
}

export interface MigrationEngineDto {
  id: string;
  frameworkId: string;
  frameworkName?: string;
  frameworkSlug?: string;
  engineName: string;
  engineType: EngineType;
  status: FrameworkStatus;
  optimizationLevel: OptimizationLevel;
  compilerVersion: string;
  astVersion: string;
  activeCodemods: number;
  supported: boolean;
  migrationsRun: number;
  avgDurationMs: number;
  lastUpdated: string;
  createdAt: string;
  updatedAt: string;
}

export interface CodemodDto {
  id: string;
  frameworkId: string;
  engineId: string | null;
  name: string;
  description: string | null;
  enabled: boolean;
  priority: number;
  version: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportedMigrationDto {
  id: string;
  source: string;           // slug
  sourceName: string;
  target: string;           // slug
  targetName: string;
  supported: boolean;
  qualityScore: number;
  stability: Stability;
  estimatedSuccessRate: number;
}

export interface CompilerSettingsDto {
  id: string;
  frameworkId: string;
  parallelProcessing: boolean;
  optimization: boolean;
  treeShaking: boolean;
  sourceMaps: boolean;
  strictMode: boolean;
  experimentalFeatures: boolean;
  maxFileSize: number;
  timeout: number;
  memoryLimit: number;
}

export interface FrameworkDetailDto {
  framework: FrameworkDto;
  versions: FrameworkVersionDto[];
  engines: MigrationEngineDto[];
  codemods: CodemodDto[];
  supportedMigrations: SupportedMigrationDto[];
  settings: CompilerSettingsDto | null;
}

export interface CompilerHealthDto {
  engines: number;
  healthy: number;
  warnings: number;    // maintenance
  failed: number;      // inactive / deprecated
  experimental: number;
  totalMigrationsRun: number;
  avgDurationMs: number;
  lastChecked: string;
}

// ── Patch Payloads (from API body) ───────────────────────────────────────────

export interface PatchEnginePayload {
  status?: FrameworkStatus;
  optimizationLevel?: OptimizationLevel;
  compilerVersion?: string;
  astVersion?: string;
  supported?: boolean;
}

export interface PatchCodemodPayload {
  enabled?: boolean;
  priority?: number;
}

export interface PatchCompilerSettingsPayload {
  parallelProcessing?: boolean;
  optimization?: boolean;
  treeShaking?: boolean;
  sourceMaps?: boolean;
  strictMode?: boolean;
  experimentalFeatures?: boolean;
  maxFileSize?: number;
  timeout?: number;
  memoryLimit?: number;
}
