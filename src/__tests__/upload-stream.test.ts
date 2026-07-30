import { UploadStreamService } from "../services/upload-stream.service";
import fs from "fs";
import path from "path";
import os from "os";
import archiver from "archiver";

describe("Phase 5 Upload Stream & Extraction Tests", () => {
  let tempZipPath: string;
  let tempExtractDir: string;

  beforeEach(() => {
    tempZipPath = path.join(os.tmpdir(), `test-zip-${Date.now()}.zip`);
    tempExtractDir = path.join(os.tmpdir(), `test-extract-${Date.now()}`);
  });

  afterEach(() => {
    if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);
    if (fs.existsSync(tempExtractDir)) fs.rmSync(tempExtractDir, { recursive: true, force: true });
  });

  test("Normalizes project file paths cleanly", () => {
    const rawFiles = [
      { path: "my-project/src/index.ts", content: "console.log('hi');" },
      { path: "my-project/package.json", content: "{}" },
    ];
    const normalized = UploadStreamService.normalizeProjectFiles(rawFiles);
    expect(normalized).toEqual([
      { path: "src/index.ts", content: "console.log('hi');" },
      { path: "package.json", content: "{}" },
    ]);
  });

  test("Verifies valid ZIP header bytes correctly", async () => {
    // Create real zip
    const output = fs.createWriteStream(tempZipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    const archivePromise = new Promise<void>((resolve, reject) => {
      output.on("close", () => resolve());
      archive.on("error", (err) => reject(err));
      archive.pipe(output);
      archive.append("console.log('hello world');", { name: "src/main.ts" });
      archive.finalize();
    });

    await archivePromise;

    const isValidHeader = UploadStreamService.verifyZipHeader(tempZipPath);
    expect(isValidHeader).toBe(true);

    const checksum = await UploadStreamService.calculateChecksum(tempZipPath);
    expect(checksum).toBeDefined();
    expect(checksum.length).toBe(64);
  });
});
