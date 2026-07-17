import { Router } from "express";
import { ReportsController } from "../controllers/ReportsController";

const router = Router();
const reportsController = new ReportsController();

router.get("/", reportsController.listReports);
router.get("/:jobId", reportsController.getReportById);
router.delete("/:jobId", reportsController.deleteReport);
router.get("/:jobId/pdf", reportsController.downloadPdf);
router.get("/:jobId/json", reportsController.downloadJson);

export default router;
