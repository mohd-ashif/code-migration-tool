import { ParsedFile } from "../types/parser.types";
import { validateProject } from "./sandbox.service";
import * as path from "path";

/**
 * Iteratively runs validation and applies automated compiler repairs for common errors
 * such as broken imports and missing dependencies in package.json.
 */
export async function autoRepairProject(files: ParsedFile[]): Promise<{ files: ParsedFile[]; fixedIssues: string[] }> {
  const fixedIssues: string[] = [];
  let currentFiles = files.map(f => ({ ...f }));

  let validation = await validateProject(currentFiles);
  if (validation.success) {
    return { files: currentFiles, fixedIssues };
  }

  let attempts = 0;
  const maxAttempts = 3;

  while (!validation.success && attempts < maxAttempts) {
    attempts++;
    let resolvedAny = false;

    // 1. Repair unresolved relative import paths
    for (const err of validation.errors) {
      if (err.includes("Unresolved import:")) {
        const match = err.match(/Unresolved import:\s*"([^"]+)"\s*in\s*([\s\S]+)$/i);
        if (match) {
          const importSpecifier = match[1];
          const filePath = match[2].trim();

          const basename = importSpecifier.split("/").pop() || "";
          const targetFile = currentFiles.find(f => 
            f.path.toLowerCase().endsWith(`/${basename.toLowerCase()}.tsx`) ||
            f.path.toLowerCase().endsWith(`/${basename.toLowerCase()}.ts`) ||
            f.path.toLowerCase().endsWith(`/${basename.toLowerCase()}.jsx`) ||
            f.path.toLowerCase().endsWith(`/${basename.toLowerCase()}.js`)
          );

          if (targetFile) {
            const sourceFile = currentFiles.find(f => f.path === filePath);
            if (sourceFile) {
              const sourceDir = filePath.substring(0, filePath.lastIndexOf("/")) || "";
              const targetPath = targetFile.path.replace(/\.[^/.]+$/, "");
              
              let relativePath = path.relative(sourceDir, targetPath).replace(/\\/g, "/");
              if (!relativePath.startsWith(".")) {
                relativePath = `./${relativePath}`;
              }

              const initialContent = sourceFile.content;
              sourceFile.content = sourceFile.content.replace(
                new RegExp(`import\\s+([\\s\\S]*?)\\s+from\\s+['"]${importSpecifier}['"]`, 'g'),
                `import $1 from "${relativePath}"`
              );

              if (sourceFile.content !== initialContent) {
                fixedIssues.push(`Repaired broken import path "${importSpecifier}" to "${relativePath}" in ${filePath}`);
                resolvedAny = true;
              }
            }
          }
        }
      }
    }

    // 2. Add missing packages to package.json
    const packageJson = currentFiles.find(f => f.path === "package.json");
    if (packageJson) {
      try {
        const pkgData = JSON.parse(packageJson.content);
        pkgData.dependencies = pkgData.dependencies || {};

        for (const err of validation.errors) {
          const depMatch = err.match(/Cannot find module ['"]([^'"]+)['"]/i) || 
                           err.match(/Unresolved import:\s*"([^.\/][^"]+)"/i);
          if (depMatch) {
            const depName = depMatch[1];
            if (!pkgData.dependencies[depName] && !["react", "react-dom", "next"].includes(depName)) {
              pkgData.dependencies[depName] = "latest";
              fixedIssues.push(`Added missing dependency "${depName}" to package.json`);
              resolvedAny = true;
            }
          }
        }

        if (resolvedAny) {
          packageJson.content = JSON.stringify(pkgData, null, 2);
        }
      } catch (e) {
        // Ignored
      }
    }

    if (!resolvedAny) {
      break;
    }

    // Re-validate after fixes applied
    validation = await validateProject(currentFiles);
  }

  return { files: currentFiles, fixedIssues };
}
