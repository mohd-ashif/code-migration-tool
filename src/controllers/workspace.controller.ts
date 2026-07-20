import { Request, Response, NextFunction } from "express";
import { workspaceService } from "../services/workspace.service";
import { workspaceMemberService } from "../services/workspace-member.service";
import { workspaceInvitationService } from "../services/workspace-invitation.service";
import { workspaceActivityService } from "../services/workspace-activity.service";
import { workspaceUsageService } from "../services/workspace-usage.service";
import { HttpError } from "../middleware/error.middleware";
import { logger } from "../utils/logger";

function getAuthenticatedUser(req: Request) {
  const userId = (req as any).userId;
  const user = (req as any).user; // Set by authMiddleware if populated
  if (!userId || userId === "00000000-0000-0000-0000-000000000000") {
    throw new HttpError(401, "Authentication required.");
  }
  return { userId, email: user?.email };
}

// ── Workspaces ───────────────────────────────────────────────────────────────

export async function handleListUserWorkspaces(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = getAuthenticatedUser(req);
    const list = await workspaceService.listUserWorkspaces(userId);
    res.json({ success: true, workspaces: list });
  } catch (err) {
    next(err);
  }
}

export async function handleGetWorkspace(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = getAuthenticatedUser(req);
    const workspaceId = req.params.id || (req as any).workspaceId;
    if (!workspaceId) {
      throw new HttpError(400, "Workspace ID context required.");
    }
    const ws = await workspaceService.getWorkspaceDetailsForUser(workspaceId, userId);
    res.json({ success: true, workspace: ws });
  } catch (err) {
    next(err);
  }
}

export async function handleCreateWorkspace(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = getAuthenticatedUser(req);
    const { name, description, logoUrl } = req.body;
    if (!name) {
      throw new HttpError(400, "Workspace name is required.");
    }
    const ws = await workspaceService.createWorkspace(name, userId, description, logoUrl);
    res.status(201).json({ success: true, workspace: ws });
  } catch (err) {
    next(err);
  }
}

export async function handleUpdateWorkspaceSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = getAuthenticatedUser(req);
    const workspaceId = req.params.id || (req as any).workspaceId;
    const { name, slug, description, logoUrl, timezone, country } = req.body;

    const updated = await workspaceService.updateWorkspaceSettings(workspaceId, userId, {
      name,
      slug,
      description,
      logoUrl,
      timezone,
      country
    });

    res.json({ success: true, workspace: updated });
  } catch (err) {
    next(err);
  }
}

export async function handleDeleteWorkspace(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = getAuthenticatedUser(req);
    const workspaceId = req.params.id;
    await workspaceService.deleteWorkspace(workspaceId, userId);
    res.json({ success: true, message: "Workspace deactivated successfully." });
  } catch (err) {
    next(err);
  }
}

export async function handleTransferOwnership(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = getAuthenticatedUser(req);
    const workspaceId = req.params.id || (req as any).workspaceId;
    const { newOwnerId } = req.body;
    if (!newOwnerId) {
      throw new HttpError(400, "New owner ID is required.");
    }
    await workspaceService.transferOwnership(workspaceId, userId, newOwnerId);
    res.json({ success: true, message: "Workspace ownership transferred successfully." });
  } catch (err) {
    next(err);
  }
}

export async function handleSwitchWorkspace(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = getAuthenticatedUser(req);
    const { workspaceId } = req.body;
    if (!workspaceId) {
      throw new HttpError(400, "Workspace ID is required.");
    }
    // Verify access
    const ws = await workspaceService.getWorkspaceDetailsForUser(workspaceId, userId);
    res.json({ success: true, message: "Workspace switched successfully.", workspace: ws });
  } catch (err) {
    next(err);
  }
}

// ── Members ──────────────────────────────────────────────────────────────────

export async function handleListMembers(req: Request, res: Response, next: NextFunction) {
  try {
    getAuthenticatedUser(req);
    const workspaceId = req.params.id || (req as any).workspaceId;
    const list = await workspaceMemberService.listMembers(workspaceId);
    res.json({ success: true, members: list });
  } catch (err) {
    next(err);
  }
}

export async function handleUpdateMemberRole(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = getAuthenticatedUser(req);
    const workspaceId = req.params.id || (req as any).workspaceId;
    const targetUserId = req.params.userId;
    const { role } = req.body;

    if (!role) {
      throw new HttpError(400, "Role parameter is required.");
    }

    const updated = await workspaceMemberService.updateMemberRole(workspaceId, userId, targetUserId, role);
    res.json({ success: true, member: updated });
  } catch (err) {
    next(err);
  }
}

export async function handleRemoveMember(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = getAuthenticatedUser(req);
    const workspaceId = req.params.id || (req as any).workspaceId;
    const targetUserId = req.params.userId;

    await workspaceMemberService.removeMember(workspaceId, userId, targetUserId);
    res.json({ success: true, message: "Member removed from workspace successfully." });
  } catch (err) {
    next(err);
  }
}

// ── Invitations ──────────────────────────────────────────────────────────────

export async function handleInviteMember(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = getAuthenticatedUser(req);
    const workspaceId = req.params.id || (req as any).workspaceId;
    const { email, role } = req.body;

    if (!email || !role) {
      throw new HttpError(400, "Email and role are required fields.");
    }

    const invite = await workspaceInvitationService.inviteMember(workspaceId, userId, email, role);
    res.status(201).json({ success: true, invitation: invite });
  } catch (err) {
    next(err);
  }
}

export async function handleListPendingInvitations(req: Request, res: Response, next: NextFunction) {
  try {
    getAuthenticatedUser(req);
    const workspaceId = req.params.id || (req as any).workspaceId;
    const list = await workspaceInvitationService.listInvitations(workspaceId);
    res.json({ success: true, invitations: list });
  } catch (err) {
    next(err);
  }
}

export async function handleCancelInvitation(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = getAuthenticatedUser(req);
    const workspaceId = req.params.id || (req as any).workspaceId;
    const inviteId = req.params.inviteId;

    await workspaceInvitationService.revokeInvitation(workspaceId, userId, inviteId);
    res.json({ success: true, message: "Invitation cancelled successfully." });
  } catch (err) {
    next(err);
  }
}

export async function handleListUserInvitations(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = getAuthenticatedUser(req);
    if (!email) {
      throw new HttpError(400, "User email not found in token context.");
    }
    const list = await workspaceInvitationService.listUserInvitations(email);
    res.json({ success: true, invitations: list });
  } catch (err) {
    next(err);
  }
}

export async function handleAcceptInvite(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, email } = getAuthenticatedUser(req);
    const { token } = req.body;
    if (!token) {
      throw new HttpError(400, "Invitation token is required.");
    }
    if (!email) {
      throw new HttpError(400, "User email not found in token context.");
    }
    await workspaceInvitationService.acceptInvitation(token, userId, email);
    res.json({ success: true, message: "Invitation accepted successfully." });
  } catch (err) {
    next(err);
  }
}

export async function handleRejectInvite(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = getAuthenticatedUser(req);
    const { token } = req.body;
    if (!token) {
      throw new HttpError(400, "Invitation token is required.");
    }
    if (!email) {
      throw new HttpError(400, "User email not found in token context.");
    }
    await workspaceInvitationService.rejectInvitation(token, email);
    res.json({ success: true, message: "Invitation rejected successfully." });
  } catch (err) {
    next(err);
  }
}

// ── Metrics & Audits ─────────────────────────────────────────────────────────

export async function handleGetActivityLogs(req: Request, res: Response, next: NextFunction) {
  try {
    getAuthenticatedUser(req);
    const workspaceId = req.params.id || (req as any).workspaceId;
    const limit = parseInt(req.query.limit as string || "20", 10);
    const offset = parseInt(req.query.offset as string || "0", 10);

    const data = await workspaceActivityService.listActivity(workspaceId, limit, offset);
    res.json({ success: true, logs: data.logs, total: data.total });
  } catch (err) {
    next(err);
  }
}

export async function handleGetStorageUsage(req: Request, res: Response, next: NextFunction) {
  try {
    getAuthenticatedUser(req);
    const workspaceId = req.params.id || (req as any).workspaceId;
    const data = await workspaceUsageService.getStorage(workspaceId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function handleGetUsageMetrics(req: Request, res: Response, next: NextFunction) {
  try {
    getAuthenticatedUser(req);
    const workspaceId = req.params.id || (req as any).workspaceId;
    const data = await workspaceUsageService.getUsage(workspaceId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
