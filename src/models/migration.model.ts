import { JobRecord } from "../services/job.service";

export interface MigrationJob extends JobRecord {
  workspace_id?: string | null;
  user_id?: string | null;
  projectName?: string;
  projectSize?: number;
  sourceFramework?: string;
  targetFramework?: string;
  warningsCount?: number;
  errorsCount?: number;
  startedAt?: Date | null;
  completedAt?: Date | null;
  downloadCount?: number;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
  created_at?: Date | null;
  updated_at?: Date | null;
  deleted_at?: Date | null;
}

export interface MigrationReport {
  id: string;
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
  metrics: {
    migratedFiles: number;
    warningsCount?: number;
    errorsCount?: number;
    [key: string]: any;
  };
  reportJson: any;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

export interface UploadedProject {
  id: string;
  workspaceId: string;
  userId: string;
  jobId: string;
  originalFilename: string;
  storagePath: string;
  size: number;
  checksum: string;
  createdAt: Date;
}
