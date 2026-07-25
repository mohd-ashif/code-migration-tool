import { Router, Request, Response, NextFunction } from "express";
import { webhookProcessorService } from "../services/webhook-processor.service";
import { logger } from "../utils/logger";
import { HttpError } from "../middleware/error.middleware";

const router = Router();

router.post("/razorpay", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const signature = req.headers["x-razorpay-signature"] as string;
    const rawBody = (req as any).rawBody;

    if (!signature || !rawBody) {
      throw new HttpError(400, "Missing signature or body in webhook request.");
    }

    const rawBodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody;
    const result = await webhookProcessorService.processRazorpayWebhook({
      rawBody: rawBodyStr,
      signature,
      body: req.body
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
