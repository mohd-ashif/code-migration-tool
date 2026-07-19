import { FrameworkService } from "../FrameworkService";
import { FrameworkRepository } from "../../repositories/FrameworkRepository";
import { EngineRepository } from "../../repositories/EngineRepository";

jest.mock("../../repositories/FrameworkRepository");
jest.mock("../../repositories/EngineRepository");

describe("FrameworkService Unit Tests", () => {
  let service: FrameworkService;
  let mockFrameworkRepo: jest.Mocked<FrameworkRepository>;
  let mockEngineRepo: jest.Mocked<EngineRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    FrameworkService.invalidateCaches(); // reset service cache between tests
    service = new FrameworkService();
    mockFrameworkRepo = service["frameworkRepo"] as any;
    mockEngineRepo = service["engineRepo"] as any;
  });

  describe("getFrameworks caching behavior", () => {
    it("should fetch frameworks from repository on first call and subsequent calls should hit cache", async () => {
      const mockFrameworks = [{
        id: "fw-1",
        name: "React",
        slug: "react",
        displayName: "React",
        logo: "react",
        category: "ui-library",
        currentVersion: "18",
        description: null,
        documentationUrl: null,
        homepageUrl: null,
        status: "active" as any,
        createdAt: "",
        updatedAt: ""
      }];
      mockFrameworkRepo.findAll.mockResolvedValueOnce(mockFrameworks);

      const res1 = await service.getFrameworks();
      const res2 = await service.getFrameworks();

      expect(mockFrameworkRepo.findAll).toHaveBeenCalledTimes(1);
      expect(res1).toEqual(mockFrameworks);
      expect(res2).toEqual(mockFrameworks);
    });

    it("should bypass cache if bypassCache parameter is true", async () => {
      mockFrameworkRepo.findAll.mockResolvedValue([]);

      await service.getFrameworks();
      await service.getFrameworks(true);

      expect(mockFrameworkRepo.findAll).toHaveBeenCalledTimes(2);
    });
  });

  describe("getMigrationMatrix caching behavior", () => {
    it("should fetch matrix from repository on first call and subsequent calls should hit cache", async () => {
      const mockMatrix = [{ id: "1", source: "react", sourceName: "React", target: "vue", targetName: "Vue", supported: true, qualityScore: 90, stability: "stable" as any, estimatedSuccessRate: 90.0 }];
      mockFrameworkRepo.findMigrationMatrix.mockResolvedValueOnce(mockMatrix);

      const res1 = await service.getMigrationMatrix();
      const res2 = await service.getMigrationMatrix();

      expect(mockFrameworkRepo.findMigrationMatrix).toHaveBeenCalledTimes(1);
      expect(res1).toEqual(mockMatrix);
      expect(res2).toEqual(mockMatrix);
    });

    it("should bypass matrix cache if bypassCache is true", async () => {
      mockFrameworkRepo.findMigrationMatrix.mockResolvedValue([]);

      await service.getMigrationMatrix();
      await service.getMigrationMatrix(true);

      expect(mockFrameworkRepo.findMigrationMatrix).toHaveBeenCalledTimes(2);
    });
  });

  describe("getCompilerHealth", () => {
    it("should return formatted compiler health object", async () => {
      const mockHealthStats = {
        engines: 5,
        healthy: 4,
        warnings: 1,
        failed: 0,
        experimental: 0,
        totalMigrationsRun: 1500,
        avgDurationMs: 4500,
      };
      mockEngineRepo.getCompilerHealth.mockResolvedValueOnce(mockHealthStats);

      const health = await service.getCompilerHealth();

      expect(mockEngineRepo.getCompilerHealth).toHaveBeenCalledTimes(1);
      expect(health.engines).toBe(5);
      expect(health.healthy).toBe(4);
      expect(health.warnings).toBe(1);
      expect(health.totalMigrationsRun).toBe(1500);
      expect(health.avgDurationMs).toBe(4500);
      expect(health.lastChecked).toBeDefined();
    });
  });
});
