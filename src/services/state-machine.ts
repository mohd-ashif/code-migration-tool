export type MigrationJobStatus =
  | "QUEUED"
  | "UPLOADING"
  | "PARSING"
  | "ANALYZING"
  | "MIGRATING"
  | "VALIDATING"
  | "AI_HEALING"
  | "PACKAGING"
  | "COMPLETED"
  | "PAUSED"
  | "RETRYING"
  | "CANCELLING"
  | "CANCELLED"
  | "FAILED"
  // Legacy status support mapping
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "paused";

export const ACTIVE_STATUSES: MigrationJobStatus[] = [
  "QUEUED",
  "UPLOADING",
  "PARSING",
  "ANALYZING",
  "MIGRATING",
  "VALIDATING",
  "AI_HEALING",
  "PACKAGING",
  "RETRYING",
  "CANCELLING",
  "pending",
  "processing"
];

export const TERMINAL_STATUSES: MigrationJobStatus[] = [
  "COMPLETED",
  "CANCELLED",
  "FAILED",
  "completed",
  "failed",
  "cancelled"
];

const VALID_TRANSITIONS: Record<string, string[]> = {
  QUEUED: ["UPLOADING", "PARSING", "ANALYZING", "MIGRATING", "PAUSED", "CANCELLING", "CANCELLED", "FAILED"],
  UPLOADING: ["PARSING", "PAUSED", "CANCELLING", "CANCELLED", "FAILED"],
  PARSING: ["ANALYZING", "MIGRATING", "PAUSED", "CANCELLING", "CANCELLED", "FAILED"],
  ANALYZING: ["MIGRATING", "PAUSED", "CANCELLING", "CANCELLED", "FAILED"],
  MIGRATING: ["VALIDATING", "PACKAGING", "PAUSED", "CANCELLING", "CANCELLED", "FAILED"],
  VALIDATING: ["AI_HEALING", "PACKAGING", "PAUSED", "CANCELLING", "CANCELLED", "FAILED"],
  AI_HEALING: ["VALIDATING", "PACKAGING", "PAUSED", "CANCELLING", "CANCELLED", "FAILED"],
  PACKAGING: ["COMPLETED", "FAILED", "CANCELLING", "CANCELLED"],
  PAUSED: ["QUEUED", "PARSING", "ANALYZING", "MIGRATING", "VALIDATING", "AI_HEALING", "PACKAGING", "CANCELLING", "CANCELLED", "FAILED"],
  RETRYING: ["QUEUED", "PARSING", "MIGRATING", "FAILED"],
  CANCELLING: ["CANCELLED", "FAILED"],
  
  // Legacy status mappings
  pending: ["QUEUED", "PARSING", "processing", "paused", "cancelled", "failed", "PAUSED", "CANCELLED", "FAILED"],
  processing: ["PARSING", "ANALYZING", "MIGRATING", "VALIDATING", "PACKAGING", "COMPLETED", "completed", "paused", "cancelled", "failed", "PAUSED", "CANCELLED", "FAILED"],
  paused: ["processing", "QUEUED", "PARSING", "MIGRATING", "cancelled", "failed", "CANCELLED", "FAILED"],
  completed: [],
  failed: ["RETRYING"],
  cancelled: ["RETRYING"],
  COMPLETED: [],
  FAILED: ["RETRYING"],
  CANCELLED: ["RETRYING"]
};

export function isValidTransition(currentStatus: MigrationJobStatus, targetStatus: MigrationJobStatus): boolean {
  if (currentStatus === targetStatus) return true;
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed) return false;
  return allowed.includes(targetStatus);
}

export function isJobPausable(status: MigrationJobStatus): boolean {
  return [
    "QUEUED", "UPLOADING", "PARSING", "ANALYZING", "MIGRATING", "VALIDATING", "AI_HEALING", "processing", "pending"
  ].includes(status);
}

export function isJobResumable(status: MigrationJobStatus): boolean {
  return status === "PAUSED" || status === "paused";
}

export function isJobCancellable(status: MigrationJobStatus): boolean {
  return !TERMINAL_STATUSES.includes(status);
}

export function isJobRetriable(status: MigrationJobStatus): boolean {
  return ["FAILED", "CANCELLED", "failed", "cancelled"].includes(status);
}

export function normalizeStatus(status: string): MigrationJobStatus {
  switch (status) {
    case "pending": return "QUEUED";
    case "processing": return "MIGRATING";
    case "completed": return "COMPLETED";
    case "failed": return "FAILED";
    case "cancelled": return "CANCELLED";
    case "paused": return "PAUSED";
    default: return (status as MigrationJobStatus) || "QUEUED";
  }
}
