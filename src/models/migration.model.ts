import { JobRecord } from "../services/job.service";

export interface MigrationJobEvent {
  id: string;
  jobId: string;
  eventType: string;
  stage?: string;
  progress?: number;
  message?: string;
  metadata?: any;
  createdAt: Date;
}

export interface MigrationJob extends JobRecord {
  id: string;
  status: any;
  progress?: number;
  result?: any;
  message?: string | null;
  request?: any;
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
  currentStage?: string | null;
  attemptCount?: number;
  maxAttempts?: number;
  queuedAt?: Date | null;
  failedAt?: Date | null;
  pausedAt?: Date | null;
  cancelledAt?: Date | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  workerId?: string | null;
  inputFileCount?: number;
  processedFileCount?: number;
  outputFileCount?: number;
  inputSizeBytes?: number;
  outputSizeBytes?: number;
  retryOfJobId?: string | null;
  originalJobId?: string | null;
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
