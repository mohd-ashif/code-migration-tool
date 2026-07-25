import { Router } from "express";
import multer from "multer";
import { uploadController } from "../controllers/upload.controller";

const router = Router();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB per chunk limit

router.post("/init", (req, res, next) => uploadController.initUpload(req, res, next));
router.post("/chunk", upload.single("chunk"), (req, res, next) => uploadController.uploadChunk(req, res, next));
router.get("/status/:uploadId", (req, res, next) => uploadController.getUploadStatus(req, res, next));
router.post("/complete", (req, res, next) => uploadController.completeUpload(req, res, next));

export default router;
