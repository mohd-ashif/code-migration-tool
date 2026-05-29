import { Request, Response, NextFunction } from "express";
import { createArchive } from "../services/zip.service";
import { getJobResult } from "../services/job.service";

export async function handleDownload(req: Request, res: Response, next: NextFunction) {
  try {
    const jobId = req.query.jobId as string;
    if (!jobId) {
      return res.status(400).json({ success: false, message: "Missing jobId query parameter." });
    }

    const jobResult = await getJobResult(jobId);
    if (!jobResult || !jobResult.result) {
      return res.status(404).json({ success: false, message: "Job result not found." });
    }

    const archiveBuffer = await createArchive(jobResult.result.migratedFiles || []);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename=migration-${jobId}.zip`);
    res.send(archiveBuffer);
  } catch (error) {
    next(error);
  }
}
