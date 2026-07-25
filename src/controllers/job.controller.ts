import { Request, Response, NextFunction } from "express";
import { getJobResult, pauseJob, resumeJob, cancelJob, retryJob } from "../services/job.service";
import { MigrationRepository } from "../repositories/MigrationRepository";

const migrationRepo = new MigrationRepository();

export async function handleJobStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const jobId = req.params.jobId as string;
    const workspaceId = (req as any).workspaceId;
    const job = await getJobResult(jobId, workspaceId);
    if (!job) {
      return res.status(404).json({ success: false, message: "JOB_NOT_FOUND: Job not found or access denied." });
    }
    res.json({ success: true, job });
  } catch (error) {
    next(error);
  }
}

export async function handleListMigrations(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const workspaceId = (req as any).workspaceId;
    const { search, status, sourceFramework, targetFramework, limit, offset, sortBy, sortOrder } = req.query;

    const result = await migrationRepo.findByUserAndWorkspace(userId, workspaceId, {
      search: search as string,
      status: status as string,
      sourceFramework: sourceFramework as string,
      targetFramework: targetFramework as string,
      limit: limit ? parseInt(limit as string, 10) : 15,
      offset: offset ? parseInt(offset as string, 10) : 0,
      sortBy: sortBy as string,
      sortOrder: sortOrder as any,
    });

    res.json({ success: true, jobs: result.jobs, total: result.total });
  } catch (error) {
    next(error);
  }
}

export async function handleGetJobEvents(req: Request, res: Response, next: NextFunction) {
  try {
    const jobId = req.params.jobId as string;
    const workspaceId = (req as any).workspaceId;
    const userId = (req as any).userId;

    const dbJob = await migrationRepo.findById(jobId, userId, workspaceId);
    if (!dbJob) {
      return res.status(404).json({ success: false, message: "JOB_NOT_FOUND: Job not found or access denied." });
    }

    const events = await migrationRepo.getEventsByJobId(jobId);
    res.json({ success: true, jobId, events });
  } catch (error) {
    next(error);
  }
}

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
    const workspaceId = (req as any).workspaceId;
    const ok = await pauseJob(jobId, workspaceId);
    if (!ok) {
      return res.status(400).json({ success: false, message: "JOB_NOT_PAUSABLE: Cannot pause job. Job is not currently processing or does not exist." });
    }
    res.json({ success: true, message: "Job paused successfully." });
  } catch (error) {
    next(error);
  }
}

export async function handleResumeJob(req: Request, res: Response, next: NextFunction) {
  try {
    const jobId = req.params.jobId as string;
    const workspaceId = (req as any).workspaceId;
    const ok = await resumeJob(jobId, workspaceId);
    if (!ok) {
      return res.status(400).json({ success: false, message: "JOB_NOT_RESUMABLE: Cannot resume job. Job is not currently paused." });
    }
    res.json({ success: true, message: "Job resumed successfully." });
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
      return res.status(404).json({ success: false, message: "JOB_NOT_CANCELLABLE: Job not found or already completed/cancelled." });
    }
    res.json({ success: true, message: "Job cancelled successfully." });
  } catch (error) {
    next(error);
  }
}

export async function handleRetryJob(req: Request, res: Response, next: NextFunction) {
  try {
    const jobId = req.params.jobId as string;
    const workspaceId = (req as any).workspaceId;
    const userId = (req as any).userId;
    const newJob = await retryJob(jobId, workspaceId, userId);
    if (!newJob) {
      return res.status(400).json({ success: false, message: "JOB_NOT_RETRIABLE: Job not eligible for retry or does not exist." });
    }
    res.json({ success: true, jobId: newJob.id, status: newJob.status, message: "Job retry queued successfully." });
  } catch (error) {
    next(error);
  }
}
