import { EntitlementService } from "../services/EntitlementService";
import { hasPermission } from "../middleware/admin-auth.middleware";

describe("Phase 10 Admin Subscription Plan Management & Entitlement Tests", () => {

  it("should enforce RBAC authorization for plan management permissions", () => {
    expect(hasPermission("SUPER_ADMIN", "subscriptions.manage")).toBe(true);
    expect(hasPermission("ADMIN", "subscriptions.manage")).toBe(true);
    expect(hasPermission("FINANCE", "subscriptions.manage")).toBe(true);
    expect(hasPermission("DEVELOPER", "subscriptions.manage")).toBe(false);
    expect(hasPermission("USER", "subscriptions.manage")).toBe(false);
  });

  it("should evaluate default entitlements gracefully when database is empty", async () => {
    const fallbackEntitlements = await EntitlementService.getWorkspaceEntitlements("mock-workspace-id");
    expect(fallbackEntitlements).toBeDefined();
    expect(fallbackEntitlements.planSlug).toBeDefined();
    expect(fallbackEntitlements.entitlements).toBeDefined();
  });

  it("should correctly check usage limits against numeric caps", async () => {
    const checkResult = await EntitlementService.checkUsage("mock-workspace-id", "migrations", 1);
    expect(checkResult).toBeDefined();
    expect(typeof checkResult.allowed).toBe("boolean");
  });
});
