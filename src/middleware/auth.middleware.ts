import { Request, Response, NextFunction } from "express";
import { config } from "../config";
import { logger } from "../utils/logger";

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.path.startsWith("/api/auth") || req.originalUrl.startsWith("/api/auth")) {
    return next();
  }

  const apiKey = config.API_KEY;
  if (!apiKey) {
    logger.warn("API_KEY is not configured. Authentication is disabled.");
    return next();
  }

  const requestKey = req.header("x-api-key") || req.query.apiKey;
  if (requestKey !== apiKey) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  next();
}
