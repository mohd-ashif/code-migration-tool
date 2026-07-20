import { Router } from "express";
import {
  handleGetWorkspace,
  handleListUserWorkspaces,
  handleCreateWorkspace,
  handleUpdateWorkspaceSettings,
  handleDeleteWorkspace,
  handleTransferOwnership,
  handleListMembers,
  handleUpdateMemberRole,
  handleRemoveMember,
  handleInviteMember,
  handleListPendingInvitations,
  handleCancelInvitation,
  handleAcceptInvite,
  handleListUserInvitations,
  handleRejectInvite,
  handleGetActivityLogs,
  handleGetStorageUsage,
  handleGetUsageMetrics
} from "../controllers/workspace.controller";
import { requireWorkspaceRole } from "../middleware/workspace-role.middleware";

const router = Router();

// Workspaces list & creation
router.get("/", handleListUserWorkspaces);
router.post("/", handleCreateWorkspace);

// Active workspace info & usage
router.get("/me", handleGetWorkspace);
router.get("/usage", handleGetUsageMetrics);

// Invitations management for the authenticated user
router.get("/invites", handleListUserInvitations);
router.post("/invites/accept", handleAcceptInvite);
router.post("/invites/reject", handleRejectInvite);

// Specific workspace management (ID-based)
router.get("/:id", requireWorkspaceRole(["viewer"]), handleGetWorkspace);
router.put("/:id", requireWorkspaceRole(["admin"]), handleUpdateWorkspaceSettings);
router.delete("/:id", requireWorkspaceRole(["owner"]), handleDeleteWorkspace);
router.post("/:id/transfer", requireWorkspaceRole(["owner"]), handleTransferOwnership);

// Workspace members
router.get("/:id/members", requireWorkspaceRole(["viewer"]), handleListMembers);
router.put("/:id/members/:userId", requireWorkspaceRole(["admin"]), handleUpdateMemberRole);
router.delete("/:id/members/:userId", handleRemoveMember); // authorized inline for self-leaving or admin role

// Workspace invites
router.post("/:id/invites", requireWorkspaceRole(["admin"]), handleInviteMember);
router.get("/:id/invites", requireWorkspaceRole(["admin"]), handleListPendingInvitations);
router.delete("/:id/invites/:inviteId", requireWorkspaceRole(["admin"]), handleCancelInvitation);
// Metrics & activity
router.get("/:id/activity", requireWorkspaceRole(["viewer"]), handleGetActivityLogs);
router.get("/:id/storage", requireWorkspaceRole(["viewer"]), handleGetStorageUsage);
router.get("/:id/usage", requireWorkspaceRole(["viewer"]), handleGetUsageMetrics);

export default router;
