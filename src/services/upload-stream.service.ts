import fs from "fs";
import path from "path";
import crypto from "crypto";
import unzipper from "unzipper";
import { config } from "../config";
import { logger } from "../utils/logger";
import { ProjectFile } from "../types/migration.types";

export interface StreamValidationResult {
  checksum: string;
  sizeBytes: number;
  extractedFiles: ProjectFile[];
  fileCount: number;
  extractedSizeBytes: number;
}

export class UploadStreamService {
  /**
   * Verify ZIP magic header bytes (PK\x03\x04)
   */
  public static verifyZipHeader(filePath: string): boolean {
    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(4);
    fs.readSync(fd, buffer, 0, 4, 0);
    fs.closeSync(fd);
    return buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
  }

  /**
   * Calculate SHA-256 checksum of a file asynchronously
   */
  public static async calculateChecksum(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash("sha256");
      const stream = fs.createReadStream(filePath);
      stream.on("data", (data) => hash.update(data));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", (err) => reject(err));
    });
  }

  /**
   * Safely extract a ZIP archive with streaming Zip-Slip, Zip-Bomb, and file limit protections
   */
  public static async safelyExtractZip(
    zipFilePath: string,
    outputDir: string,
    onProgress?: (processedFiles: number, bytesRead: number) => void
  ): Promise<StreamValidationResult> {
    if (!fs.existsSync(zipFilePath)) {
      throw new Error("UPLOAD_NOT_FOUND: Zip file does not exist.");
    }

    const stat = fs.statSync(zipFilePath);
    const maxUploadBytes = config.MAX_UPLOAD_SIZE_MB * 1024 * 1024;
    if (stat.size > maxUploadBytes) {
      throw new Error(`UPLOAD_TOO_LARGE: Uploaded archive exceeds maximum size limit of ${config.MAX_UPLOAD_SIZE_MB}MB.`);
    }

    if (!this.verifyZipHeader(zipFilePath)) {
      throw new Error("INVALID_ARCHIVE: Uploaded file is not a valid ZIP archive (signature mismatch).");
    }

    const checksum = await this.calculateChecksum(zipFilePath);
    const maxExtractedBytes = config.MAX_EXTRACTED_SIZE_MB * 1024 * 1024;
    const maxFiles = config.MAX_PROJECT_FILES;

    const directory = await unzipper.Open.file(zipFilePath);
    const extractedFiles: ProjectFile[] = [];

    let totalExtractedBytes = 0;
    let fileCount = 0;

    for (const file of directory.files) {
      if (file.type === "Directory") continue;

      // Zip Slip / Path Traversal Prevention
      const rawPath = file.path.replace(/\\/g, "/");
      const normalizedPath = path.normalize(rawPath).replace(/^(\.\.[\/\\])+/, "");

      if (normalizedPath.includes("..") || path.isAbsolute(normalizedPath)) {
        logger.warn(`Zip-Slip vulnerability blocked: ${file.path}`);
        continue;
      }

      // Ignore junk/system files
      if (
        normalizedPath.startsWith("__MACOSX/") ||
        normalizedPath.endsWith(".DS_Store") ||
        normalizedPath.includes("node_modules/") ||
        normalizedPath.includes(".git/")
      ) {
        continue;
      }

      fileCount++;
      if (fileCount > maxFiles) {
        throw new Error(`EXCESSIVE_FILES: Project contains too many files. Exceeds limit of ${maxFiles} files.`);
      }

      const contentBuffer = await file.buffer();
      totalExtractedBytes += contentBuffer.length;

      if (totalExtractedBytes > maxExtractedBytes) {
        throw new Error(`ZIP_BOMB_DETECTED: Extracted content size exceeds safety limit of ${config.MAX_EXTRACTED_SIZE_MB}MB.`);
      }

      // Save to disk target
      const targetPath = path.join(outputDir, normalizedPath);
      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      fs.writeFileSync(targetPath, contentBuffer);

      // Check text vs binary
      const contentStr = contentBuffer.toString("utf8");
      extractedFiles.push({
        path: normalizedPath,
        content: contentStr,
      });

      if (onProgress) {
        onProgress(fileCount, totalExtractedBytes);
      }
    }

    const normalizedExtractedFiles = this.normalizeProjectFiles(extractedFiles);

    return {
      checksum,
      sizeBytes: stat.size,
      extractedFiles: normalizedExtractedFiles,
      fileCount: normalizedExtractedFiles.length,
      extractedSizeBytes: totalExtractedBytes,
    };
  }

  /**
   * Normalize project file relative paths (strip top-level root directory if present)
   */
  public static normalizeProjectFiles(files: ProjectFile[]): ProjectFile[] {
    if (files.length === 0) return files;

    const formattedFiles = files.map((f) => ({
      path: f.path.replace(/\\/g, "/").replace(/^\/+/, ""),
      content: f.content,
    }));

    // Check if all files share a common single root directory
    const parts = formattedFiles.map((f) => f.path.split("/"));
    const firstSegment = parts[0]?.[0];

    if (firstSegment && parts.every((p) => p.length > 1 && p[0] === firstSegment)) {
      return formattedFiles.map((f) => ({
        path: f.path.substring(firstSegment.length + 1),
        content: f.content,
      }));
    }

    return formattedFiles;
  }
}
