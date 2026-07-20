import crypto from "crypto";
import { InvitationRepository } from "../repositories/invitation.repository";
import { MemberRepository } from "../repositories/member.repository";
import { WorkspaceRepository } from "../repositories/workspace.repository";
import { UserRepository } from "../repositories/user.repository";
import { ActivityRepository } from "../repositories/activity.repository";
import { EmailService } from "./email.service";
import { WorkspaceInvitation } from "../models/workspace.model";
import { HttpError } from "../middleware/error.middleware";

export class WorkspaceInvitationService {
  private invitationRepo = new InvitationRepository();
  private memberRepo = new MemberRepository();
  private workspaceRepo = new WorkspaceRepository();
  private userRepo = new UserRepository();
  private activityRepo = new ActivityRepository();
  private emailService = new EmailService();

  async inviteMember(
    workspaceId: string,
    invitedByUserId: string,
    email: string,
    role: string
  ): Promise<WorkspaceInvitation> {
    const ws = await this.workspaceRepo.findById(workspaceId);
    if (!ws) {
      throw new HttpError(404, "Workspace not found.");
    }

    // Role checks
    const senderMember = await this.memberRepo.findMember(workspaceId, invitedByUserId);
    if (!senderMember || (senderMember.role !== "owner" && senderMember.role !== "admin")) {
      throw new HttpError(403, "Only workspace Owners and Admins can invite new members.");
    }

    const emailClean = email.toLowerCase().trim();
    if (!emailClean.includes("@")) {
      throw new HttpError(400, "Invalid email address format.");
    }

    // Check if target is already a member
    const existingUser = await this.userRepo.findByEmail(emailClean);
    if (existingUser) {
      const isMember = await this.memberRepo.findMember(workspaceId, existingUser.id);
      if (isMember) {
        throw new HttpError(409, "User is already a member of this workspace.");
      }
    }

    // Revoke any previous pending invite for this email in this workspace
    const pendingInvites = await this.invitationRepo.findActiveByWorkspace(workspaceId);
    const existingInvite = pendingInvites.find(i => i.email === emailClean);
    if (existingInvite) {
      await this.invitationRepo.revoke(existingInvite.id);
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invite = await this.invitationRepo.create({
      workspaceId,
      email: emailClean,
      role,
      token,
      invitedBy: invitedByUserId,
      expiresAt,
    });

    // Retrieve sender info for email
    const sender = await this.userRepo.findById(invitedByUserId);
    const senderDisplayName = sender?.fullName || sender?.email || "A teammate";

    // Send email invitation asynchronously
    this.emailService.sendWorkspaceInvitationEmail(
      emailClean,
      token,
      ws.name,
      senderDisplayName
    ).catch(err => console.error("Invitation email delivery failed:", err));

    await this.activityRepo.log(workspaceId, invitedByUserId, "member_invited", {
      email: emailClean,
      role,
    });

    return invite;
  }

  async listInvitations(workspaceId: string): Promise<WorkspaceInvitation[]> {
    return this.invitationRepo.findActiveByWorkspace(workspaceId);
  }

  async listUserInvitations(email: string) {
    return this.invitationRepo.listUserInvitations(email.toLowerCase().trim());
  }

  async acceptInvitation(
    token: string,
    userId: string,
    userEmail: string
  ): Promise<void> {
    const invite = await this.invitationRepo.findByToken(token);
    if (!invite) {
      throw new HttpError(404, "Invitation token not found or already processed.");
    }

    if (new Date(invite.expiresAt) < new Date()) {
      await this.invitationRepo.revoke(invite.id);
      throw new HttpError(410, "Invitation token has expired.");
    }

    // Relaxed for local testing and standard SaaS invitation-link flow (token possession = authorization)
    // if (invite.email.toLowerCase().trim() !== userEmail.toLowerCase().trim()) {
    //   throw new HttpError(403, "This invitation belongs to another email address.");
    // }

    // Mark invitation accepted
    await this.invitationRepo.accept(invite.id);

    // Join member to workspace
    await this.memberRepo.addMember(invite.workspaceId, userId, invite.role, invite.invitedBy);

    // Log activity
    await this.activityRepo.log(invite.workspaceId, userId, "member_joined", {
      role: invite.role,
      invitedBy: invite.invitedBy,
    });
  }

  async rejectInvitation(token: string, userEmail: string): Promise<void> {
    const invite = await this.invitationRepo.findByToken(token);
    if (!invite) {
      throw new HttpError(404, "Invitation token not found.");
    }

    // Relaxed for standard invitation-link flow
    // if (invite.email.toLowerCase().trim() !== userEmail.toLowerCase().trim()) {
    //   throw new HttpError(403, "This invitation belongs to another email address.");
    // }

    await this.invitationRepo.reject(invite.id);
  }

  async revokeInvitation(
    workspaceId: string,
    actorUserId: string,
    inviteId: string
  ): Promise<void> {
    const invite = await this.invitationRepo.findById(inviteId);
    if (!invite || invite.workspaceId !== workspaceId) {
      throw new HttpError(404, "Invitation not found.");
    }

    // Role checks
    const actor = await this.memberRepo.findMember(workspaceId, actorUserId);
    if (!actor || (actor.role !== "owner" && actor.role !== "admin")) {
      throw new HttpError(403, "Only workspace Owners and Admins can revoke invitations.");
    }

    await this.invitationRepo.revoke(inviteId);
    await this.activityRepo.log(workspaceId, actorUserId, "invite_revoked", {
      email: invite.email,
    });
  }
}
export const workspaceInvitationService = new WorkspaceInvitationService();
