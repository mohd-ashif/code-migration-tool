import archiver from "archiver";
import { ParsedFile } from "../types/parser.types";

export async function createZip(files: ParsedFile[]): Promise<Buffer> {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  archive.on("data", (chunk) => chunks.push(chunk));
  files.forEach((file) => {
    archive.append(file.content, { name: file.path });
  });
  archive.finalize();
  return new Promise((resolve, reject) => {
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
  });
}
