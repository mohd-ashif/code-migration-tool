import { hasPermission } from "../middleware/admin-auth.middleware";

describe("Phase 10 Admin 360° Profile & Multi-Tenant Diagnostic Tests", () => {
  it("should enforce RBAC authorization for User and Workspace 360 inspection", () => {
    expect(hasPermission("SUPER_ADMIN", "users.read")).toBe(true);
    expect(hasPermission("ADMIN", "users.read")).toBe(true);
    expect(hasPermission("SUPPORT", "users.read")).toBe(true);
    expect(hasPermission("DEVELOPER", "users.read")).toBe(false);

    expect(hasPermission("SUPER_ADMIN", "workspaces.read")).toBe(true);
    expect(hasPermission("ADMIN", "workspaces.read")).toBe(true);
    expect(hasPermission("SUPPORT", "workspaces.read")).toBe(true);
    expect(hasPermission("DEVELOPER", "workspaces.read")).toBe(false);
  });

  it("should enforce RBAC authorization for action operations", () => {
    expect(hasPermission("SUPER_ADMIN", "users.manage")).toBe(true);
    expect(hasPermission("ADMIN", "users.manage")).toBe(true);
    expect(hasPermission("SUPPORT", "users.manage")).toBe(false);

    expect(hasPermission("SUPER_ADMIN", "workspaces.manage")).toBe(true);
    expect(hasPermission("ADMIN", "workspaces.manage")).toBe(true);
    expect(hasPermission("SUPPORT", "workspaces.manage")).toBe(false);
  });
});
