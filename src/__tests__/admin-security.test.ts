import { hasPermission, AdminRole } from "../middleware/admin-auth.middleware";
import { FeatureFlagService } from "../services/FeatureFlagService";

describe("Phase 10 Admin Panel Security & RBAC Unit Tests", () => {
  it("should grant full access to SUPER_ADMIN for all permissions", () => {
    expect(hasPermission("SUPER_ADMIN", "users.manage")).toBe(true);
    expect(hasPermission("SUPER_ADMIN", "payments.refund")).toBe(true);
    expect(hasPermission("SUPER_ADMIN", "features.manage")).toBe(true);
  });

  it("should grant users.manage and jobs.manage to ADMIN role but restrict payments.refund", () => {
    expect(hasPermission("ADMIN", "users.manage")).toBe(true);
    expect(hasPermission("ADMIN", "jobs.manage")).toBe(true);
    expect(hasPermission("ADMIN", "payments.refund")).toBe(false);
  });

  it("should grant support permissions only to SUPPORT role", () => {
    expect(hasPermission("SUPPORT", "users.read")).toBe(true);
    expect(hasPermission("SUPPORT", "jobs.manage")).toBe(true);
    expect(hasPermission("SUPPORT", "users.manage")).toBe(false);
  });

  it("should grant finance permissions only to FINANCE role", () => {
    expect(hasPermission("FINANCE", "payments.refund")).toBe(true);
    expect(hasPermission("FINANCE", "users.manage")).toBe(false);
    expect(hasPermission("FINANCE", "features.manage")).toBe(false);
  });

  it("should grant developer permissions only to DEVELOPER role", () => {
    expect(hasPermission("DEVELOPER", "health.read")).toBe(true);
    expect(hasPermission("DEVELOPER", "jobs.manage")).toBe(true);
    expect(hasPermission("DEVELOPER", "users.manage")).toBe(false);
  });

  it("should deny all admin permissions to regular USER role", () => {
    const userRole: AdminRole = "USER";
    expect(hasPermission(userRole, "users.read")).toBe(false);
    expect(hasPermission(userRole, "jobs.manage")).toBe(false);
    expect(hasPermission(userRole, "analytics.read")).toBe(false);
  });

  it("should evaluate feature flag default values gracefully", async () => {
    const isEnabled = await FeatureFlagService.isFeatureEnabled({
      featureKey: "non_existent_flag_key",
      userId: "user_123",
    });
    expect(isEnabled).toBe(false);
  });
});
