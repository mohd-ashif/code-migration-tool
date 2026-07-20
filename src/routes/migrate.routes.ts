import { Router } from "express";
import { handleMigrate } from "../controllers/migrate.controller";
import { handleJobStatus } from "../controllers/job.controller";
import { validateMigrationPayload } from "../middleware/validate.middleware";
import { requireUsageLimit } from "../middleware/billing.middleware";

const router = Router();
router.post("/", validateMigrationPayload, requireUsageLimit("migrations"), handleMigrate);
router.get("/:jobId", handleJobStatus);

export default router;
