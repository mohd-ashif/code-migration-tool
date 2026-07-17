import { MigrationRepository } from "../repositories/MigrationRepository";
import { createArchive } from "./zip.service";
import { HttpError } from "./auth.service";

export class DownloadService {
  private migrationRepo = new MigrationRepository();

  async getDownloadArchive(jobId: string, userId: string, workspaceId: string): Promise<{ buffer: Buffer; filename: string }> {
    const job = await this.migrationRepo.findById(jobId, userId, workspaceId);
    if (!job) {
      throw new HttpError(404, "Migration job not found or access denied.");
    }

    if (job.status !== "completed" || !job.result) {
      throw new HttpError(400, "Cannot download archive: migration job is not completed yet.");
    }

    // Increment download count in DB
    const currentDownloads = job.downloadCount || 0;
    await this.migrationRepo.update(jobId, {
      downloadCount: currentDownloads + 1,
    });

    const files = (job.result.migratedFiles || []).filter((f) => f.path !== ".migration_metadata.json");
    const archiveBuffer = await createArchive(files);
    
    return {
      buffer: archiveBuffer,
      filename: `migration-${jobId}.zip`,
    };
  }
}
