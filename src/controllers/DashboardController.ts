import { Request, Response, NextFunction } from "express";
import { DashboardService } from "../services/DashboardService";

export class DashboardController {
  private dashboardService = new DashboardService();

  getDashboardData = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const workspaceId = (req as any).workspaceId;

      const data = await this.dashboardService.getDashboardData(userId, workspaceId);
      res.json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  };
}
