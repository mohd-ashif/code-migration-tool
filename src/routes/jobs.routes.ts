import { Router } from "express";
import { handleListJobs, handleJobStatus, handleCancelJob, handleGetRecentJobs } from "../controllers/job.controller";

const router = Router();
router.get("/", handleListJobs);
router.get("/recent", handleGetRecentJobs);
router.get("/:jobId", handleJobStatus);
router.post("/:jobId/cancel", handleCancelJob);

export default router;