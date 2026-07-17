import { Request, Response, NextFunction } from "express";
import { MigrationHistoryService } from "../services/MigrationHistoryService";

export class HistoryController {
  private historyService = new MigrationHistoryService();

  listHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const workspaceId = (req as any).workspaceId;

      const filters = {
        search: req.query.search as string,
        status: req.query.status as string,
        sourceFramework: req.query.sourceFramework as string,
        targetFramework: req.query.targetFramework as string,
        dateFrom: req.query.dateFrom as string,
        dateTo: req.query.dateTo as string,
        sortBy: req.query.sortBy as string,
        sortOrder: req.query.sortOrder as "ASC" | "DESC",
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
      };

      const result = await this.historyService.getHistory(userId, workspaceId, filters);
      res.json({
        success: true,
        jobs: result.jobs,
        total: result.total,
      });
    } catch (err) {
      next(err);
    }
  };

  getHistoryById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobId = req.params.jobId;
      const userId = (req as any).userId;
      const workspaceId = (req as any).workspaceId;

      const job = await this.historyService.getHistoryById(jobId, userId, workspaceId);
      res.json({
        success: true,
        job,
      });
    } catch (err) {
      next(err);
    }
  };

  deleteHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobId = req.params.jobId;
      const userId = (req as any).userId;
      const workspaceId = (req as any).workspaceId;

      await this.historyService.deleteHistory(jobId, userId, workspaceId);
      res.json({
        success: true,
        message: "Migration history record soft-deleted successfully.",
      });
    } catch (err) {
      next(err);
    }
  };

  retryHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobId = req.params.jobId;
      const userId = (req as any).userId;
      const workspaceId = (req as any).workspaceId;

      const newJob = await this.historyService.retryMigration(jobId, userId, workspaceId);
      res.status(202).json({
        success: true,
        jobId: newJob.id,
        status: newJob.status,
        message: "Migration job retried successfully.",
      });
    } catch (err) {
      next(err);
    }
  };
}
