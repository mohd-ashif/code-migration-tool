import archiver from "archiver";
import { ParsedFile } from "../types/parser.types";
import { logger } from "../utils/logger";

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
