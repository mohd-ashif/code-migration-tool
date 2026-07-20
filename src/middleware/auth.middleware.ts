import { Request, Response, NextFunction } from "express";
import { config } from "../config";
import { logger } from "../utils/logger";
import { ApiKeyRepository } from "../repositories/api-key.repository";
import { UserRepository } from "../repositories/user.repository";
import { AuthService } from "../services/auth.service";
import { createHash } from "crypto";

const apiKeyRepo = new ApiKeyRepository();
const userRepo = new UserRepository();
const authService = new AuthService();

export async function authMiddleware(req: any, res: Response, next: NextFunction) {
  // Bypass static API key check for auth routes and downloads
  if (
    req.path.startsWith("/api/auth") ||
    req.originalUrl.startsWith("/api/auth") ||
    req.path.startsWith("/api/download") ||
    req.originalUrl.startsWith("/api/download")
  ) {
    return next();
  }

  const requestKey = req.header("x-api-key") || req.query.apiKey;

  // 1. Check for personal user API key (prefixed with mt_)
  if (requestKey && typeof requestKey === "string" && requestKey.startsWith("mt_")) {
    try {
      const keyHash = createHash("sha256").update(requestKey).digest("hex");
      const apiKeyRecord = await apiKeyRepo.findByKeyHash(keyHash);

      if (
        apiKeyRecord &&
        (!apiKeyRecord.expiresAt || apiKeyRecord.expiresAt > new Date())
      ) {
        const user = await userRepo.findById(apiKeyRecord.userId);
        if (user) {
          // Establish request user context
          req.userId = user.id;
          req.user = { userId: user.id, email: user.email };
          // Ensure personal workspace
          req.workspaceId = await authService.ensureUserWorkspace(user.id, user.email);

          // Update last used timestamp in background
          apiKeyRepo.updateLastUsed(apiKeyRecord.id).catch((err) => {
            logger.error(`Failed to update API key last_used_at: ${err.message}`);
          });

          return next();
        }
      }
      return res.status(401).json({ success: false, message: "Invalid or expired API Key" });
    } catch (err: any) {
      logger.error(`API Key authentication error: ${err.message}`);
      return res.status(500).json({ success: false, message: "Internal server authentication error" });
    }
  }

  // 2. Fallback to static global API key configuration
  const apiKey = config.API_KEY;
  if (!apiKey) {
    logger.warn("API_KEY is not configured. Authentication is disabled.");
    return next();
  }

  if (requestKey !== apiKey) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  next();
}
