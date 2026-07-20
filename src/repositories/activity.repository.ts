import { queryDatabase } from "../lib/database";
import { WorkspaceActivityLog } from "../models/workspace.model";

export class ActivityRepository {
  async log(
    workspaceId: string, 
    userId: string | null, 
    action: string, 
    metadata?: any
  ): Promise<WorkspaceActivityLog> {
    const rows = await queryDatabase(
      `INSERT INTO workspace_activity_logs (workspace_id, user_id, action, metadata)
       VALUES ($1::uuid, $2::uuid, $3, $4)
       RETURNING id, workspace_id AS "workspaceId", user_id AS "userId", action, metadata, created_at AS "createdAt"`,
      [workspaceId, userId, action, metadata ? JSON.stringify(metadata) : null]
    );
    return rows[0];
  }

  async listActivity(
    workspaceId: string, 
    limit = 20, 
    offset = 0
  ): Promise<{ logs: (WorkspaceActivityLog & { email?: string; fullName?: string })[]; total: number }> {
    const countRows = await queryDatabase(
      `SELECT COUNT(*) as total FROM workspace_activity_logs WHERE workspace_id = $1::uuid`,
      [workspaceId]
    );
    const total = parseInt(countRows[0]?.total || "0", 10);

    const rows = await queryDatabase(
      `SELECT al.id, al.workspace_id AS "workspaceId", al.user_id AS "userId", al.action, al.metadata, al.created_at AS "createdAt",
              u.email, u.full_name AS "fullName"
       FROM workspace_activity_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.workspace_id = $1::uuid
       ORDER BY al.created_at DESC
       LIMIT $2 OFFSET $3`,
      [workspaceId, limit, offset]
    );

    return {
      logs: rows,
      total
    };
  }
}
