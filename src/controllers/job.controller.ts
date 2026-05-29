import { Request, Response, NextFunction } from "express";
import { getJobResult } from "../services/job.service";

export async function handleJobStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const jobId = req.params.jobId as string;
    const job = await getJobResult(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found." });
    }
    res.json({ success: true, job });
  } catch (error) {
    next(error);
  }
}
