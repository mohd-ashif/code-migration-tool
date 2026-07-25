import { Response, NextFunction } from "express";
import { verifyJwt } from "../utils/jwt";
import { config } from "../config";
import { AuthenticatedRequest } from "../types/auth.types";
import { logger } from "../utils/logger";

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;

  cookieHeader.split(";").forEach((cookie) => {
    const parts = cookie.split("=");
    const name = parts.shift()?.trim();
    const val = parts.join("=")?.trim();
    if (name) {
      list[name] = decodeURIComponent(val || "");
    }
  });

  return list;
}

export function jwtAuthMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  let token: string | undefined;

  // 1. Check Authorization Header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  }

  // 2. Check Cookie (fallback if cookie-parser is not active)
  if (!token) {
    const cookies = req.cookies || parseCookies(req.headers.cookie);
    token = cookies.access_token;
  }

  // 3. Check Query Parameter (fallback for browser download links)
  if (!token && req.query && req.query.token) {
    token = req.query.token as string;
  }

  if (!token) {
    return res.status(401).json({ success: false, message: "Access token is missing." });
  }

  try {
    const decoded = verifyJwt(token, config.JWT_SECRET);
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
    };
    next();
  } catch (err: any) {
    logger.warn(`JWT verification failed: ${err.message}`);
    return res.status(401).json({ success: false, message: "Invalid or expired access token." });
  }
}
