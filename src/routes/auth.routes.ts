import { Router } from "express";
import {
  handleRegister,
  handleLogin,
  handleRefresh,
  handleLogout,
  handleVerifyEmail,
  handleForgotPassword,
  handleResetPassword,
  handleGoogleRedirect,
  handleGoogleCallback,
  handleGetMe,
  handleGithubRedirect,
  handleGithubCallback,
  handleSendMagicLink,
  handleVerifyMagicLink,
} from "../controllers/auth.controller";
import { jwtAuthMiddleware } from "../middleware/jwt-auth.middleware";
import { createAuthRateLimiter } from "../middleware/rate-limit-auth.middleware";

const router = Router();

// Google OAuth routes
router.get("/google", handleGoogleRedirect);
router.get("/google/callback", handleGoogleCallback);

// GitHub OAuth routes
router.get("/github", handleGithubRedirect);
router.get("/github/callback", handleGithubCallback);

// Rate limiters for sensitive actions:
// Max 5 logins per minute
const loginLimiter = createAuthRateLimiter(5, 60_000);
// Max 5 registrations per 15 minutes
const registerLimiter = createAuthRateLimiter(5, 15 * 60_000);
// Max 3 password reset requests per 15 minutes
const resetRequestLimiter = createAuthRateLimiter(3, 15 * 60_000);

router.post("/register", registerLimiter, handleRegister);
router.post("/login", loginLimiter, handleLogin);
router.post("/refresh", handleRefresh);
router.post("/logout", jwtAuthMiddleware, handleLogout);
router.get("/verify-email", handleVerifyEmail);
router.post("/forgot-password", resetRequestLimiter, handleForgotPassword);
router.post("/reset-password", resetRequestLimiter, handleResetPassword);
router.post("/magic-link", loginLimiter, handleSendMagicLink);
router.post("/magic-link/verify", loginLimiter, handleVerifyMagicLink);
router.get("/me", jwtAuthMiddleware, handleGetMe);

export default router;
