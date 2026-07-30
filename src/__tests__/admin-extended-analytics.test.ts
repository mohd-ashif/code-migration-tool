import { hasPermission } from "../middleware/admin-auth.middleware";

describe("Phase 10 Extended Enterprise Admin Analytics Tests", () => {
  it("should enforce RBAC authorization for Usage, AI Cost Center, Quality, and Failures", () => {
    expect(hasPermission("SUPER_ADMIN", "analytics.read")).toBe(true);
    expect(hasPermission("ADMIN", "analytics.read")).toBe(true);
    expect(hasPermission("FINANCE", "analytics.read")).toBe(true);
    expect(hasPermission("DEVELOPER", "analytics.read")).toBe(false);

    expect(hasPermission("SUPER_ADMIN", "reports.read")).toBe(true);
    expect(hasPermission("SUPER_ADMIN", "jobs.read")).toBe(true);
    expect(hasPermission("SUPER_ADMIN", "jobs.manage")).toBe(true);
  });
});
