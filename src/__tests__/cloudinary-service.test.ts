import { cloudinaryService } from "../services/cloudinary.service";
import fs from "fs";
import path from "path";

describe("CloudinaryService Unit & Integration Tests", () => {
  it("should verify isConfigured returns true when credentials are provided", () => {
    expect(cloudinaryService.isConfigured()).toBe(true);
  });

  it("should construct valid Cloudinary invoice raw URLs", () => {
    const url = cloudinaryService.getInvoiceUrl("INV-2026-0004");
    expect(url).toContain("https://res.cloudinary.com/");
    expect(url).toContain("invoices/INV-2026-0004.pdf");
  });

  it("should reject non-PDF file upload for security", async () => {
    const fakeFilePath = path.join(__dirname, "test-script.js");
    fs.writeFileSync(fakeFilePath, "console.log('test')");

    try {
      const result = await cloudinaryService.uploadInvoice(fakeFilePath, "INV-TEST-SEC");
      expect(result).toBeNull();
    } finally {
      if (fs.existsSync(fakeFilePath)) {
        fs.unlinkSync(fakeFilePath);
      }
    }
  });

  it("should reject non-existent file path", async () => {
    const result = await cloudinaryService.uploadInvoice("/non/existent/file.pdf", "INV-TEST-404");
    expect(result).toBeNull();
  });
});
