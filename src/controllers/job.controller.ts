import { Request, Response, NextFunction } from "express";
import { getJobResult, pauseJob, resumeJob, cancelJob, retryJob } from "../services/job.service";
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

export async function handlePauseJob(req: Request, res: Response, next: NextFunction) {
  try {
    const jobId = req.params.jobId as string;
    const ok = await pauseJob(jobId);
    if (!ok) {
      return res.status(400).json({ success: false, message: "Cannot pause job. Job is not currently processing or does not exist." });
    }
    res.json({ success: true, message: "Job paused successfully." });
  } catch (error) {
    next(error);
  }
}

export async function handleResumeJob(req: Request, res: Response, next: NextFunction) {
  try {
    const jobId = req.params.jobId as string;
    const ok = await resumeJob(jobId);
    if (!ok) {
      return res.status(400).json({ success: false, message: "Cannot resume job. Job is not currently paused." });
    }
    res.json({ success: true, message: "Job resumed successfully." });
  } catch (error) {
    next(error);
  }
}

export async function handleCancelJob(req: Request, res: Response, next: NextFunction) {
  try {
    const jobId = req.params.jobId as string;
    const cancelled = await cancelJob(jobId);
    if (!cancelled) {
      return res.status(404).json({ success: false, message: "Job not found or already completed/cancelled." });
    }
    res.json({ success: true, message: "Job cancelled successfully." });
  } catch (error) {
    next(error);
  }
}

export async function handleRetryJob(req: Request, res: Response, next: NextFunction) {
  try {
    const jobId = req.params.jobId as string;
    const newJob = await retryJob(jobId);
    if (!newJob) {
      return res.status(404).json({ success: false, message: "Job not found for retry." });
    }
    res.json({ success: true, jobId: newJob.id, message: "Job retry queued successfully." });
  } catch (error) {
    next(error);
  }
}
