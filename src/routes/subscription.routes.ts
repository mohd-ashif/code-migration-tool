import { Router } from "express";
import { subscriptionController } from "../controllers/subscription.controller";
import { jwtAuthMiddleware } from "../middleware/jwt-auth.middleware";

const router = Router();

router.post("/renew", jwtAuthMiddleware, subscriptionController.renew.bind(subscriptionController));
router.post("/cancel", jwtAuthMiddleware, subscriptionController.cancel.bind(subscriptionController));
router.post("/resume", jwtAuthMiddleware, subscriptionController.resume.bind(subscriptionController));

export default router;
