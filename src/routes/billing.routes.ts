import { Router } from "express";
import { billingController } from "../controllers/billing.controller";
import { jwtAuthMiddleware } from "../middleware/jwt-auth.middleware";
import { adminMiddleware } from "../middleware/admin.middleware";

const router = Router();

// Subscription Plans
router.get("/plans", billingController.getPlans.bind(billingController));

// Workspace Subscription details & Usage tracking
router.get("/subscription", jwtAuthMiddleware, billingController.getSubscription.bind(billingController));
router.get("/usage", jwtAuthMiddleware, billingController.getUsage.bind(billingController));
router.post("/address", jwtAuthMiddleware, billingController.saveBillingAddress.bind(billingController));

// Coupons
router.post("/apply-coupon", jwtAuthMiddleware, billingController.applyCoupon.bind(billingController));

// Checkout and Payment flows
router.post("/checkout", jwtAuthMiddleware, billingController.checkout.bind(billingController));
router.post("/verify", jwtAuthMiddleware, billingController.verify.bind(billingController));

// Upgrades, Downgrades, Cancellation, Resumption
router.post("/upgrade", jwtAuthMiddleware, billingController.handlePlanChange.bind(billingController));
router.post("/downgrade", jwtAuthMiddleware, billingController.handlePlanChange.bind(billingController));
router.post("/cancel", jwtAuthMiddleware, billingController.cancel.bind(billingController));
router.post("/resume", jwtAuthMiddleware, billingController.resume.bind(billingController));

// Invoices
router.get("/invoices", jwtAuthMiddleware, billingController.getInvoices.bind(billingController));
router.get("/invoices/:id", jwtAuthMiddleware, billingController.getInvoiceDetails.bind(billingController));
router.get("/invoices/:id/pdf", jwtAuthMiddleware, billingController.getInvoicePdf.bind(billingController));

// Payments
router.get("/payments", jwtAuthMiddleware, billingController.getPayments.bind(billingController));

// Admin Panel Routes
router.post("/admin/plans", jwtAuthMiddleware, adminMiddleware, billingController.adminCreatePlan.bind(billingController));
router.put("/admin/plans/:id", jwtAuthMiddleware, adminMiddleware, billingController.adminEditPlan.bind(billingController));
router.post("/admin/plans/:id/disable", jwtAuthMiddleware, adminMiddleware, billingController.adminDisablePlan.bind(billingController));
router.post("/admin/coupons", jwtAuthMiddleware, adminMiddleware, billingController.adminCreateCoupon.bind(billingController));
router.post("/admin/payments/:id/refund", jwtAuthMiddleware, adminMiddleware, billingController.adminRefundPayment.bind(billingController));
router.get("/admin/revenue", jwtAuthMiddleware, adminMiddleware, billingController.adminGetRevenue.bind(billingController));
router.get("/admin/subscriptions", jwtAuthMiddleware, adminMiddleware, billingController.adminGetSubscriptions.bind(billingController));
router.get("/admin/usage", jwtAuthMiddleware, adminMiddleware, billingController.adminGetUsage.bind(billingController));

export default router;
