import { Request, Response, NextFunction } from "express";
import { EngineService } from "../services/EngineService";
import { patchEngineSchema, patchCodemodSchema, patchCompilerSettingsSchema } from "../validators/framework.schema";

export class EngineController {
  private engineService = new EngineService();

  /**
   * GET /api/engines
   * Returns a list of all migration compiler engines.
   */
  getEngines = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const engines = await this.engineService.getEngines();
      res.json({
        success: true,
        data: engines,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * PATCH /api/engines/:id
   * Updates an engine status, optimizations, and compiler versions. (Admin/Owner only)
   */
  updateEngine = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { error, value } = patchEngineSchema.validate(req.body);
      if (error) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
        return;
      }

      const userId = (req as any).userId;
      const updated = await this.engineService.updateEngine(id, value, userId);

      res.json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * PATCH /api/codemods/:id
   * Toggles codemod state or changes its execution priority. (Admin/Owner only)
   */
  updateCodemod = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { error, value } = patchCodemodSchema.validate(req.body);
      if (error) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
        return;
      }

      const userId = (req as any).userId;
      const updated = await this.engineService.updateCodemod(id, value, userId);

      res.json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * PATCH /api/compiler-settings/:id
   * Tunes compiler processing options for a framework. (Admin/Owner only)
   */
  updateCompilerSettings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params; // frameworkId is passed as :id parameter in this endpoint
      const { error, value } = patchCompilerSettingsSchema.validate(req.body);
      if (error) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
        return;
      }

      const userId = (req as any).userId;
      const updated = await this.engineService.updateCompilerSettings(id, value, userId);

      res.json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  };
}
