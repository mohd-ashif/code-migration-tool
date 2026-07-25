import { Request, Response, NextFunction } from "express";
import { subscriptionRenewalService } from "../services/subscription-renewal.service";
import { HttpError } from "../middleware/error.middleware";

export class SubscriptionController {
  async renew(req: Request, res: Response, next: NextFunction) {
    try {
      const workspaceId = (req as any).workspaceId;
      if (!workspaceId) {
        throw new HttpError(400, "Workspace ID is required.");
      }

      const result = await subscriptionRenewalService.renewSubscription({ workspaceId });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      const workspaceId = (req as any).workspaceId;
      if (!workspaceId) {
        throw new HttpError(400, "Workspace ID is required.");
      }

      const result = await subscriptionRenewalService.cancelSubscription(workspaceId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async resume(req: Request, res: Response, next: NextFunction) {
    try {
      const workspaceId = (req as any).workspaceId;
      if (!workspaceId) {
        throw new HttpError(400, "Workspace ID is required.");
      }

      const result = await subscriptionRenewalService.resumeSubscription(workspaceId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}

export const subscriptionController = new SubscriptionController();
