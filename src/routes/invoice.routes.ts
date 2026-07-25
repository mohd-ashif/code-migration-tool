import { Router } from "express";
import { invoiceController } from "../controllers/invoice.controller";
import { jwtAuthMiddleware } from "../middleware/jwt-auth.middleware";

const router = Router();

router.get("/", jwtAuthMiddleware, invoiceController.getInvoices.bind(invoiceController));
router.get("/:id", jwtAuthMiddleware, invoiceController.getInvoiceDetails.bind(invoiceController));
router.get("/:id/download", jwtAuthMiddleware, invoiceController.downloadInvoicePdf.bind(invoiceController));

export default router;
