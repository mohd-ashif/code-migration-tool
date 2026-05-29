import { ParsedFile } from "./parser.types";

export type TargetFramework = "react" | "next" | "typescript" | "vue";
export type SourceFramework = "angular" | "vue" | "react" | "javascript" | "typescript";

export interface MigrationRequest {
  jobId?: string;
  projectFiles: ParsedFile[];
  targetFramework: TargetFramework;
  sourceFramework?: SourceFramework;
}

export interface MigrationResult {
  success: boolean;
  targetFramework: TargetFramework;
  migratedFiles: ParsedFile[];
  metadata: {
    fileCount: number;
    origin: string;
  };
}

export interface ReportRequest {
  jobId: string;
  summary?: string;
}

export interface ReportSummary {
  jobId: string;
  summary: string;
  timestamp: string;
  metrics: {
    migratedFiles: number;
    warnings: string[];
    errors: string[];
  };
}
