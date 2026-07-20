import { queryDatabase } from "../lib/database";
import { WorkspaceMember } from "../models/workspace.model";

export class MemberRepository {
  async addMember(
    workspaceId: string, 
    userId: string, 
    role: string, 
    invitedBy?: string | null
  ): Promise<WorkspaceMember> {
    const rows = await queryDatabase(
      `INSERT INTO workspace_members (workspace_id, user_id, role, status, joined_at, invited_by, last_active_at)
       VALUES ($1::uuid, $2::uuid, $3, 'active', NOW(), $4::uuid, NOW())
       ON CONFLICT (workspace_id, user_id) DO UPDATE 
         SET role = EXCLUDED.role, status = 'active', joined_at = NOW(), invited_by = EXCLUDED.invited_by, deleted_at = NULL, updated_at = NOW()
       RETURNING id, workspace_id AS "workspaceId", user_id AS "userId", role, status, 
                 joined_at AS "joinedAt", invited_by AS "invitedBy", last_active_at AS "lastActiveAt", 
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [workspaceId, userId, role, invitedBy || null]
    );
    return rows[0];
  }

  async findMember(workspaceId: string, userId: string): Promise<WorkspaceMember | null> {
    const rows = await queryDatabase(
      `SELECT id, workspace_id AS "workspaceId", user_id AS "userId", role, status, 
              joined_at AS "joinedAt", invited_by AS "invitedBy", last_active_at AS "lastActiveAt", 
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM workspace_members
       WHERE workspace_id = $1::uuid AND user_id = $2::uuid AND deleted_at IS NULL`,
      [workspaceId, userId]
    );
    return rows[0] || null;
  }

  async listMembers(workspaceId: string): Promise<(WorkspaceMember & { email: string; fullName?: string | null; avatarUrl?: string | null })[]> {
    const rows = await queryDatabase(
      `SELECT wm.id, wm.workspace_id AS "workspaceId", wm.user_id AS "userId", wm.role, wm.status,
              wm.joined_at AS "joinedAt", wm.invited_by AS "invitedBy", wm.last_active_at AS "lastActiveAt",
              wm.created_at AS "createdAt", wm.updated_at AS "updatedAt",
              u.email, u.full_name AS "fullName", u.avatar_url AS "avatarUrl"
       FROM workspace_members wm
       INNER JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = $1::uuid AND wm.deleted_at IS NULL AND u.deleted_at IS NULL`,
      [workspaceId]
    );
    return rows;
  }

  async updateRole(workspaceId: string, userId: string, role: string): Promise<WorkspaceMember> {
    const rows = await queryDatabase(
      `UPDATE workspace_members
       SET role = $3, updated_at = NOW()
       WHERE workspace_id = $1::uuid AND user_id = $2::uuid AND deleted_at IS NULL
       RETURNING id, workspace_id AS "workspaceId", user_id AS "userId", role, status, 
                 joined_at AS "joinedAt", invited_by AS "invitedBy", last_active_at AS "lastActiveAt", 
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [workspaceId, userId, role]
    );
    return rows[0];
  }

  async removeMember(workspaceId: string, userId: string): Promise<void> {
    await queryDatabase(
      `UPDATE workspace_members
       SET deleted_at = NOW()
       WHERE workspace_id = $1::uuid AND user_id = $2::uuid AND deleted_at IS NULL`,
      [workspaceId, userId]
    );
  }

  async updateLastActive(workspaceId: string, userId: string): Promise<void> {
    await queryDatabase(
      `UPDATE workspace_members
       SET last_active_at = NOW()
       WHERE workspace_id = $1::uuid AND user_id = $2::uuid AND deleted_at IS NULL`,
      [workspaceId, userId]
    );
  }
}
