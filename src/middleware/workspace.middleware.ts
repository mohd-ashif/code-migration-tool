import { Response, NextFunction } from "express";
import { verifyJwt } from "../utils/jwt";
import { config } from "../config";
import { AuthService } from "../services/auth.service";
import { logger } from "../utils/logger";
import { queryDatabase } from "../lib/database";

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

  // 1. Resolve userId if not already set (e.g. from JWT cookie or auth header)
  if (!req.userId || req.userId === SYSTEM_USER_ID) {
    let token: string | undefined;

    // Extract Authorization Header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }

    // Extract access token from cookies if available
    if (!token) {
      const cookies = req.cookies || parseCookies(req.headers.cookie);
      token = cookies.access_token;
    }

    if (token) {
      try {
        const decoded = verifyJwt(token, config.JWT_SECRET);
        if (decoded && decoded.userId && decoded.email) {
          req.userId = decoded.userId;
          req.user = { userId: decoded.userId, email: decoded.email };
        }
      } catch (err: any) {
        logger.warn(`Workspace Middleware: JWT verification failed: ${err.message}`);
      }
    }
  }

  // 2. Resolve Workspace context based on resolved userId
  if (req.userId && req.userId !== SYSTEM_USER_ID) {
    const headerWorkspaceId = req.headers["x-workspace-id"];
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Check if client requested a specific workspace via header
    if (headerWorkspaceId && typeof headerWorkspaceId === "string" && isUUID.test(headerWorkspaceId)) {
      const rows = await queryDatabase(
        `SELECT workspace_id, role 
         FROM workspace_members 
         WHERE workspace_id = $1::uuid AND user_id = $2::uuid AND deleted_at IS NULL 
         LIMIT 1`,
        [headerWorkspaceId, req.userId]
      );
      if (rows && rows.length > 0) {
        req.workspaceId = headerWorkspaceId;
        req.workspaceRole = rows[0].role;
        return next();
      }
    }

    // Check if workspace context is already set (e.g. from API Key) and user is a member
    if (req.workspaceId && isUUID.test(req.workspaceId)) {
      const rows = await queryDatabase(
        `SELECT role 
         FROM workspace_members 
         WHERE workspace_id = $1::uuid AND user_id = $2::uuid AND deleted_at IS NULL 
         LIMIT 1`,
        [req.workspaceId, req.userId]
      );
      if (rows && rows.length > 0) {
        req.workspaceRole = rows[0].role;
        return next();
      }
    }

    // Fallback: Query first active workspace membership for this user
    const workspaces = await queryDatabase(
      `SELECT w.id, wm.role
       FROM workspaces w
       INNER JOIN workspace_members wm ON wm.workspace_id = w.id
       WHERE wm.user_id = $1::uuid AND w.deleted_at IS NULL AND wm.deleted_at IS NULL
       ORDER BY w.created_at ASC
       LIMIT 1`,
      [req.userId]
    );

    if (workspaces && workspaces.length > 0) {
      req.workspaceId = workspaces[0].id;
      req.workspaceRole = workspaces[0].role;
      return next();
    } else {
      // Self-healing: Ensure user has a workspace
      const emailRows = await queryDatabase("SELECT email FROM users WHERE id = $1::uuid", [req.userId]);
      const email = emailRows[0]?.email || "user@migrationtool.local";
      req.workspaceId = await authService.ensureUserWorkspace(req.userId, email);
      req.workspaceRole = "owner";
      return next();
    }
  }

  // Fallback context: System/CLI requests (e.g. requests with static global API key but no user context)
  req.userId = SYSTEM_USER_ID;
  req.workspaceId = SYSTEM_WORKSPACE_ID;
  req.workspaceRole = "owner";
  next();
}
