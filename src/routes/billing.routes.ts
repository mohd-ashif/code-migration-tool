import { Router } from "express";
import { billingController } from "../controllers/billing.controller";

const router = Router();

// Subscription Plans
router.get("/plans", billingController.getPlans.bind(billingController));

// Workspace Subscription details & Usage tracking
router.get("/subscription", billingController.getSubscription.bind(billingController));
router.get("/usage", billingController.getUsage.bind(billingController));

// Coupons
router.post("/apply-coupon", billingController.applyCoupon.bind(billingController));

// Checkout and Payment flows
router.post("/checkout", billingController.checkout.bind(billingController));
router.post("/verify", billingController.verify.bind(billingController));

// Upgrades, Downgrades, Cancellation, Resumption
router.post("/upgrade", billingController.handlePlanChange.bind(billingController));
router.post("/downgrade", billingController.handlePlanChange.bind(billingController));
router.post("/cancel", billingController.cancel.bind(billingController));
router.post("/resume", billingController.resume.bind(billingController));

// Invoices
router.get("/invoices", billingController.getInvoices.bind(billingController));
router.get("/invoices/:id", billingController.getInvoiceDetails.bind(billingController));
router.get("/invoices/:id/pdf", billingController.getInvoicePdf.bind(billingController));

export default router;
