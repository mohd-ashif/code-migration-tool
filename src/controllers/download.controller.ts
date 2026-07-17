import { Request, Response, NextFunction } from "express";
import { DownloadService } from "../services/DownloadService";

const downloadService = new DownloadService();

export async function handleDownload(req: Request, res: Response, next: NextFunction) {
  try {
    const jobId = req.query.jobId as string;
    if (!jobId) {
      return res.status(400).json({ success: false, message: "Missing jobId query parameter." });
    }

    const userId = (req as any).userId;
    const workspaceId = (req as any).workspaceId;

    const { buffer, filename } = await downloadService.getDownloadArchive(jobId, userId, workspaceId);

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
}
