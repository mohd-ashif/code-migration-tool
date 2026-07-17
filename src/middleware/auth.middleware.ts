import { Request, Response, NextFunction } from "express";
import { config } from "../config";
import { logger } from "../utils/logger";

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Bypass static API key check for auth routes and downloads
  if (
    req.path.startsWith("/api/auth") ||
    req.originalUrl.startsWith("/api/auth") ||
    req.path.startsWith("/api/download") ||
    req.originalUrl.startsWith("/api/download")
  ) {
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
