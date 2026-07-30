import { hasPermission } from "../middleware/admin-auth.middleware";

describe("Phase 10 Admin Billing Operations & Coupon Unit Tests", () => {
  it("should enforce RBAC authorization for financial mutations and refund permissions", () => {
    expect(hasPermission("SUPER_ADMIN", "payments.refund")).toBe(true);
    expect(hasPermission("FINANCE", "payments.refund")).toBe(true);
    expect(hasPermission("ADMIN", "payments.refund")).toBe(false);
    expect(hasPermission("DEVELOPER", "payments.refund")).toBe(false);

    expect(hasPermission("SUPER_ADMIN", "subscriptions.manage")).toBe(true);
    expect(hasPermission("ADMIN", "subscriptions.manage")).toBe(true);
    expect(hasPermission("SUPPORT", "subscriptions.manage")).toBe(false);
  });
});
