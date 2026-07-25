import crypto from "crypto";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger";
import { HttpError } from "../middleware/error.middleware";

export interface ChunkedUploadMetadata {
  uploadId: string;
  filename: string;
  totalSize: number;
  totalChunks: number;
  expectedChecksum?: string;
  createdAt: Date;
}

const activeUploads = new Map<string, ChunkedUploadMetadata>();

export class ChunkedUploadService {
  private get chunksBaseDir(): string {
    const dir = path.join(__dirname, "..", "..", "scratch", "chunks");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  private get uploadsBaseDir(): string {
    const dir = path.join(__dirname, "..", "..", "scratch", "uploads");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /**
   * Initializes a chunked upload session
   */
  initUpload(filename: string, totalSize: number, totalChunks: number, expectedChecksum?: string): ChunkedUploadMetadata {
    const uploadId = `upload_${Date.now()}_${uuidv4().substring(0, 8)}`;
    const metadata: ChunkedUploadMetadata = {
      uploadId,
      filename,
      totalSize,
      totalChunks,
      expectedChecksum,
      createdAt: new Date(),
    };

    activeUploads.set(uploadId, metadata);

    const uploadDir = path.join(this.chunksBaseDir, uploadId);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    logger.info(`Initialized chunked upload ${uploadId} for file ${filename} (${totalChunks} chunks, ${totalSize} bytes)`);
    return metadata;
  }

  /**
   * Saves an individual chunk to disk
   */
  async saveChunk(uploadId: string, chunkIndex: number, buffer: Buffer, chunkChecksum?: string): Promise<{ success: boolean; chunkIndex: number }> {
    const metadata = activeUploads.get(uploadId);
    const uploadDir = path.join(this.chunksBaseDir, uploadId);

    if (!fs.existsSync(uploadDir)) {
      throw new HttpError(404, `Upload session '${uploadId}' expired or not found.`);
    }

    if (chunkChecksum) {
      const computed = crypto.createHash("md5").update(buffer).digest("hex");
      if (computed.toLowerCase() !== chunkChecksum.toLowerCase()) {
        throw new HttpError(400, `Chunk ${chunkIndex} checksum verification failed.`);
      }
    }

    const chunkPath = path.join(uploadDir, `chunk_${chunkIndex}`);
    fs.writeFileSync(chunkPath, buffer);

    logger.info(`Saved upload ${uploadId} chunk ${chunkIndex + 1}/${metadata?.totalChunks || '?'}`);
    return { success: true, chunkIndex };
  }

  /**
   * Retrieves list of completed chunk indices for pause & resume support
   */
  getStatus(uploadId: string): { uploadId: string; completedChunks: number[]; totalChunks: number } {
    const metadata = activeUploads.get(uploadId);
    const uploadDir = path.join(this.chunksBaseDir, uploadId);

    if (!fs.existsSync(uploadDir)) {
      return { uploadId, completedChunks: [], totalChunks: metadata?.totalChunks || 0 };
    }

    const files = fs.readdirSync(uploadDir);
    const completedChunks: number[] = [];

    for (const f of files) {
      if (f.startsWith("chunk_")) {
        const idx = parseInt(f.replace("chunk_", ""), 10);
        if (!isNaN(idx)) {
          completedChunks.push(idx);
        }
      }
    }

    return {
      uploadId,
      completedChunks: completedChunks.sort((a, b) => a - b),
      totalChunks: metadata?.totalChunks || completedChunks.length,
    };
  }

  /**
   * Merges all uploaded chunks into a single final archive file
   */
  async completeUpload(uploadId: string, jobId: string): Promise<{ filePath: string; relativePath: string; checksum: string; size: number }> {
    const metadata = activeUploads.get(uploadId);
    const uploadDir = path.join(this.chunksBaseDir, uploadId);

    if (!fs.existsSync(uploadDir)) {
      throw new HttpError(404, `Upload session '${uploadId}' not found.`);
    }

    const status = this.getStatus(uploadId);
    const totalChunks = metadata?.totalChunks || status.completedChunks.length;

    if (status.completedChunks.length < totalChunks) {
      throw new HttpError(400, `Missing chunks. Received ${status.completedChunks.length} of ${totalChunks} chunks.`);
    }

    const relativePath = path.join("scratch", "uploads", `project-${jobId}.zip`);
    const finalPath = path.join(__dirname, "..", "..", relativePath);

    const writeStream = fs.createWriteStream(finalPath);
    const hash = crypto.createHash("sha256");

    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(uploadDir, `chunk_${i}`);
      if (!fs.existsSync(chunkPath)) {
        throw new HttpError(400, `Missing chunk file at index ${i}`);
      }
      const chunkBuffer = fs.readFileSync(chunkPath);
      writeStream.write(chunkBuffer);
      hash.update(chunkBuffer);
    }

    writeStream.end();
    await new Promise<void>((resolve) => writeStream.on("finish", () => resolve()));

    const finalChecksum = hash.digest("hex");
    const totalSize = fs.statSync(finalPath).size;

    // Cleanup chunks folder asynchronously
    try {
      fs.rmSync(uploadDir, { recursive: true, force: true });
      activeUploads.delete(uploadId);
    } catch {
      // ignore cleanup warnings
    }

    logger.info(`Completed assembly for upload ${uploadId} -> ${finalPath} (${totalSize} bytes, sha256: ${finalChecksum})`);
    return { filePath: finalPath, relativePath, checksum: finalChecksum, size: totalSize };
  }
}

export const chunkedUploadService = new ChunkedUploadService();
