import { ParsedFile } from "../types/parser.types";
import { DiagnosticEngine } from "../diagnostics/diagnostic-engine";
import { callOpenAI } from "../lib/openai";
import * as path from "path";
import * as fs from "fs";
import { execSync } from "child_process";
import { config } from "../config";
import { logger } from "../utils/logger";

/**
 * Runs a real npm install and npm build loop inside the temporary folder to capture compiler errors.
 */
function runBuildDiagnostics(scratchDir: string): any[] {
  const buildDiagnostics: any[] = [];
  
  try {
    // 1. Run npm install inside sandbox
    execSync("npm install --no-audit --no-fund", { cwd: scratchDir, stdio: "ignore" });
  } catch (e) {
    // Ignore install errors to proceed to compiler check
  }

  try {
    // 2. Try building the project
    execSync("npm run build", { cwd: scratchDir, stdio: "pipe", encoding: "utf8" });
  } catch (err: any) {
    const output = (err.stdout || "") + "\n" + (err.stderr || "");
    const lines = output.split("\n");
    
    lines.forEach((line) => {
      if (line.includes("error TS")) {
        const parenOpen = line.indexOf("(");
        const parenClose = line.indexOf(")");
        const colonAfter = line.indexOf(":", parenClose);
        
        if (parenOpen !== -1 && parenClose !== -1 && colonAfter !== -1) {
          const relPath = line.substring(0, parenOpen).trim();
          const posStr = line.substring(parenOpen + 1, parenClose);
          const posParts = posStr.split(",");
          const lineNum = Number(posParts[0]) || 1;
          const colNum = Number(posParts[1]) || 1;
          
          const rest = line.substring(colonAfter + 1).trim();
          const tsCodeIndex = rest.indexOf("TS");
          let code = "TS_ERROR";
          if (tsCodeIndex !== -1) {
            // Extracts error number e.g. TS2307
            const endSpace = rest.indexOf(" ", tsCodeIndex);
            code = "TS" + (endSpace !== -1 ? rest.substring(tsCodeIndex + 2, endSpace) : rest.substring(tsCodeIndex + 2)).trim();
          }
          const message = rest.substring(rest.indexOf(":") + 1).trim();

          buildDiagnostics.push({
            code,
            severity: "error",
            category: "typescript",
            message,
            location: {
              sourceFile: path.resolve(scratchDir, relPath),
              line: lineNum,
              character: colNum,
            },
            suggestedRepair: "Fix compilation issue in file.",
            relatedFiles: [path.resolve(scratchDir, relPath)],
          });
        }
      }
    });
  }
  return buildDiagnostics;
}

/**
 * Iteratively runs validation and applies automated AI repairs for compiler errors,
 * package mismatch issues, JSX warnings, and framework violations.
 */
export async function autoRepairProject(
  files: ParsedFile[],
  signal?: AbortSignal
): Promise<{ files: ParsedFile[]; fixedIssues: string[] }> {
  const fixedIssues: string[] = [];
  
  if (!config.OPENAI_API_KEY) {
    logger.info("OPENAI_API_KEY is not set. Skipping AI auto-repair phase.");
    return { files, fixedIssues };
  }

  let currentFiles = files.map((f) => ({ ...f }));

  const maxAttempts = 3;
  let attempts = 0;
  let hasErrors = true;

  while (hasErrors && attempts < maxAttempts) {
    if (signal?.aborted) {
      throw new Error("Job aborted");
    }
    attempts++;

    // Create a unique temporary directory for this sandbox compilation pass
    const scratchDir = path.join(__dirname, "..", "..", "scratch", `repair-sandbox-${Date.now()}`);

    try {
      // 1. Sandbox: Write current state files to temp disk
      if (!fs.existsSync(scratchDir)) {
        fs.mkdirSync(scratchDir, { recursive: true });
      }
      currentFiles.forEach((f) => {
        const fullPath = path.join(scratchDir, f.path);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, f.content, "utf8");
      });

      // 2. Diagnostics: Run static checks and compiler analysis
      const diagnostics = [
        ...DiagnosticEngine.analyze(scratchDir),
        ...runBuildDiagnostics(scratchDir)
      ];
      const errors = diagnostics.filter((d) => d.severity === "error");

      if (errors.length === 0) {
        hasErrors = false;
        break; // BUILD SUCCESS!
      }

      // Group diagnostics by relative file path to allow focused AI fixes
      const fileErrorsMap = new Map<string, typeof errors>();
      errors.forEach((err) => {
        if (err.location) {
          const absolutePath = err.location.sourceFile;
          const relativePath = path.relative(scratchDir, absolutePath).replace(/\\/g, "/");
          const existingFile = currentFiles.find((f) => f.path === relativePath);
          if (existingFile) {
            const list = fileErrorsMap.get(relativePath) || [];
            list.push(err);
            fileErrorsMap.set(relativePath, list);
          }
        }
      });

      if (fileErrorsMap.size === 0 && errors.length > 0) {
        // Global compilation issue that couldn't be bound to local files, break loop
        break;
      }

      // 3. AI: Query patches for each file containing errors
      for (const [relPath, fileErrors] of fileErrorsMap.entries()) {
        const fileNode = currentFiles.find((f) => f.path === relPath);
        if (!fileNode) continue;

        const formattedDiags = fileErrors
          .map(
            (d) =>
              `- Line ${d.location?.line || "Global"}:${d.location?.character || ""}: [${
                d.category
              }] Code ${d.code} - ${d.message} (Suggested Fix: ${d.suggestedRepair || "None"})`
          )
          .join("\n");

        const systemPrompt = `You are a Senior Compiler Developer. You fix TypeScript, React, Vue, Angular, and JSX compilation errors. Your task is to inspect the source code, review the compiler diagnostic errors, and generate the corrected file. You MUST output ONLY the corrected source code. Do not wrap the code in markdown formatting (like \`\`\`typescript), and do not include conversational text or explanation.`;

        const userPrompt = `File Path: ${relPath}\n\nCompiler Diagnostics:\n${formattedDiags}\n\nOriginal Source Code:\n${fileNode.content}`;

        const repairedCode = await callOpenAI(userPrompt, systemPrompt);

        if (repairedCode && repairedCode.trim()) {
          // Strip LLM markdown tags if present
          let cleanCode = repairedCode.trim();
          cleanCode = cleanCode.replace(/^```[a-zA-Z]*\n/, "");
          cleanCode = cleanCode.replace(/\n```$/, "");

          fileNode.content = cleanCode;
          fixedIssues.push(`Healed compiler errors in "${relPath}" using AI self-healing patching.`);
        }
      }
    } catch (error: any) {
      fixedIssues.push(`Auto-repair validation exception: ${error.message}`);
      break;
    } finally {
      // Sandbox Cleanup
      try {
        if (fs.existsSync(scratchDir)) {
          fs.rmSync(scratchDir, { recursive: true, force: true });
        }
      } catch (e) {
        // Ignore cleanup issues
      }
    }
  }

  return { files: currentFiles, fixedIssues };
}
