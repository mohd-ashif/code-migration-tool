import { Router } from "express";
import { HistoryController } from "../controllers/HistoryController";

const router = Router();
const historyController = new HistoryController();

router.get("/", historyController.listHistory);
router.get("/:jobId", historyController.getHistoryById);
router.delete("/:jobId", historyController.deleteHistory);
router.post("/:jobId/retry", historyController.retryHistory);

export default router;
