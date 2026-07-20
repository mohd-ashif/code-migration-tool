import { Router } from "express";
import {
  handleUpdateProfile,
  handleChangePassword,
  handleGetLinkedAccounts,
  handleUnlinkAccount,
  handleGetActiveSessions,
  handleRevokeSession,
  handleRevokeAllOtherSessions,
  handleCreateApiKey,
  handleListApiKeys,
  handleRevokeApiKey,
  handleGetActivityLogs,
  handleGetLoginLogs,
  handleDeleteAccount,
} from "../controllers/user.controller";
import { jwtAuthMiddleware } from "../middleware/jwt-auth.middleware";

const router = Router();

// Apply JWT authentication to protect all user management endpoints
router.use(jwtAuthMiddleware);

router.put("/profile", handleUpdateProfile);
router.post("/change-password", handleChangePassword);
router.get("/linked-accounts", handleGetLinkedAccounts);
router.delete("/linked-accounts/:provider", handleUnlinkAccount);

// Session management
router.get("/sessions", handleGetActiveSessions);
router.delete("/sessions/:id", handleRevokeSession);
router.delete("/sessions", handleRevokeAllOtherSessions);

// API Keys management
router.post("/api-keys", handleCreateApiKey);
router.get("/api-keys", handleListApiKeys);
router.delete("/api-keys/:id", handleRevokeApiKey);

// Activity logs
router.get("/activity-history", handleGetActivityLogs);
router.get("/login-history", handleGetLoginLogs);

// Delete Account
router.delete("/account", handleDeleteAccount);

export default router;
