import { Response, NextFunction } from "express";

export function requireWorkspaceRole(allowedRoles: ('owner' | 'admin' | 'developer' | 'viewer')[]) {
  return (req: any, res: Response, next: NextFunction) => {
    // If request user is System/CLI override context, allow
    if (req.userId === "00000000-0000-0000-0000-000000000000") {
      return next();
    }

    const userRole = req.workspaceRole;
    if (!userRole) {
      return res.status(403).json({ success: false, message: "Access Denied: No active workspace context found." });
    }

    // Define hierarchy values
    const roleLevels: Record<string, number> = {
      'viewer': 1,
      'developer': 2,
      'admin': 3,
      'owner': 4
    };

    const userLevel = roleLevels[userRole] || 0;
    const minRequiredLevel = Math.min(...allowedRoles.map(r => roleLevels[r] || 99));

    if (userLevel >= minRequiredLevel || allowedRoles.includes(userRole as any)) {
      return next();
    }

    return res.status(403).json({ 
      success: false, 
      message: `Access Denied: Minimum required permission level not met. Your workspace role: ${userRole}` 
    });
  };
}

export function RequireWorkspace() {
  return (req: any, res: Response, next: NextFunction) => {
    if (!req.workspaceId) {
      return res.status(400).json({ success: false, message: "Workspace context header 'x-workspace-id' is required." });
    }
    next();
  };
}

export function RequireWorkspaceMember() {
  return (req: any, res: Response, next: NextFunction) => {
    if (!req.workspaceId || !req.workspaceRole) {
      return res.status(403).json({ success: false, message: "Forbidden: You must be a member of this workspace to perform this action." });
    }
    next();
  };
}

export function RequireRole(allowedRoles: ('owner' | 'admin' | 'developer' | 'viewer')[]) {
  return requireWorkspaceRole(allowedRoles);
}

export function RequireOwner() {
  return (req: any, res: Response, next: NextFunction) => {
    if (req.workspaceRole !== "owner") {
      return res.status(403).json({ success: false, message: "Forbidden: Owner role required." });
    }
    next();
  };
}
