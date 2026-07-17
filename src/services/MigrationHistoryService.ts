import { MigrationRepository } from "../repositories/MigrationRepository";
import { enqueueMigrationJob } from "./job.service";
import { HttpError } from "./auth.service";

export class MigrationHistoryService {
  private migrationRepo = new MigrationRepository();

  async getHistory(
    userId: string,
    workspaceId: string,
    filters: {
      search?: string;
      status?: string;
      sourceFramework?: string;
      targetFramework?: string;
      dateFrom?: string;
      dateTo?: string;
      sortBy?: string;
      sortOrder?: "ASC" | "DESC";
      limit?: number;
      offset?: number;
    }
  ) {
    return this.migrationRepo.findByUserAndWorkspace(userId, workspaceId, filters);
  }

  async getHistoryById(jobId: string, userId: string, workspaceId: string) {
    const job = await this.migrationRepo.findById(jobId, userId, workspaceId);
    if (!job) {
      throw new HttpError(404, "Migration job not found or you do not have permission to view it.");
    }
    return job;
  }

  async deleteHistory(jobId: string, userId: string, workspaceId: string) {
    const success = await this.migrationRepo.softDelete(jobId, userId, workspaceId);
    if (!success) {
      throw new HttpError(404, "Migration job not found or you do not have permission to delete it.");
    }
    return true;
  }

  async retryMigration(jobId: string, userId: string, workspaceId: string) {
    const oldJob = await this.migrationRepo.findById(jobId, userId, workspaceId);
    if (!oldJob) {
      throw new HttpError(404, "Migration job to retry was not found.");
    }

    if (!oldJob.request) {
      throw new HttpError(400, "Cannot retry job: source project request payload is missing.");
    }

    // Duplicate previous job request and start a new migration
    const newRequest = {
      projectFiles: oldJob.request.projectFiles,
      targetFramework: oldJob.request.targetFramework,
      sourceFramework: oldJob.request.sourceFramework,
    };

    const newJob = enqueueMigrationJob(newRequest, workspaceId, userId);
    return newJob;
  }
}
