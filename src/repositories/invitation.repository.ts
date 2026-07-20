import { queryDatabase } from "../lib/database";
import { WorkspaceInvitation } from "../models/workspace.model";

export class InvitationRepository {
  async create(invite: {
    workspaceId: string;
    email: string;
    role: string;
    token: string;
    invitedBy: string;
    expiresAt: Date;
  }): Promise<WorkspaceInvitation> {
    const rows = await queryDatabase(
      `INSERT INTO workspace_invitations (workspace_id, email, role, token, status, expires_at, invited_by)
       VALUES ($1::uuid, $2, $3, $4, 'pending', $5, $6::uuid)
       RETURNING id, workspace_id AS "workspaceId", email, role, token, status, 
                 expires_at AS "expiresAt", accepted_at AS "acceptedAt", invited_by AS "invitedBy", created_at AS "createdAt"`,
      [
        invite.workspaceId,
        invite.email.toLowerCase().trim(),
        invite.role,
        invite.token,
        invite.expiresAt,
        invite.invitedBy,
      ]
    );
    return rows[0];
  }

  async findById(id: string): Promise<WorkspaceInvitation | null> {
    const rows = await queryDatabase(
      `SELECT id, workspace_id AS "workspaceId", email, role, token, status, 
              expires_at AS "expiresAt", accepted_at AS "acceptedAt", invited_by AS "invitedBy", created_at AS "createdAt"
       FROM workspace_invitations
       WHERE id = $1::uuid AND deleted_at IS NULL`,
      [id]
    );
    return rows[0] || null;
  }

  async findByToken(token: string): Promise<WorkspaceInvitation | null> {
    const rows = await queryDatabase(
      `SELECT id, workspace_id AS "workspaceId", email, role, token, status, 
              expires_at AS "expiresAt", accepted_at AS "acceptedAt", invited_by AS "invitedBy", created_at AS "createdAt"
       FROM workspace_invitations
       WHERE token = $1 AND status = 'pending' AND deleted_at IS NULL`,
      [token]
    );
    return rows[0] || null;
  }

  async findActiveByWorkspace(workspaceId: string): Promise<WorkspaceInvitation[]> {
    const rows = await queryDatabase(
      `SELECT id, workspace_id AS "workspaceId", email, role, token, status, 
              expires_at AS "expiresAt", accepted_at AS "acceptedAt", invited_by AS "invitedBy", created_at AS "createdAt"
       FROM workspace_invitations
       WHERE workspace_id = $1::uuid AND status = 'pending' AND deleted_at IS NULL AND expires_at > NOW()`,
      [workspaceId]
    );
    return rows;
  }

  async listUserInvitations(email: string): Promise<(WorkspaceInvitation & { workspaceName: string })[]> {
    const rows = await queryDatabase(
      `SELECT i.id, i.workspace_id AS "workspaceId", i.email, i.role, i.token, i.status, 
              i.expires_at AS "expiresAt", i.accepted_at AS "acceptedAt", i.invited_by AS "invitedBy", i.created_at AS "createdAt",
              w.name AS "workspaceName"
       FROM workspace_invitations i
       INNER JOIN workspaces w ON w.id = i.workspace_id
       WHERE LOWER(i.email) = LOWER($1) AND i.status = 'pending' AND i.deleted_at IS NULL AND w.deleted_at IS NULL AND i.expires_at > NOW()`,
      [email]
    );
    return rows;
  }

  async accept(id: string): Promise<void> {
    await queryDatabase(
      `UPDATE workspace_invitations
       SET status = 'accepted', accepted_at = NOW()
       WHERE id = $1::uuid AND status = 'pending' AND deleted_at IS NULL`,
      [id]
    );
  }

  async reject(id: string): Promise<void> {
    await queryDatabase(
      `UPDATE workspace_invitations
       SET status = 'rejected', deleted_at = NOW()
       WHERE id = $1::uuid AND status = 'pending' AND deleted_at IS NULL`,
      [id]
    );
  }

  async revoke(id: string): Promise<void> {
    await queryDatabase(
      `UPDATE workspace_invitations
       SET status = 'cancelled', deleted_at = NOW()
       WHERE id = $1::uuid AND status = 'pending' AND deleted_at IS NULL`,
      [id]
    );
  }
}
