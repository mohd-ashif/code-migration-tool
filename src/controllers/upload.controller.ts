import { Request, Response, NextFunction } from "express";
import { chunkedUploadService } from "../services/chunked-upload.service";
import { enqueueMigrationJob } from "../services/job.service";
import { HttpError } from "../middleware/error.middleware";

export class UploadController {
  async initUpload(req: Request, res: Response, next: NextFunction) {
    try {
      const { filename, totalSize, totalChunks, checksum } = req.body;
      if (!filename || !totalSize || !totalChunks) {
        throw new HttpError(400, "filename, totalSize, and totalChunks are required.");
      }

      const metadata = chunkedUploadService.initUpload(filename, Number(totalSize), Number(totalChunks), checksum);
      res.json({ success: true, metadata });
    } catch (err) {
      next(err);
    }
  }

  async uploadChunk(req: Request, res: Response, next: NextFunction) {
    try {
      const { uploadId, chunkIndex, checksum } = req.body;
      const file = req.file;

      if (!uploadId || chunkIndex === undefined || !file) {
        throw new HttpError(400, "uploadId, chunkIndex, and chunk file buffer are required.");
      }

      const result = await chunkedUploadService.saveChunk(uploadId, Number(chunkIndex), file.buffer, checksum);
      res.json({ success: true, result });
    } catch (err) {
      next(err);
    }
  }

  async getUploadStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { uploadId } = req.params;
      if (!uploadId) {
        throw new HttpError(400, "uploadId is required.");
      }

      const status = chunkedUploadService.getStatus(uploadId);
      res.json({ success: true, status });
    } catch (err) {
      next(err);
    }
  }

  async completeUpload(req: Request, res: Response, next: NextFunction) {
    try {
      const { uploadId, targetFramework, sourceFramework } = req.body;
      const workspaceId = (req as any).workspaceId;
      const userId = (req as any).userId;

      if (!uploadId || !targetFramework) {
        throw new HttpError(400, "uploadId and targetFramework are required.");
      }

      // Enqueue job container
      const job = enqueueMigrationJob(
        { projectFiles: [], targetFramework, sourceFramework },
        workspaceId,
        userId
      );

      const assembled = await chunkedUploadService.completeUpload(uploadId, job.id);

      res.json({
        success: true,
        jobId: job.id,
        status: job.status,
        fileInfo: assembled
      });
    } catch (err) {
      next(err);
    }
  }
}

export const uploadController = new UploadController();
