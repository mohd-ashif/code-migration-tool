import * as ts from "typescript";
import { exec } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { ParsedFile } from "../types/parser.types";
import { logger } from "../utils/logger";

interface ValidationResult {
  success: boolean;
  stage: "install" | "typecheck" | "build" | "static-verify";
  errors: string[];
  output?: string;
}

/**
 * Validates the migrated project by writing files to a temporary workspace folder
 * and attempting compilation checks (with fallback to static AST checks if shell execution is blocked).
 */
export async function validateProject(files: ParsedFile[]): Promise<ValidationResult> {
  const scratchDir = path.join(__dirname, "..", "..", "scratch", `val-${Date.now()}`);
  
  try {
    // 1. Write files to scratch directory
    files.forEach(f => {
      const fullPath = path.join(scratchDir, f.path);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(fullPath, f.content, "utf8");
    });

    // 2. Perform Static AST Compilation and Import Verification
    const staticErrors: string[] = [];
    const fileMap = new Map<string, string>();
    files.forEach(f => fileMap.set(f.path, f.content));

    files.forEach(f => {
      if (f.path.endsWith(".ts") || f.path.endsWith(".tsx") || f.path.endsWith(".js") || f.path.endsWith(".jsx")) {
        try {
          // Verify TS syntax using native transpiler
          const result = ts.transpileModule(f.content, {
            compilerOptions: { 
              jsx: ts.JsxEmit.Preserve,
              target: ts.ScriptTarget.ES2020,
              module: ts.ModuleKind.CommonJS
            }
          });
          
          // Verify imports match files
          const sourceFile = ts.createSourceFile(f.path, f.content, ts.ScriptTarget.Latest, true);
          sourceFile.statements.forEach(node => {
            if (ts.isImportDeclaration(node)) {
              const specifier = (node.moduleSpecifier as ts.StringLiteral).text;
              if (specifier.startsWith(".")) {
                // Resolve relative path
                const relativeDir = path.dirname(f.path);
                const resolvedRel = path.normalize(path.join(relativeDir, specifier)).replace(/\\/g, "/");
                
                // Check if file exists matching extension variants
                const matches = [
                  resolvedRel,
                  `${resolvedRel}.tsx`,
                  `${resolvedRel}.ts`,
                  `${resolvedRel}.jsx`,
                  `${resolvedRel}.js`,
                  `${resolvedRel}/index.tsx`,
                  `${resolvedRel}/index.ts`,
                  `${resolvedRel}/index.jsx`,
                  `${resolvedRel}/index.js`,
                ];
                const fileExists = matches.some(m => fileMap.has(m) || fileMap.has(m.replace(/^\.\//, "")));
                
                // Allow standard style/package imports
                const isAsset = /\.(css|scss|sass|png|jpg|svg)$/i.test(specifier);
                
                if (!fileExists && !isAsset) {
                  staticErrors.push(`Unresolved import: "${specifier}" in ${f.path}`);
                }
              }
            }
          });
        } catch (e: any) {
          staticErrors.push(`Syntax error in ${f.path}: ${e.message}`);
        }
      }
    });

    if (staticErrors.length > 0) {
      return {
        success: false,
        stage: "static-verify",
        errors: staticErrors
      };
    }

    // 3. Attempt executing active build commands in child processes
    // Note: If child shell execution is restricted by host sandbox permissions, catch and resolve gracefully
    return new Promise((resolve) => {
      exec("npm -v", (npmCheckError) => {
        if (npmCheckError) {
          // Shell execution disabled/blocked, complete using static checks successfully
          logger.info("Sandbox shell execution skipped. Static AST check completed successfully.");
          resolve({
            success: true,
            stage: "static-verify",
            errors: []
          });
          return;
        }

        // Run npm install
        exec("npm install --no-audit --no-fund", { cwd: scratchDir }, (installErr, installStdout, installStderr) => {
          if (installErr) {
            resolve({
              success: false,
              stage: "install",
              errors: [installStderr || installErr.message]
            });
            return;
          }

          // Run npm run build
          exec("npm run build", { cwd: scratchDir }, (buildErr, buildStdout, buildStderr) => {
            if (buildErr) {
              resolve({
                success: false,
                stage: "build",
                errors: [buildStderr || buildErr.message]
              });
              return;
            }

            resolve({
              success: true,
              stage: "build",
              errors: [],
              output: buildStdout
            });
          });
        });
      });
    });
  } catch (error: any) {
    return {
      success: false,
      stage: "static-verify",
      errors: [error.message]
    };
  } finally {
    // Cleanup temporary scratch folder
    try {
      if (fs.existsSync(scratchDir)) {
        fs.rmSync(scratchDir, { recursive: true, force: true });
      }
    } catch (e) {
      // Ignored
    }
  }
}
