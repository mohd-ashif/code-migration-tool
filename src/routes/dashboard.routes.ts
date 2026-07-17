import { Router } from "express";
import { DashboardController } from "../controllers/DashboardController";

const router = Router();
const dashboardController = new DashboardController();

router.get("/", dashboardController.getDashboardData);

export default router;
