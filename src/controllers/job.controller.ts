import { Request, Response, NextFunction } from "express";
import { getJobResult, listJobs, cancelJob } from "../services/job.service";
import { MigrationRepository } from "../repositories/MigrationRepository";

export async function handleJobStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const jobId = req.params.jobId as string;
    const workspaceId = (req as any).workspaceId;
    const job = await getJobResult(jobId, workspaceId);
    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found." });
    }
    res.json({ success: true, job });
  } catch (error) {
    next(error);
  }
}

const migrationRepo = new MigrationRepository();

export async function handleGetRecentJobs(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const workspaceId = (req as any).workspaceId;
    const jobs = await migrationRepo.getRecentJobs(userId, workspaceId, 10);
    res.json({ success: true, jobs });
  } catch (error) {
    next(error);
  }
}

export async function handleListJobs(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = (req as any).workspaceId;
    const jobs = await listJobs(workspaceId);
    res.json({ success: true, jobs });
  } catch (error) {
    next(error);
  }
}

export async function handleCancelJob(req: Request, res: Response, next: NextFunction) {
  try {
    const jobId = req.params.jobId as string;
    const workspaceId = (req as any).workspaceId;
    const cancelled = await cancelJob(jobId, workspaceId);
    if (!cancelled) {
      return res.status(404).json({ success: false, message: "Job not found or already completed/cancelled." });
    }
    res.json({ success: true, message: "Job cancellation requested successfully." });
  } catch (error) {
    next(error);
  }
}

