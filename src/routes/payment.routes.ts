import { Router } from "express";
import { paymentController } from "../controllers/payment.controller";
import { jwtAuthMiddleware } from "../middleware/jwt-auth.middleware";

const router = Router();

router.post("/checkout", jwtAuthMiddleware, paymentController.checkout.bind(paymentController));
router.post("/verify", jwtAuthMiddleware, paymentController.verify.bind(paymentController));
router.get("/", jwtAuthMiddleware, paymentController.getPayments.bind(paymentController));
router.get("/:id", jwtAuthMiddleware, paymentController.getPaymentById.bind(paymentController));
router.post("/:id/refund", jwtAuthMiddleware, paymentController.refundPayment.bind(paymentController));
router.post("/:id/retry", jwtAuthMiddleware, paymentController.retryPayment.bind(paymentController));

export default router;
