import { Router } from "express";
import { handleParse } from "../controllers/parse.controller";
import { uploadMiddleware } from "../middleware/upload.middleware";
import { validateParsePayload } from "../middleware/validate.middleware";

const router = Router();
router.post("/", uploadMiddleware.single("project"), validateParsePayload, handleParse);

export default router;
