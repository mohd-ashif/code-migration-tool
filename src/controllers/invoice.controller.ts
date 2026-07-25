import { Request, Response, NextFunction } from "express";
import fs from "fs";
import { invoiceRepository } from "../repositories/invoice.repository";
import { billingAddressRepository } from "../repositories/billing-address.repository";
import { invoiceGeneratorService } from "../services/invoice-generator.service";
import { cloudinaryService } from "../services/cloudinary.service";
import { HttpError } from "../middleware/error.middleware";

export class InvoiceController {
  async getInvoices(req: Request, res: Response, next: NextFunction) {
    try {
      const workspaceId = (req as any).workspaceId;
      if (!workspaceId) {
        throw new HttpError(400, "Workspace ID is required.");
      }

      const invoices = await invoiceRepository.listForWorkspace(workspaceId);
      res.json({ success: true, invoices });
    } catch (err) {
      next(err);
    }
  }

  async getInvoiceDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const workspaceId = (req as any).workspaceId;
      const { id } = req.params;

      if (!workspaceId || !id) {
        throw new HttpError(400, "Workspace ID and Invoice ID are required.");
      }

      const invoice = await invoiceRepository.findById(id, workspaceId);
      if (!invoice) {
        throw new HttpError(404, "Invoice not found.");
      }

      res.json({ success: true, invoice });
    } catch (err) {
      next(err);
    }
  }

  async downloadInvoicePdf(req: Request, res: Response, next: NextFunction) {
    try {
      const workspaceId = (req as any).workspaceId;
      const { id } = req.params;

      if (!workspaceId || !id) {
        throw new HttpError(400, "Workspace ID and Invoice ID are required.");
      }

      const invoice = await invoiceRepository.findById(id, workspaceId);
      if (!invoice) {
        throw new HttpError(404, "Invoice not found.");
      }

      const items = await invoiceRepository.getInvoiceItems(id);
      const address = await billingAddressRepository.findByWorkspaceId(workspaceId);

      const filePath = await invoiceGeneratorService.generatePdf(
        { ...invoice, items },
        address || { workspaceId, companyName: "Customer", addressLine1: "N/A", city: "Bangalore", state: "Karnataka", pinCode: "560103", country: "India", createdAt: new Date(), updatedAt: new Date() }
      );

      if (!fs.existsSync(filePath)) {
        throw new HttpError(500, "Failed to generate PDF file.");
      }

      // Sync with Cloudinary in background & save URL to DB if not present
      if (!invoice.pdfUrl || !invoice.pdfUrl.startsWith("http")) {
        cloudinaryService.uploadInvoice(filePath, invoice.invoiceNumber).then(res => {
          if (res) {
            invoiceRepository.updateCloudinaryStorage(invoice.id, res.secureUrl, res.publicId);
          }
        }).catch(() => {});
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${invoice.invoiceNumber}.pdf"`);
      
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
      fileStream.on("end", () => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath); // Clean up temporary local file
        }
      });
    } catch (err) {
      next(err);
    }
  }
}

export const invoiceController = new InvoiceController();
