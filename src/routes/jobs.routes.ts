import { Router } from "express";
import {
  handleJobStatus,
  handleGetRecentJobs,
  handlePauseJob,
  handleResumeJob,
  handleCancelJob,
  handleRetryJob
} from "../controllers/job.controller";

const router = Router();
router.get("/recent", handleGetRecentJobs);
router.get("/:jobId", handleJobStatus);
router.post("/:jobId/pause", handlePauseJob);
router.post("/:jobId/resume", handleResumeJob);
router.post("/:jobId/cancel", handleCancelJob);
router.post("/:jobId/retry", handleRetryJob);

export default router;