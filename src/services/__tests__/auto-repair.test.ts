// @ts-nocheck
import { autoRepairProject } from "../auto-repair.service";
import { callOpenAI } from "../../lib/openai";

// Mock the OpenAI connector to control AI patches during tests
jest.mock("../../lib/openai", () => ({
  callOpenAI: jest.fn(),
}));

describe("AutoRepairService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should complete immediately if there are no compilation errors", async () => {
    const validFiles = [
      {
        path: "index.ts",
        content: "export const x = 42;\n",
      },
    ];

    const result = await autoRepairProject(validFiles);

    expect(result.files).toEqual(validFiles);
    expect(result.fixedIssues.length).toBe(0);
    expect(callOpenAI).not.toHaveBeenCalled();
  });

  it("should invoke the AI healing loop when compilation errors are found and apply patches", async () => {
    const brokenFiles = [
      {
        path: "index.ts",
        content: "const x = ;\nexport { x };",
      },
    ];

    // Mock OpenAI to return corrected code
    (callOpenAI as jest.Mock).mockResolvedValueOnce("const x = 42;\nexport { x };");

    const result = await autoRepairProject(brokenFiles);

    // Verify OpenAI was called with correct context
    expect(callOpenAI).toHaveBeenCalledTimes(1);
    expect(callOpenAI).toHaveBeenCalledWith(
      expect.stringContaining("Original Source Code:"),
      expect.stringContaining("You are a Senior Compiler Developer.")
    );

    // Verify the file was patched with the AI response
    expect(result.files[0].content).toBe("const x = 42;\nexport { x };");
    expect(result.fixedIssues.length).toBe(1);
    expect(result.fixedIssues[0]).toContain("Healed compiler errors in \"index.ts\"");
  });

  it("should stop querying AI and complete if max attempts is reached without success", async () => {
    const brokenFiles = [
      {
        path: "index.ts",
        content: "const x = ;\nexport { x };",
      },
    ];

    // Mock OpenAI to return still-broken code
    (callOpenAI as jest.Mock).mockResolvedValue("const x = ;\nexport { x };");

    const result = await autoRepairProject(brokenFiles);

    // Should loop max 3 times
    expect(callOpenAI).toHaveBeenCalledTimes(3);
    expect(result.fixedIssues.length).toBe(3);
  });
});
