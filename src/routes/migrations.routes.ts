import { Router } from "express";
import {
  handleJobStatus,
  handleListMigrations,
  handleGetJobEvents,
  handlePauseJob,
  handleResumeJob,
  handleCancelJob,
  handleRetryJob,
} from "../controllers/job.controller";

const router = Router();

router.get("/", handleListMigrations);
router.get("/:jobId", handleJobStatus);
router.get("/:jobId/events", handleGetJobEvents);
router.post("/:jobId/pause", handlePauseJob);
router.post("/:jobId/resume", handleResumeJob);
router.post("/:jobId/cancel", handleCancelJob);
router.post("/:jobId/retry", handleRetryJob);

export default router;
