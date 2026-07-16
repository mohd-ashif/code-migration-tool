import { Router } from "express";
import { handleGetWorkspace, handleGetUsage } from "../controllers/workspace.controller";

const router = Router();

router.get("/me", handleGetWorkspace);
router.get("/usage", handleGetUsage);

export default router;
