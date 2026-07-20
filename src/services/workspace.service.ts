import { WorkspaceRepository } from "../repositories/workspace.repository";
import { MemberRepository } from "../repositories/member.repository";
import { ActivityRepository } from "../repositories/activity.repository";
import { Workspace } from "../models/workspace.model";
import { HttpError } from "../middleware/error.middleware";

export class WorkspaceService {
  private workspaceRepo = new WorkspaceRepository();
  private memberRepo = new MemberRepository();
  private activityRepo = new ActivityRepository();

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  async createWorkspace(
    name: string, 
    ownerId: string,
    description?: string | null,
    logoUrl?: string | null
  ): Promise<Workspace> {
    if (name.length < 3 || name.length > 100) {
      throw new HttpError(400, "Workspace name must be between 3 and 100 characters.");
    }

    let slug = this.generateSlug(name) || "workspace";
    
    // Check slug uniqueness; if taken, append random hex
    const existing = await this.workspaceRepo.findBySlug(slug);
    if (existing) {
      const suffix = Math.random().toString(36).substring(2, 6);
      slug = `${slug}-${suffix}`;
    }

    const ws = await this.workspaceRepo.create({
      name,
      slug,
      ownerId,
      description,
      logoUrl,
      planId: "free",
      storageLimit: 104857600, // 100MB
    });

    // Add owner as a member
    await this.memberRepo.addMember(ws.id, ownerId, "owner");

    // Log activity
    await this.activityRepo.log(ws.id, ownerId, "workspace_created", { name, slug });

    return ws;
  }

  async getWorkspaceDetails(workspaceId: string): Promise<Workspace> {
    const ws = await this.workspaceRepo.findById(workspaceId);
    if (!ws) {
      throw new HttpError(404, "Workspace not found.");
    }
    return ws;
  }

  async getWorkspaceDetailsForUser(workspaceId: string, userId: string): Promise<Workspace & { role: string }> {
    const ws = await this.getWorkspaceDetails(workspaceId);
    const member = await this.memberRepo.findMember(workspaceId, userId);
    return {
      ...ws,
      role: member?.role || "viewer"
    };
  }

  async listUserWorkspaces(userId: string): Promise<(Workspace & { role: string })[]> {
    return this.workspaceRepo.listUserWorkspaces(userId);
  }

  async updateWorkspaceSettings(
    workspaceId: string, 
    userId: string, 
    updates: Partial<Workspace>
  ): Promise<Workspace> {
    // Validate inputs if name changes
    if (updates.name !== undefined) {
      if (updates.name.length < 3 || updates.name.length > 100) {
        throw new HttpError(400, "Workspace name must be between 3 and 100 characters.");
      }
    }

    // Validate slug uniqueness if changed
    if (updates.slug !== undefined) {
      const formattedSlug = this.generateSlug(updates.slug);
      if (!formattedSlug) {
        throw new HttpError(400, "Invalid workspace slug.");
      }
      const existing = await this.workspaceRepo.findBySlug(formattedSlug);
      if (existing && existing.id !== workspaceId) {
        throw new HttpError(409, "Workspace slug is already in use.");
      }
      updates.slug = formattedSlug;
    }

    const updated = await this.workspaceRepo.update(workspaceId, updates);
    await this.activityRepo.log(workspaceId, userId, "settings_changed", updates);
    return updated;
  }

  async deleteWorkspace(workspaceId: string, ownerId: string): Promise<void> {
    const ws = await this.getWorkspaceDetails(workspaceId);
    if (ws.ownerId !== ownerId) {
      throw new HttpError(403, "Only the workspace owner can delete the workspace.");
    }

    await this.workspaceRepo.delete(workspaceId);
    await this.activityRepo.log(workspaceId, ownerId, "workspace_deleted", { name: ws.name });
  }

  async transferOwnership(
    workspaceId: string, 
    currentOwnerId: string, 
    newOwnerId: string
  ): Promise<void> {
    const ws = await this.getWorkspaceDetails(workspaceId);
    if (ws.ownerId !== currentOwnerId) {
      throw new HttpError(403, "Only the workspace owner can transfer ownership.");
    }

    // Check if new owner is member
    const newOwnerMember = await this.memberRepo.findMember(workspaceId, newOwnerId);
    if (!newOwnerMember) {
      throw new HttpError(404, "Target user is not a member of the workspace.");
    }

    // Update workspace owner_id
    await this.workspaceRepo.update(workspaceId, { ownerId: newOwnerId });

    // Promote new owner and demote current owner to admin
    await this.memberRepo.updateRole(workspaceId, newOwnerId, "owner");
    await this.memberRepo.updateRole(workspaceId, currentOwnerId, "admin");

    await this.activityRepo.log(workspaceId, currentOwnerId, "role_changed", {
      action: "ownership_transfer",
      newOwnerId,
      oldOwnerId: currentOwnerId,
    });
  }
}
export const workspaceService = new WorkspaceService();
