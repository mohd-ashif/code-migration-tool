import { queryDatabase } from "../lib/database";
import { WorkspaceInvitation } from "../models/workspace.model";

export class WorkspaceInvitationRepository {
  async create(invite: {
    workspaceId: string;
    email: string;
    role: string;
    token: string;
    invitedBy: string;
    expiresAt: Date;
  }): Promise<WorkspaceInvitation> {
    const rows = await queryDatabase(
      `INSERT INTO workspace_invitations (workspace_id, email, role, token, invited_by, expires_at)
       VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6)
       RETURNING id, workspace_id AS "workspaceId", email, role, token, invited_by AS "invitedBy", 
                 expires_at AS "expiresAt", created_at AS "createdAt", accepted_at AS "acceptedAt", deleted_at AS "deletedAt"`,
      [
        invite.workspaceId,
        invite.email.toLowerCase().trim(),
        invite.role,
        invite.token,
        invite.invitedBy,
        invite.expiresAt,
      ]
    );
    return rows[0];
  }

  async findByToken(token: string): Promise<WorkspaceInvitation | null> {
    const rows = await queryDatabase(
      `SELECT id, workspace_id AS "workspaceId", email, role, token, invited_by AS "invitedBy", 
              expires_at AS "expiresAt", created_at AS "createdAt", accepted_at AS "acceptedAt", deleted_at AS "deletedAt"
       FROM workspace_invitations
       WHERE token = $1 AND accepted_at IS NULL AND deleted_at IS NULL`,
      [token]
    );
    return rows[0] || null;
  }

  async findActiveByWorkspace(workspaceId: string): Promise<WorkspaceInvitation[]> {
    const rows = await queryDatabase(
      `SELECT id, workspace_id AS "workspaceId", email, role, token, invited_by AS "invitedBy", 
              expires_at AS "expiresAt", created_at AS "createdAt", accepted_at AS "acceptedAt", deleted_at AS "deletedAt"
       FROM workspace_invitations
       WHERE workspace_id = $1::uuid AND accepted_at IS NULL AND deleted_at IS NULL AND expires_at > NOW()`,
      [workspaceId]
    );
    return rows;
  }

  async accept(id: string): Promise<void> {
    await queryDatabase(
      `UPDATE workspace_invitations
       SET accepted_at = NOW()
       WHERE id = $1::uuid AND accepted_at IS NULL AND deleted_at IS NULL`,
      [id]
    );
  }

  async delete(id: string): Promise<void> {
    await queryDatabase(
      `UPDATE workspace_invitations
       SET deleted_at = NOW()
       WHERE id = $1::uuid AND deleted_at IS NULL`,
      [id]
    );
  }
}
