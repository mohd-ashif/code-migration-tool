import { queryDatabase } from "../lib/database";
import { UploadedProject } from "../models/migration.model";

export function mapRowToUpload(row: any): UploadedProject {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    jobId: row.job_id,
    originalFilename: row.original_filename,
    storagePath: row.storage_path,
    size: parseInt(row.size || "0", 10),
    checksum: row.checksum ?? "",
    createdAt: new Date(row.created_at),
  };
}

export class UploadRepository {
  async create(data: {
    workspaceId: string;
    userId: string;
    jobId: string;
    originalFilename: string;
    storagePath: string;
    size: number;
    checksum: string;
  }): Promise<UploadedProject> {
    const query = `
      INSERT INTO uploaded_projects (
        workspace_id, user_id, job_id, original_filename, storage_path, size, checksum
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const rows = await queryDatabase(query, [
      data.workspaceId,
      data.userId,
      data.jobId,
      data.originalFilename,
      data.storagePath,
      data.size,
      data.checksum,
    ]);
    return mapRowToUpload(rows[0]);
  }

  async getStorageUsed(userId: string, workspaceId: string): Promise<number> {
    const query = `
      SELECT COALESCE(SUM(size), 0) as total_size 
      FROM uploaded_projects
      WHERE user_id = $1::uuid AND workspace_id = $2::uuid
    `;
    const rows = await queryDatabase(query, [userId, workspaceId]);
    return parseInt(rows[0]?.total_size ?? "0", 10);
  }
}
