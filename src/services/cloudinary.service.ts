import crypto from "crypto";
import fs from "fs";
import https from "https";
import path from "path";
import { config } from "../config";
import { logger } from "../utils/logger";

export interface CloudinaryUploadResult {
  secureUrl: string;
  publicId: string;
}

export class CloudinaryService {
  private get credentials() {
    let cloudName = config.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME || "";
    let apiKey = config.CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY || "";
    let apiSecret = config.CLOUDINARY_API_SECRET || process.env.CLOUDINARY_API_SECRET || "";

    const cloudinaryUrl = process.env.CLOUDINARY_URL || "";
    if ((!cloudName || !apiKey || !apiSecret) && cloudinaryUrl.startsWith("cloudinary://")) {
      try {
        const matches = cloudinaryUrl.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
        if (matches) {
          apiKey = matches[1];
          apiSecret = matches[2];
          cloudName = matches[3];
        }
      } catch (e) {
        // Ignore parse error
      }
    }

    return { cloudName, apiKey, apiSecret };
  }

  private get cloudName(): string {
    return this.credentials.cloudName;
  }

  private get apiKey(): string {
    return this.credentials.apiKey;
  }

  private get apiSecret(): string {
    return this.credentials.apiSecret;
  }

  private get folder(): string {
    return config.CLOUDINARY_FOLDER || "invoices";
  }

  public isConfigured(): boolean {
    return Boolean(this.cloudName && this.apiKey && this.apiSecret);
  }

  /**
   * Constructs secure Cloudinary URL for a given public_id
   */
  getInvoiceUrl(publicId: string): string {
    const cleanPublicId = publicId.startsWith(`${this.folder}/`) ? publicId : `${this.folder}/${publicId}`;
    return `https://res.cloudinary.com/${this.cloudName}/raw/upload/${cleanPublicId}.pdf`;
  }

  /**
   * Uploads an invoice PDF file to Cloudinary with retry logic and file validation
   */
  async uploadInvoice(filePath: string, invoiceNumber: string, retries = 3): Promise<CloudinaryUploadResult | null> {
    if (!this.isConfigured()) {
      logger.info("Cloudinary credentials missing. Falling back to local storage.");
      return null;
    }

    if (!fs.existsSync(filePath)) {
      logger.error(`Upload error: Invoice PDF file not found at ${filePath}`);
      return null;
    }

    // Security Validation: Allow PDF only and check 10MB size limit
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== ".pdf") {
      logger.error(`Security error: Invalid file type '${ext}'. Only PDF uploads allowed.`);
      return null;
    }

    const stats = fs.statSync(filePath);
    const maxSizeBytes = 10 * 1024 * 1024; // 10 MB
    if (stats.size > maxSizeBytes) {
      logger.error(`Security error: File size (${stats.size} bytes) exceeds 10MB limit.`);
      return null;
    }

    const cleanPublicId = invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
    let attempt = 0;

    while (attempt < retries) {
      attempt++;
      try {
        const result = await this.performUpload(filePath, cleanPublicId);
        if (result) {
          return result;
        }
      } catch (err: any) {
        logger.warn(`Cloudinary upload attempt ${attempt}/${retries} failed: ${err.message}`);
      }

      if (attempt < retries) {
        await new Promise((res) => setTimeout(res, 1000 * attempt));
      }
    }

    logger.error(`Cloudinary upload failed after ${retries} attempts.`);
    return null;
  }

  /**
   * Legacy backward-compatible helper for invoice generators
   */
  async uploadPdf(filePath: string, publicId: string): Promise<string | null> {
    const res = await this.uploadInvoice(filePath, publicId);
    return res ? res.secureUrl : null;
  }

  /**
   * Deletes an invoice PDF from Cloudinary by publicId
   */
  async deleteInvoice(publicId: string): Promise<boolean> {
    if (!this.isConfigured()) return false;

    const fullPublicId = publicId.startsWith(`${this.folder}/`) ? publicId : `${this.folder}/${publicId}`;

    return new Promise((resolve) => {
      try {
        const timestamp = Math.floor(Date.now() / 1000);
        const paramString = `public_id=${fullPublicId}&timestamp=${timestamp}${this.apiSecret}`;
        const signature = crypto.createHash("sha1").update(paramString).digest("hex");

        const postData = new URLSearchParams({
          api_key: this.apiKey,
          public_id: fullPublicId,
          timestamp: String(timestamp),
          signature
        }).toString();

        const options: https.RequestOptions = {
          hostname: "api.cloudinary.com",
          port: 443,
          path: `/v1_1/${this.cloudName}/raw/destroy`,
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(postData)
          }
        };

        const req = https.request(options, (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            try {
              const parsed = JSON.parse(body);
              if (parsed.result === "ok") {
                logger.info(`Successfully deleted invoice ${fullPublicId} from Cloudinary.`);
                resolve(true);
              } else {
                logger.warn(`Cloudinary delete response: ${body}`);
                resolve(false);
              }
            } catch {
              resolve(false);
            }
          });
        });

        req.on("error", () => resolve(false));
        req.write(postData);
        req.end();
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Replaces an existing invoice on Cloudinary with a updated PDF file
   */
  async replaceInvoice(filePath: string, invoiceNumber: string): Promise<CloudinaryUploadResult | null> {
    const cleanPublicId = invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
    await this.deleteInvoice(`${this.folder}/${cleanPublicId}`);
    return this.uploadInvoice(filePath, invoiceNumber);
  }

  private performUpload(filePath: string, cleanPublicId: string): Promise<CloudinaryUploadResult | null> {
    return new Promise((resolve, reject) => {
      try {
        const timestamp = Math.floor(Date.now() / 1000);
        const paramString = `folder=${this.folder}&public_id=${cleanPublicId}&timestamp=${timestamp}${this.apiSecret}`;
        const signature = crypto.createHash("sha1").update(paramString).digest("hex");

        const boundary = `----CloudinaryBoundary${Date.now()}`;
        const fileData = fs.readFileSync(filePath);
        const fileName = path.basename(filePath);

        const formFields = [
          { name: "api_key", value: this.apiKey },
          { name: "timestamp", value: String(timestamp) },
          { name: "folder", value: this.folder },
          { name: "public_id", value: cleanPublicId },
          { name: "signature", value: signature },
        ];

        let payloadBuffer = Buffer.alloc(0);

        for (const field of formFields) {
          const fieldHeader = `--${boundary}\r\nContent-Disposition: form-data; name="${field.name}"\r\n\r\n${field.value}\r\n`;
          payloadBuffer = Buffer.concat([payloadBuffer, Buffer.from(fieldHeader, "utf8")]);
        }

        const fileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/pdf\r\n\r\n`;
        const fileFooter = `\r\n--${boundary}--\r\n`;

        payloadBuffer = Buffer.concat([
          payloadBuffer,
          Buffer.from(fileHeader, "utf8"),
          fileData,
          Buffer.from(fileFooter, "utf8")
        ]);

        const options: https.RequestOptions = {
          hostname: "api.cloudinary.com",
          port: 443,
          path: `/v1_1/${this.cloudName}/raw/upload`,
          method: "POST",
          headers: {
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
            "Content-Length": payloadBuffer.length
          }
        };

        const req = https.request(options, (res) => {
          let responseBody = "";
          res.on("data", (chunk) => {
            responseBody += chunk;
          });

          res.on("end", () => {
            try {
              const parsed = JSON.parse(responseBody);
              if (res.statusCode && res.statusCode < 300 && parsed.secure_url) {
                logger.info(`Successfully uploaded PDF invoice to Cloudinary: ${parsed.secure_url}`);
                resolve({
                  secureUrl: parsed.secure_url,
                  publicId: parsed.public_id || `${this.folder}/${cleanPublicId}`
                });
              } else {
                logger.error(`Cloudinary Upload Error (${res.statusCode}): ${JSON.stringify(parsed)}`);
                resolve(null);
              }
            } catch (err) {
              logger.error(`Failed to parse Cloudinary response: ${responseBody}`);
              reject(err);
            }
          });
        });

        req.on("error", (err) => {
          reject(err);
        });

        req.write(payloadBuffer);
        req.end();
      } catch (err: any) {
        reject(err);
      }
    });
  }
}

export const cloudinaryService = new CloudinaryService();
