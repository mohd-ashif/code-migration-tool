export function validateReportRequest(body: any): body is { jobId: string; summary?: string } {
  return body && typeof body.jobId === "string";
}
