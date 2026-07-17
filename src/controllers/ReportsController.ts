import { Request, Response, NextFunction } from "express";
import { MigrationReportService } from "../services/MigrationReportService";

export class ReportsController {
  private reportService = new MigrationReportService();

  listReports = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const workspaceId = (req as any).workspaceId;

      const filters = {
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
      };

      const result = await this.reportService.listReports(userId, workspaceId, filters);
      res.json({
        success: true,
        reports: result.reports,
        total: result.total,
      });
    } catch (err) {
      next(err);
    }
  };

  getReportById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobId = req.params.jobId;
      const userId = (req as any).userId;
      const workspaceId = (req as any).workspaceId;

      const report = await this.reportService.getReportById(jobId, userId, workspaceId);
      res.json({
        success: true,
        report,
      });
    } catch (err) {
      next(err);
    }
  };

  deleteReport = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobId = req.params.jobId;
      const userId = (req as any).userId;
      const workspaceId = (req as any).workspaceId;

      await this.reportService.deleteReport(jobId, userId, workspaceId);
      res.json({
        success: true,
        message: "Migration report soft-deleted successfully.",
      });
    } catch (err) {
      next(err);
    }
  };

  downloadPdf = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobId = req.params.jobId;
      const userId = (req as any).userId;
      const workspaceId = (req as any).workspaceId;

      const pdfBuffer = await this.reportService.generatePdfReport(jobId, userId, workspaceId);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=report-${jobId}.pdf`);
      res.send(pdfBuffer);
    } catch (err) {
      next(err);
    }
  };

  downloadJson = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobId = req.params.jobId;
      const userId = (req as any).userId;
      const workspaceId = (req as any).workspaceId;

      const report = await this.reportService.getReportById(jobId, userId, workspaceId);

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename=report-${jobId}.json`);
      res.send(JSON.stringify(report.reportJson, null, 2));
    } catch (err) {
      next(err);
    }
  };
}
