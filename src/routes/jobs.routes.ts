import { Router } from "express";
import { handleListJobs, handleJobStatus} from "../controllers/job.controller";

const router = Router();
router.get("/", handleListJobs);
router.get("/:jobId", handleJobStatus);

export default router; 