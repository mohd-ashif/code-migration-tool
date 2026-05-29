import { ReportRequest, ReportSummary } from "../types/migration.types";

export async function generateReport(request: ReportRequest): Promise<ReportSummary> {
  return {
    jobId: request.jobId,
    summary: request.summary ?? "Migration report was generated successfully.",
    timestamp: new Date().toISOString(),
    metrics: {
      migratedFiles: 0,
      warnings: [],
      errors: [],
    },
  };
}
