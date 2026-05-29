import { Router } from "express";
import { handleReport } from "../controllers/report.controller";
import { validateReportPayload } from "../middleware/validate.middleware";

const router = Router();
router.post("/", validateReportPayload, handleReport);

export default router;
