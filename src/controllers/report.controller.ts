import { Request, Response, NextFunction } from "express";
import { MigrationReportService } from "../services/MigrationReportService";

const reportService = new MigrationReportService();

export async function handleReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { jobId, summary } = req.body;
    if (!jobId) {
      return res.status(400).json({ success: false, message: "jobId is required." });
    }
    const userId = (req as any).userId;
    const workspaceId = (req as any).workspaceId;

    const report = await reportService.generateAndStoreReport(jobId, userId, workspaceId, summary);
    res.status(200).json({ success: true, report });
  } catch (error) {
    next(error);
  }
}
