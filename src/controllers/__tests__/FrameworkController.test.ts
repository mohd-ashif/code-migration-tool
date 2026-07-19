import { FrameworkController } from "../FrameworkController";
import { FrameworkService } from "../../services/FrameworkService";

jest.mock("../../services/FrameworkService");

describe("FrameworkController Unit Tests", () => {
  let controller: FrameworkController;
  let req: any;
  let res: any;
  let next: any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new FrameworkController();
    req = {
      query: {},
      params: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
  });

  describe("getFrameworks", () => {
    it("should return frameworks list", async () => {
      const mockFrameworks = [{ id: "1", name: "React", slug: "react", status: "active" }];
      (FrameworkService.prototype.getFrameworks as jest.Mock).mockResolvedValueOnce(mockFrameworks);

      await controller.getFrameworks(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockFrameworks,
      });
    });

    it("should bypass cache if refresh query param is true", async () => {
      req.query.refresh = "true";
      (FrameworkService.prototype.getFrameworks as jest.Mock).mockResolvedValueOnce([]);

      await controller.getFrameworks(req, res, next);

      expect(FrameworkService.prototype.getFrameworks).toHaveBeenCalledWith(true);
    });

    it("should forward errors to next middleware", async () => {
      const error = new Error("Database error");
      (FrameworkService.prototype.getFrameworks as jest.Mock).mockRejectedValueOnce(error);

      await controller.getFrameworks(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe("getFrameworkById", () => {
    it("should return framework details if found", async () => {
      req.params.id = "fw-123";
      const mockDetail = { framework: { id: "fw-123", name: "React" } };
      (FrameworkService.prototype.getFrameworkDetail as jest.Mock).mockResolvedValueOnce(mockDetail);

      await controller.getFrameworkById(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockDetail,
      });
    });

    it("should return 404 if framework is not found", async () => {
      req.params.id = "fw-999";
      (FrameworkService.prototype.getFrameworkDetail as jest.Mock).mockResolvedValueOnce(null);

      await controller.getFrameworkById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Framework with ID fw-999 not found",
      });
    });
  });

  describe("getMigrationMatrix", () => {
    it("should return migration matrix", async () => {
      const mockMatrix = [{ source: "react", target: "vue", supported: true }];
      (FrameworkService.prototype.getMigrationMatrix as jest.Mock).mockResolvedValueOnce(mockMatrix);

      await controller.getMigrationMatrix(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockMatrix,
      });
    });
  });

  describe("getCompilerHealth", () => {
    it("should return aggregated compiler health statistics", async () => {
      const mockHealth = { engines: 10, healthy: 8, warnings: 2 };
      (FrameworkService.prototype.getCompilerHealth as jest.Mock).mockResolvedValueOnce(mockHealth);

      await controller.getCompilerHealth(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockHealth,
      });
    });
  });
});
