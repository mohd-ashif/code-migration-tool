import { Request, Response, NextFunction } from "express";
import { parseProject } from "../services/parse.service";
import { extractZip } from "../utils/unzip";
import { UploadStreamService } from "../services/upload-stream.service";
import fs from "fs";
import path from "path";
import os from "os";

import { FeatureFlagService } from "../services/FeatureFlagService";

export async function handleParse(req: Request, res: Response, next: NextFunction) {
  try {
    let projectFiles = req.body.projectFiles ?? [];

    // Feature Flag Check: folder_upload
    const userId = (req as any).userId;
    const workspaceId = (req as any).workspaceId;
    const isFolderUploadEnabled = await FeatureFlagService.isFeatureEnabled({
      featureKey: "folder_upload",
      userId,
      workspaceId,
    });

    if (!isFolderUploadEnabled && req.body.isFolder) {
      return res.status(403).json({
        success: false,
        code: "FEATURE_DISABLED",
        message: "Folder upload feature is currently disabled by platform configuration.",
      });
    }

    if (req.file) {
      const isZip =
        req.file.mimetype === "application/zip" ||
        req.file.mimetype === "application/x-zip-compressed" ||
        req.file.originalname.toLowerCase().endsWith(".zip");

      if (isZip) {
        // Save to temp file for streaming extraction validation
        const tempZipPath = path.join(os.tmpdir(), `upload-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.zip`);
        const tempExtractDir = path.join(os.tmpdir(), `extract-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);

        fs.writeFileSync(tempZipPath, req.file.buffer);

        try {
          const extraction = await UploadStreamService.safelyExtractZip(tempZipPath, tempExtractDir);
          projectFiles.push(...extraction.extractedFiles);
        } finally {
          if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);
          if (fs.existsSync(tempExtractDir)) fs.rmSync(tempExtractDir, { recursive: true, force: true });
        }
      } else {
        projectFiles.push({ path: req.file.originalname, content: req.file.buffer.toString("utf8") });
      }
    }

    projectFiles = UploadStreamService.normalizeProjectFiles(projectFiles);

    const result = await parseProject({ projectFiles, metadata: req.body.metadata });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
