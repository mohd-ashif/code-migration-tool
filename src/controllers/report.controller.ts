import { Request, Response, NextFunction } from "express";
import { generateReport } from "../services/report.service";

export async function handleReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { jobId, summary } = req.body;
    if (!jobId) {
      return res.status(400).json({ success: false, message: "jobId is required." });
    }
    const report = await generateReport({ jobId, summary });
    res.status(200).json({ success: true, report });
  } catch (error) {
    next(error);
  }
}
