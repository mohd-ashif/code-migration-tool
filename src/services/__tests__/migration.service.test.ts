import { migrateProject } from "../migration.service";
import { runCodemod } from "../codemod.service";
import { queryDatabase } from "../../lib/database";
import { EngineRepository } from "../../repositories/EngineRepository";

jest.mock("../codemod.service");
jest.mock("../../lib/database");
jest.mock("../../repositories/EngineRepository");

describe("migration.service Core Integration Pipeline Tests", () => {
  const mockRunCodemod = runCodemod as jest.MockedFunction<typeof runCodemod>;
  const mockQueryDatabase = queryDatabase as jest.MockedFunction<typeof queryDatabase>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should throw error if migration route is not supported", async () => {
    // Mock route query returning unsupported
    mockQueryDatabase.mockResolvedValueOnce([]); // Route query: unsupported

    const req: any = {
      jobId: "test-job",
      sourceFramework: "react",
      targetFramework: "vue",
      projectFiles: [{ path: "src/App.jsx", content: "export default () => {}" }],
    };

    await expect(migrateProject(req)).rejects.toThrow(
      "Migration route from react to vue is not supported or active."
    );
  });

  it("should throw error if file size exceeds settings max_file_size", async () => {
    // 1. Route check passes
    mockQueryDatabase.mockResolvedValueOnce([{ supported: true }]);
    // 2. Settings check return max file size of 1 KB
    mockQueryDatabase.mockResolvedValueOnce([{ max_file_size: 1, timeout: 30, engine_id: "eng-1" }]);

    const req: any = {
      jobId: "test-job",
      sourceFramework: "react",
      targetFramework: "next",
      // Content length > 1024 bytes (1 KB)
      projectFiles: [{ path: "src/App.jsx", content: "A".repeat(1500) }],
    };

    await expect(migrateProject(req)).rejects.toThrow(
      "exceeds the maximum allowed size of 1 KB"
    );
  });

  it("should enforce compile timeout and abort execution", async () => {
    // 1. Route check passes
    mockQueryDatabase.mockResolvedValueOnce([{ supported: true }]);
    // 2. Settings check return timeout of 1 second
    mockQueryDatabase.mockResolvedValueOnce([{ max_file_size: 100, timeout: 1, engine_id: "eng-1" }]);

    // Delay runCodemod execution to trigger timeout
    mockRunCodemod.mockImplementation(
      async (files, src, tgt, onProgress, signal) => {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            resolve([]);
          }, 3000);
          if (signal) {
            signal.addEventListener("abort", () => {
              clearTimeout(timeout);
              reject(new Error("Job aborted"));
            });
          }
        });
      }
    );

    const req: any = {
      jobId: "test-job",
      sourceFramework: "react",
      targetFramework: "next",
      projectFiles: [{ path: "src/App.jsx", content: "export default () => {}" }],
    };

    await expect(migrateProject(req)).rejects.toThrow(
      "Migration compilation timed out after 1 seconds."
    );
  });

  it("should successfully compile, increment migrations run count, and log telemetry", async () => {
    // 1. Route check passes
    mockQueryDatabase.mockResolvedValueOnce([{ supported: true }]);
    // 2. Settings check return valid config
    mockQueryDatabase.mockResolvedValueOnce([{ max_file_size: 100, timeout: 30, engine_id: "eng-1" }]);
    
    // Mock runCodemod output
    const outputFiles = [{ path: "src/App.tsx", content: "compiled content" }];
    mockRunCodemod.mockResolvedValueOnce(outputFiles);

    const req: any = {
      jobId: "test-job",
      sourceFramework: "react",
      targetFramework: "next",
      projectFiles: [{ path: "src/App.jsx", content: "export default () => {}" }],
    };

    const result = await migrateProject(req);

    expect(result.success).toBe(true);
    expect(result.migratedFiles).toEqual(outputFiles);

    // Verify stats were incremented on active engine
    expect(EngineRepository.prototype.incrementMigrationsRun).toHaveBeenCalledWith("eng-1", expect.any(Number));

    // Verify telemetry logs were written to DB
    expect(mockQueryDatabase).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO migration_logs"),
      expect.arrayContaining(["INFO"])
    );
  });
});
