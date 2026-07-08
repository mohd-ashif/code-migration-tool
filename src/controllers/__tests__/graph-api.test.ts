// @ts-nocheck
import { handleGetGraph } from "../graph.controller";
import { getJobResult } from "../../services/job.service";

// Mock the job service
jest.mock("../../services/job.service", () => ({
  getJobResult: jest.fn(),
}));

describe("Graph API Controller", () => {
  let mockRequest: any;
  let mockResponse: any;
  let nextFunction: any;

  beforeEach(() => {
    jest.clearAllMocks();
    nextFunction = jest.fn();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  it("should fail if jobId query parameter is missing", async () => {
    mockRequest = { query: {} };
    await handleGetGraph(mockRequest, mockResponse, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: "jobId query param is required." })
    );
  });

  it("should return 404 if job result is not found or has no files", async () => {
    mockRequest = { query: { jobId: "job-123" } };
    (getJobResult as jest.Mock).mockResolvedValue(null);

    await handleGetGraph(mockRequest, mockResponse, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(404);
  });

  it("should compile and return a paginated graph containing nodes, edges, cycle status, and dead components", async () => {
    mockRequest = {
      query: {
        jobId: "job-123",
        page: "1",
        limit: "10",
      },
    };

    // Mock files containing circular dependencies:
    // Page.tsx -> Button.tsx -> utils.ts -> Page.tsx
    // Also, Unused.tsx which is never imported
    const mockFiles = [
      {
        path: "Page.tsx",
        content: `
          import { Button } from './Button';
          export function Page() {
            return <Button />;
          }
        `,
      },
      {
        path: "Button.tsx",
        content: `
          import { helper } from './utils';
          export function Button() {
            helper();
            return <button>Click</button>;
          }
        `,
      },
      {
        path: "utils.ts",
        content: `
          import { Page } from './Page'; // Circular dependency loop!
          export function helper() {
            console.log('helper');
          }
        `,
      },
      {
        path: "Unused.tsx", // Dead code!
        content: `
          export function Unused() {
            return <div>Unused</div>;
          }
        `,
      },
    ];

    (getJobResult as jest.Mock).mockResolvedValue({
      id: "job-123",
      status: "completed",
      result: {
        targetFramework: "react",
        migratedFiles: mockFiles,
      },
    });

    await handleGetGraph(mockRequest, mockResponse, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(200);

    const responseBody = mockResponse.json.mock.calls[0][0];
    expect(responseBody.success).toBe(true);
    expect(responseBody.nodes.length).toBeGreaterThan(0);
    expect(responseBody.edges.length).toBeGreaterThan(0);

    // Verify circular dependency cycle detection flags
    const pageNode = responseBody.nodes.find((n) => n.label === "Page");
    const buttonNode = responseBody.nodes.find((n) => n.label === "Button");
    const helperNode = responseBody.nodes.find((n) => n.label === "helper");
    const unusedNode = responseBody.nodes.find((n) => n.label === "Unused");

    expect(pageNode?.isCircular).toBe(true);
    expect(buttonNode?.isCircular).toBe(true);
    expect(helperNode?.isCircular).toBe(true);

    // Verify unused components / dead code checks
    expect(unusedNode?.isUnused).toBe(true);
    expect(pageNode?.isUnused).toBe(false); // main entry / referenced

    // Verify pagination totals
    expect(responseBody.pagination.totalNodes).toBe(4);
    expect(responseBody.pagination.page).toBe(1);
    expect(responseBody.summary.circularCount).toBeGreaterThan(0);
    expect(responseBody.summary.unusedCount).toBe(1);
  });
});
