import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { Invoice, InvoiceItem, BillingAddress } from "../models/billing.model";
import { logger } from "../utils/logger";

export class InvoiceGeneratorService {
  private companyDetails = {
    name: "AI Code Migration Studio",
    address: "102, Cyber Heights, Outer Ring Road",
    city: "Bangalore",
    state: "Karnataka",
    pinCode: "560103",
    country: "India",
    gstin: "29ABCDE1234F1Z5", // Mock Karnataka GSTIN
  };

  /**
   * Calculates the GST breakdown based on customer state
   */
  calculateGst(params: {
    subtotal: number;
    discount: number;
    customerState: string;
  }): {
    taxableAmount: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
  } {
    const taxableAmount = Math.max(0, params.subtotal - params.discount);
    const isLocal = params.customerState.toLowerCase().trim() === this.companyDetails.state.toLowerCase().trim();

    if (isLocal) {
      // 9% CGST + 9% SGST
      const cgst = parseFloat((taxableAmount * 0.09).toFixed(2));
      const sgst = parseFloat((taxableAmount * 0.09).toFixed(2));
      const total = parseFloat((taxableAmount + cgst + sgst).toFixed(2));
      return { taxableAmount, cgst, sgst, igst: 0, total };
    } else {
      // 18% IGST
      const igst = parseFloat((taxableAmount * 0.18).toFixed(2));
      const total = parseFloat((taxableAmount + igst).toFixed(2));
      return { taxableAmount, cgst: 0, sgst: 0, igst, total };
    }
  }

  /**
   * Generates a PDF invoice dynamically and returns the absolute local file path
   */
  async generatePdf(invoice: Invoice & { items: InvoiceItem[] }, billingAddress: BillingAddress): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const invoicesDir = path.join(__dirname, "..", "..", "scratch", "invoices");
        if (!fs.existsSync(invoicesDir)) {
          fs.mkdirSync(invoicesDir, { recursive: true });
        }

        const fileName = `${invoice.invoiceNumber}.pdf`;
        const filePath = path.join(invoicesDir, fileName);

        const doc = new PDFDocument({ size: "A4", margin: 50 });
        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        // Header - Company Details
        doc.fillColor("#1A1B2D").rect(0, 0, 595.28, 120).fill(); // Navy blue header strip
        doc.fillColor("#FFFFFF")
           .font("Helvetica-Bold")
           .fontSize(20)
           .text(this.companyDetails.name, 50, 30);
        
        doc.font("Helvetica")
           .fontSize(9)
           .text(`Address: ${this.companyDetails.address}, ${this.companyDetails.city}, ${this.companyDetails.state} - ${this.companyDetails.pinCode}`, 50, 60)
           .text(`GSTIN: ${this.companyDetails.gstin}`, 50, 75);

        // Invoice title
        doc.fillColor("#FFFFFF")
           .font("Helvetica-Bold")
           .fontSize(16)
           .text("TAX INVOICE", 400, 30, { align: "right" });
        
        doc.font("Helvetica")
           .fontSize(9)
           .text(`Invoice No: ${invoice.invoiceNumber}`, 400, 55, { align: "right" })
           .text(`Date: ${new Date(invoice.createdAt).toLocaleDateString("en-IN")}`, 400, 70, { align: "right" })
           .text(`Status: ${invoice.status.toUpperCase()}`, 400, 85, { align: "right" });

        // Reset text color to dark
        doc.fillColor("#333333");

        // Billing Details
        doc.font("Helvetica-Bold").fontSize(10).text("BILL TO:", 50, 140);
        doc.font("Helvetica-Bold").fontSize(12).text(billingAddress.companyName || "Individual Customer", 50, 155);
        doc.font("Helvetica").fontSize(9)
           .text(`Address: ${billingAddress.addressLine1}${billingAddress.addressLine2 ? ', ' + billingAddress.addressLine2 : ''}`, 50, 175)
           .text(`City: ${billingAddress.city}, State: ${billingAddress.state} - ${billingAddress.pinCode}`, 50, 190)
           .text(`Country: ${billingAddress.country}`, 50, 205);

        if (billingAddress.gstNumber) {
          doc.font("Helvetica-Bold").text(`Customer GSTIN: ${billingAddress.gstNumber}`, 50, 220);
        }

        // Draw Line separator
        doc.moveTo(50, 245).lineTo(545, 245).strokeColor("#EEEEEE").lineWidth(1).stroke();

        // Table Header
        let y = 265;
        doc.fillColor("#1A1B2D").rect(50, y, 495, 20).fill();
        doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(9);
        doc.text("Description", 60, y + 5);
        doc.text("Amount (INR)", 450, y + 5, { width: 85, align: "right" });

        // Table Body
        doc.fillColor("#333333").font("Helvetica").fontSize(9);
        y += 20;
        
        invoice.items.forEach((item, index) => {
          // Zebra striping
          if (index % 2 === 0) {
            doc.fillColor("#FAFAFA").rect(50, y, 495, 25).fill();
          }
          doc.fillColor("#333333");
          doc.text(item.description, 60, y + 8);
          doc.text(`₹${parseFloat(item.amount.toString()).toFixed(2)}`, 450, y + 8, { width: 85, align: "right" });
          y += 25;
        });

        // Totals Box
        y += 20;
        doc.moveTo(300, y).lineTo(545, y).strokeColor("#DDDDDD").lineWidth(1).stroke();
        y += 10;

        const rightAlignOpts = { width: 100, align: "right" as const };
        
        doc.font("Helvetica").text("Subtotal:", 330, y);
        doc.text(`₹${parseFloat(invoice.subtotal.toString()).toFixed(2)}`, 445, y, rightAlignOpts);
        y += 15;

        if (parseFloat(invoice.discount.toString()) > 0) {
          doc.font("Helvetica").text("Discount:", 330, y);
          doc.text(`-₹${parseFloat(invoice.discount.toString()).toFixed(2)}`, 445, y, rightAlignOpts);
          y += 15;
        }

        if (parseFloat(invoice.cgst.toString()) > 0) {
          doc.font("Helvetica").text("CGST (9%):", 330, y);
          doc.text(`₹${parseFloat(invoice.cgst.toString()).toFixed(2)}`, 445, y, rightAlignOpts);
          y += 15;
          doc.font("Helvetica").text("SGST (9%):", 330, y);
          doc.text(`₹${parseFloat(invoice.sgst.toString()).toFixed(2)}`, 445, y, rightAlignOpts);
          y += 15;
        }

        if (parseFloat(invoice.igst.toString()) > 0) {
          doc.font("Helvetica").text("IGST (18%):", 330, y);
          doc.text(`₹${parseFloat(invoice.igst.toString()).toFixed(2)}`, 445, y, rightAlignOpts);
          y += 15;
        }

        doc.moveTo(330, y).lineTo(545, y).strokeColor("#CCCCCC").lineWidth(1).stroke();
        y += 8;

        doc.font("Helvetica-Bold").fontSize(11).text("Grand Total:", 330, y);
        doc.text(`₹${parseFloat(invoice.total.toString()).toFixed(2)}`, 445, y, { width: 100, align: "right" });

        // Footer terms
        doc.font("Helvetica-Oblique").fontSize(8).fillColor("#777777");
        doc.text("Thank you for choosing AI Code Migration Studio!", 50, 720, { align: "center" });
        doc.text("This is an electronically generated invoice and does not require a physical signature.", 50, 735, { align: "center" });

        doc.end();

        writeStream.on("finish", () => {
          resolve(filePath);
        });

        writeStream.on("error", (err) => {
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }
}
export const invoiceGeneratorService = new InvoiceGeneratorService();
