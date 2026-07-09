import archiver from "archiver";
import unzipper from "unzipper";
import { ParsedFile } from "../types/parser.types";
import { logger } from "../utils/logger";

/**
 * Packs parsed files into a ZIP archive buffer.
 */
export async function createArchive(files: ParsedFile[]): Promise<Buffer> {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const chunks: Buffer[] = [];

  archive.on("data", (chunk) => chunks.push(chunk));
  archive.on("warning", (error) => logger.warn(error.message));
  archive.on("error", (error) => {
    throw error;
  });

  files.forEach((file) => {
    archive.append(file.content, { name: file.path });
  });

  archive.finalize();

  return new Promise((resolve, reject) => {
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
  });
}

/**
 * Extracts a ZIP archive buffer into structured ParsedFile array.
 */
export async function extractArchive(zipBuffer: Buffer): Promise<ParsedFile[]> {
  const directory = await unzipper.Open.buffer(zipBuffer);
  const files: ParsedFile[] = [];
  
  for (const file of directory.files) {
    if (file.type === "file") {
      const content = (await file.buffer()).toString("utf8");
      files.push({
        path: file.path,
        content,
      });
    }
  }

  return files;
}
