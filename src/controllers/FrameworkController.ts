import { Request, Response, NextFunction } from "express";
import { FrameworkService } from "../services/FrameworkService";

export class FrameworkController {
  private frameworkService = new FrameworkService();

  /**
   * GET /api/frameworks
   * Returns a list of all supported compiler frameworks with aggregated active engines, codemods, etc.
   */
  getFrameworks = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const bypassCache = req.query.refresh === "true";
      const frameworks = await this.frameworkService.getFrameworks(bypassCache);
      res.json({
        success: true,
        data: frameworks
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/frameworks/:id
   * Returns comprehensive metadata for a specific framework, including versions, engines, codemods, supported migrations, and compiler settings.
   */
  getFrameworkById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const detail = await this.frameworkService.getFrameworkDetail(id);
      if (!detail) {
        res.status(404).json({
          success: false,
          message: `Framework with ID ${id} not found`
        });
        return;
      }
      res.json({
        success: true,
        data: detail
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/migration-matrix
   * Returns the complete matrix of supported source -> target migrations.
   */
  getMigrationMatrix = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const bypassCache = req.query.refresh === "true";
      const matrix = await this.frameworkService.getMigrationMatrix(bypassCache);
      res.json({
        success: true,
        data: matrix
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/compiler/health
   * Returns aggregated compiler health data across all engines.
   */
  getCompilerHealth = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const health = await this.frameworkService.getCompilerHealth();
      res.json({
        success: true,
        data: health
      });
    } catch (err) {
      next(err);
    }
  };
}
