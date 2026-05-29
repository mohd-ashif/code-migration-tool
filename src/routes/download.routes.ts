import { Router } from "express";
import { handleDownload } from "../controllers/download.controller";

const router = Router();
router.get("/", handleDownload);

export default router;
