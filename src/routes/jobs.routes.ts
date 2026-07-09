import { Router } from "express";
import { handleListJobs, handleJobStatus, handleCancelJob } from "../controllers/job.controller";

const router = Router();
router.get("/", handleListJobs);
router.get("/:jobId", handleJobStatus);
router.post("/:jobId/cancel", handleCancelJob);

export default router; 