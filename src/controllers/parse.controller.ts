import { Request, Response, NextFunction } from "express";
import { parseProject } from "../services/parse.service";
import { extractZip } from "../utils/unzip";

export async function handleParse(req: Request, res: Response, next: NextFunction) {
  try {
    const projectFiles = req.body.projectFiles ?? [];

    if (req.file) {
      const isZip =
        req.file.mimetype === "application/zip" ||
        req.file.mimetype === "application/x-zip-compressed" ||
        req.file.originalname.toLowerCase().endsWith(".zip");

      if (isZip) {
        const unzippedFiles = await extractZip(req.file.buffer);
        projectFiles.push(...unzippedFiles);
      } else {
        projectFiles.push({ path: req.file.originalname, content: req.file.buffer.toString("utf8") });
      }
    }

    const result = await parseProject({ projectFiles, metadata: req.body.metadata });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
