import { Router } from "express";
import { handleMigrate } from "../controllers/migrate.controller";
import { handleJobStatus } from "../controllers/job.controller";
import { validateMigrationPayload } from "../middleware/validate.middleware";

const router = Router();
router.post("/", validateMigrationPayload, handleMigrate);
router.get("/:jobId", handleJobStatus);

export default router;
