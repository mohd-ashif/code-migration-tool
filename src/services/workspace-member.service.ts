import { MemberRepository } from "../repositories/member.repository";
import { WorkspaceRepository } from "../repositories/workspace.repository";
import { ActivityRepository } from "../repositories/activity.repository";
import { WorkspaceMember } from "../models/workspace.model";
import { HttpError } from "../middleware/error.middleware";

const roleHierarchy: Record<string, number> = {
  owner: 4,
  admin: 3,
  developer: 2,
  viewer: 1,
};

export class WorkspaceMemberService {
  private memberRepo = new MemberRepository();
  private workspaceRepo = new WorkspaceRepository();
  private activityRepo = new ActivityRepository();

  async listMembers(workspaceId: string) {
    return this.memberRepo.listMembers(workspaceId);
  }

  async updateMemberRole(
    workspaceId: string,
    actorUserId: string,
    targetUserId: string,
    newRole: string
  ): Promise<WorkspaceMember> {
    if (!roleHierarchy[newRole]) {
      throw new HttpError(400, "Invalid membership role specified.");
    }

    if (newRole === "owner") {
      throw new HttpError(400, "Role promotion to Owner must go through ownership transfer.");
    }

    const ws = await this.workspaceRepo.findById(workspaceId);
    if (!ws) {
      throw new HttpError(404, "Workspace not found.");
    }

    const actor = await this.memberRepo.findMember(workspaceId, actorUserId);
    if (!actor) {
      throw new HttpError(403, "You are not a member of this workspace.");
    }

    const target = await this.memberRepo.findMember(workspaceId, targetUserId);
    if (!target) {
      throw new HttpError(404, "Target user is not a member of this workspace.");
    }

    if (target.role === "owner") {
      throw new HttpError(400, "Cannot change the workspace owner's role.");
    }

    // Role hierarchies checks
    const actorRoleLevel = roleHierarchy[actor.role] || 0;
    const targetRoleLevel = roleHierarchy[target.role] || 0;

    if (actorRoleLevel < 3) {
      throw new HttpError(403, "Only workspace Owners or Admins can modify member roles.");
    }

    if (actorRoleLevel <= targetRoleLevel && actor.role !== "owner") {
      throw new HttpError(403, "You cannot modify roles of members with matching or higher permissions.");
    }

    const updated = await this.memberRepo.updateRole(workspaceId, targetUserId, newRole);
    await this.activityRepo.log(workspaceId, actorUserId, "role_changed", {
      targetUserId,
      oldRole: target.role,
      newRole,
    });

    return updated;
  }

  async removeMember(
    workspaceId: string,
    actorUserId: string,
    targetUserId: string
  ): Promise<void> {
    const ws = await this.workspaceRepo.findById(workspaceId);
    if (!ws) {
      throw new HttpError(404, "Workspace not found.");
    }

    const actor = await this.memberRepo.findMember(workspaceId, actorUserId);
    if (!actor) {
      throw new HttpError(403, "You are not a member of this workspace.");
    }

    const target = await this.memberRepo.findMember(workspaceId, targetUserId);
    if (!target) {
      throw new HttpError(404, "Target user is not a member of this workspace.");
    }

    if (target.role === "owner") {
      throw new HttpError(400, "Cannot remove the workspace owner. Transfer ownership first.");
    }

    const isSelfRemove = actorUserId === targetUserId;

    if (!isSelfRemove) {
      const actorRoleLevel = roleHierarchy[actor.role] || 0;
      const targetRoleLevel = roleHierarchy[target.role] || 0;

      if (actorRoleLevel < 3) {
        throw new HttpError(403, "Only workspace Owners or Admins can remove members.");
      }

      if (actorRoleLevel <= targetRoleLevel && actor.role !== "owner") {
        throw new HttpError(403, "You cannot remove members with matching or higher permissions.");
      }
    }

    await this.memberRepo.removeMember(workspaceId, targetUserId);
    await this.activityRepo.log(workspaceId, actorUserId, isSelfRemove ? "member_left" : "member_removed", {
      targetUserId,
    });
  }

  async leaveWorkspace(workspaceId: string, userId: string): Promise<void> {
    await this.removeMember(workspaceId, userId, userId);
  }
}
export const workspaceMemberService = new WorkspaceMemberService();
