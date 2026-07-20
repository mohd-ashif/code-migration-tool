import { WorkspaceService } from "../workspace.service";
import { WorkspaceRepository } from "../../repositories/workspace.repository";
import { MemberRepository } from "../../repositories/member.repository";
import { ActivityRepository } from "../../repositories/activity.repository";
import { HttpError } from "../../middleware/error.middleware";

jest.mock("../../repositories/workspace.repository");
jest.mock("../../repositories/member.repository");
jest.mock("../../repositories/activity.repository");

describe("WorkspaceService Unit Tests", () => {
  let workspaceService: WorkspaceService;

  beforeEach(() => {
    jest.clearAllMocks();
    workspaceService = new WorkspaceService();
  });

  describe("createWorkspace", () => {
    it("should successfully create workspace, assign owner and log activity", async () => {
      const mockWorkspace = {
        id: "ws-123",
        name: "Acme Corp",
        slug: "acme-corp",
        ownerId: "user-owner",
        planId: "free",
        storageLimit: 104857600,
        status: "active",
      };

      (WorkspaceRepository.prototype.findBySlug as jest.Mock).mockResolvedValueOnce(null);
      (WorkspaceRepository.prototype.create as jest.Mock).mockResolvedValueOnce(mockWorkspace);
      (MemberRepository.prototype.addMember as jest.Mock).mockResolvedValueOnce({});
      (ActivityRepository.prototype.log as jest.Mock).mockResolvedValueOnce({});

      const ws = await workspaceService.createWorkspace("Acme Corp", "user-owner");

      expect(WorkspaceRepository.prototype.findBySlug).toHaveBeenCalledWith("acme-corp");
      expect(WorkspaceRepository.prototype.create).toHaveBeenCalledWith({
        name: "Acme Corp",
        slug: "acme-corp",
        ownerId: "user-owner",
        description: undefined,
        logoUrl: undefined,
        planId: "free",
        storageLimit: 104857600,
      });
      expect(MemberRepository.prototype.addMember).toHaveBeenCalledWith("ws-123", "user-owner", "owner");
      expect(ActivityRepository.prototype.log).toHaveBeenCalledWith(
        "ws-123",
        "user-owner",
        "workspace_created",
        { name: "Acme Corp", slug: "acme-corp" }
      );
      expect(ws).toEqual(mockWorkspace);
    });

    it("should generate a unique slug with suffix if slug is already taken", async () => {
      const mockWorkspace = {
        id: "ws-123",
        name: "Acme Corp",
        slug: "acme-corp-xyz",
        ownerId: "user-owner",
      };

      (WorkspaceRepository.prototype.findBySlug as jest.Mock)
        .mockResolvedValueOnce({ id: "ws-old" }) // first try matches existing
        .mockResolvedValueOnce(null);            // second try is unique

      (WorkspaceRepository.prototype.create as jest.Mock).mockResolvedValueOnce(mockWorkspace);

      const spyGenerateSlug = jest.spyOn(workspaceService as any, "generateSlug");

      await workspaceService.createWorkspace("Acme Corp", "user-owner");

      expect(spyGenerateSlug).toHaveBeenCalled();
      expect(WorkspaceRepository.prototype.create).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: expect.stringMatching(/^acme-corp-[a-z0-9]{4}$/),
        })
      );
    });

    it("should throw a bad request error if workspace name is too short", async () => {
      await expect(
        workspaceService.createWorkspace("Ab", "user-owner")
      ).rejects.toThrow(new HttpError(400, "Workspace name must be between 3 and 100 characters."));
    });

    it("should throw a bad request error if workspace name is too long", async () => {
      const longName = "a".repeat(101);
      await expect(
        workspaceService.createWorkspace(longName, "user-owner")
      ).rejects.toThrow(new HttpError(400, "Workspace name must be between 3 and 100 characters."));
    });
  });

  describe("getWorkspaceDetails", () => {
    it("should return workspace details when found", async () => {
      const mockWorkspace = { id: "ws-123", name: "Workspace" };
      (WorkspaceRepository.prototype.findById as jest.Mock).mockResolvedValueOnce(mockWorkspace);

      const res = await workspaceService.getWorkspaceDetails("ws-123");
      expect(res).toEqual(mockWorkspace);
    });

    it("should throw not found error when workspace does not exist", async () => {
      (WorkspaceRepository.prototype.findById as jest.Mock).mockResolvedValueOnce(null);

      await expect(workspaceService.getWorkspaceDetails("ws-notfound")).rejects.toThrow(
        new HttpError(404, "Workspace not found.")
      );
    });
  });

  describe("updateWorkspaceSettings", () => {
    it("should update and log activity on valid settings changes", async () => {
      const updatedWorkspace = { id: "ws-123", name: "New Name", slug: "new-name" };
      (WorkspaceRepository.prototype.findBySlug as jest.Mock).mockResolvedValueOnce(null);
      (WorkspaceRepository.prototype.update as jest.Mock).mockResolvedValueOnce(updatedWorkspace);

      const updates = { name: "New Name", slug: "new-name" };
      const res = await workspaceService.updateWorkspaceSettings("ws-123", "user-owner", updates);

      expect(WorkspaceRepository.prototype.update).toHaveBeenCalledWith("ws-123", updates);
      expect(ActivityRepository.prototype.log).toHaveBeenCalledWith(
        "ws-123",
        "user-owner",
        "settings_changed",
        updates
      );
      expect(res).toEqual(updatedWorkspace);
    });

    it("should check slug uniqueness if slug is changed", async () => {
      (WorkspaceRepository.prototype.findBySlug as jest.Mock).mockResolvedValueOnce({ id: "ws-another" });

      await expect(
        workspaceService.updateWorkspaceSettings("ws-123", "user-owner", { slug: "taken-slug" })
      ).rejects.toThrow(new HttpError(409, "Workspace slug is already in use."));
    });

    it("should allow same slug for the same workspace during updating", async () => {
      const updatedWorkspace = { id: "ws-123", slug: "same-slug" };
      (WorkspaceRepository.prototype.findBySlug as jest.Mock).mockResolvedValueOnce({ id: "ws-123" });
      (WorkspaceRepository.prototype.update as jest.Mock).mockResolvedValueOnce(updatedWorkspace);

      const res = await workspaceService.updateWorkspaceSettings("ws-123", "user-owner", { slug: "same-slug" });
      expect(res).toEqual(updatedWorkspace);
    });

    it("should throw validation error on invalid name during update", async () => {
      await expect(
        workspaceService.updateWorkspaceSettings("ws-123", "user-owner", { name: "a" })
      ).rejects.toThrow(new HttpError(400, "Workspace name must be between 3 and 100 characters."));
    });
  });

  describe("deleteWorkspace", () => {
    it("should successfully delete workspace when user is owner", async () => {
      const mockWorkspace = { id: "ws-123", name: "Acme", ownerId: "user-owner" };
      (WorkspaceRepository.prototype.findById as jest.Mock).mockResolvedValueOnce(mockWorkspace);
      (WorkspaceRepository.prototype.delete as jest.Mock).mockResolvedValueOnce(undefined);
      (ActivityRepository.prototype.log as jest.Mock).mockResolvedValueOnce({});

      await workspaceService.deleteWorkspace("ws-123", "user-owner");

      expect(WorkspaceRepository.prototype.delete).toHaveBeenCalledWith("ws-123");
      expect(ActivityRepository.prototype.log).toHaveBeenCalledWith(
        "ws-123",
        "user-owner",
        "workspace_deleted",
        { name: "Acme" }
      );
    });

    it("should throw access denied error when user is not the owner", async () => {
      const mockWorkspace = { id: "ws-123", ownerId: "user-owner" };
      (WorkspaceRepository.prototype.findById as jest.Mock).mockResolvedValueOnce(mockWorkspace);

      await expect(
        workspaceService.deleteWorkspace("ws-123", "user-malicious")
      ).rejects.toThrow(new HttpError(403, "Only the workspace owner can delete the workspace."));
    });
  });

  describe("transferOwnership", () => {
    it("should transfer ownership, demote current owner to admin, promote target to owner, and log activity", async () => {
      const mockWorkspace = { id: "ws-123", ownerId: "user-owner" };
      (WorkspaceRepository.prototype.findById as jest.Mock).mockResolvedValueOnce(mockWorkspace);
      (MemberRepository.prototype.findMember as jest.Mock).mockResolvedValueOnce({ role: "admin" });
      (WorkspaceRepository.prototype.update as jest.Mock).mockResolvedValueOnce({});
      (MemberRepository.prototype.updateRole as jest.Mock).mockResolvedValue({});
      (ActivityRepository.prototype.log as jest.Mock).mockResolvedValue({});

      await workspaceService.transferOwnership("ws-123", "user-owner", "user-new-owner");

      expect(WorkspaceRepository.prototype.update).toHaveBeenCalledWith("ws-123", { ownerId: "user-new-owner" });
      expect(MemberRepository.prototype.updateRole).toHaveBeenNthCalledWith(1, "ws-123", "user-new-owner", "owner");
      expect(MemberRepository.prototype.updateRole).toHaveBeenNthCalledWith(2, "ws-123", "user-owner", "admin");
      expect(ActivityRepository.prototype.log).toHaveBeenCalledWith(
        "ws-123",
        "user-owner",
        "role_changed",
        {
          action: "ownership_transfer",
          newOwnerId: "user-new-owner",
          oldOwnerId: "user-owner",
        }
      );
    });

    it("should throw error if actor is not the current owner", async () => {
      const mockWorkspace = { id: "ws-123", ownerId: "user-owner" };
      (WorkspaceRepository.prototype.findById as jest.Mock).mockResolvedValueOnce(mockWorkspace);

      await expect(
        workspaceService.transferOwnership("ws-123", "user-malicious", "user-target")
      ).rejects.toThrow(new HttpError(403, "Only the workspace owner can transfer ownership."));
    });

    it("should throw error if target user is not a member of the workspace", async () => {
      const mockWorkspace = { id: "ws-123", ownerId: "user-owner" };
      (WorkspaceRepository.prototype.findById as jest.Mock).mockResolvedValueOnce(mockWorkspace);
      (MemberRepository.prototype.findMember as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        workspaceService.transferOwnership("ws-123", "user-owner", "user-nonmember")
      ).rejects.toThrow(new HttpError(404, "Target user is not a member of the workspace."));
    });
  });
});
