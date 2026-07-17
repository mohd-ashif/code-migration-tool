import { Response, NextFunction } from "express";
import { verifyJwt } from "../utils/jwt";
import { config } from "../config";
import { AuthService } from "../services/auth.service";
import { logger } from "../utils/logger";

const authService = new AuthService();

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";
const SYSTEM_WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;
  cookieHeader.split(";").forEach((cookie) => {
    const parts = cookie.split("=");
    const key = parts[0].trim();
    const val = parts.slice(1).join("=");
    list[key] = val;
  });
  return list;
}

export async function workspaceMiddleware(req: any, res: Response, next: NextFunction) {
  // If the path is public auth (except profile fetch and logout), skip workspace logic
  if (req.path.startsWith("/api/auth") && !req.path.endsWith("/me") && !req.path.endsWith("/logout")) {
    return next();
  }

  let token: string | undefined;

  // 1. Extract Authorization Header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  }

  // 2. Extract access token from cookies if available
  if (!token) {
    const cookies = req.cookies || parseCookies(req.headers.cookie);
    token = cookies.access_token;
  }

  if (token) {
    try {
      const decoded = verifyJwt(token, config.JWT_SECRET);
      if (decoded && decoded.userId && decoded.email) {
        req.userId = decoded.userId;
        // Ensure user has a default personal workspace (self-healing)
        req.workspaceId = await authService.ensureUserWorkspace(decoded.userId, decoded.email);
        return next();
      }
    } catch (err: any) {
      logger.warn(`Workspace Middleware: JWT verification failed, falling back to System context: ${err.message}`);
    }
  }

  // Fallback context: System/CLI requests (e.g. requests with x-api-key but no user session)
  req.userId = SYSTEM_USER_ID;
  req.workspaceId = SYSTEM_WORKSPACE_ID;
  next();
}
