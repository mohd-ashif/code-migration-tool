import { Project, SyntaxKind, ModuleResolutionKind, ImportDeclaration, JsxElement, JsxSelfClosingElement } from "ts-morph";
import * as path from "path";
import * as fs from "fs";
import { DiagnosticItem, DiagnosticCategory, DiagnosticSeverity } from "./diagnostic-types";

export class DiagnosticEngine {
  /**
   * Analyzes the project workspace and returns compiler diagnostics, lint errors,
   * package mismatches, JSX problems, and framework violations.
   */
  public static analyze(rootPath: string): DiagnosticItem[] {
    const absoluteRoot = path.resolve(rootPath);
    const tsConfigPath = path.join(absoluteRoot, "tsconfig.json");
    const diagnostics: DiagnosticItem[] = [];

    // 1. Initialize ts-morph project
    let project: Project;
    if (fs.existsSync(tsConfigPath)) {
      project = new Project({
        tsConfigFilePath: tsConfigPath,
        skipFileDependencyResolution: false,
      });
    } else {
      project = new Project({
        compilerOptions: {
          allowJs: true,
          experimentalDecorators: true,
          jsx: 1, // JxEmit.Preserve
          target: 99, // ESNext
          moduleResolution: ModuleResolutionKind.NodeJs,
        },
      });
      project.addSourceFilesAtPaths([
        path.join(absoluteRoot, "**/*.ts"),
        path.join(absoluteRoot, "**/*.tsx"),
        path.join(absoluteRoot, "**/*.js"),
        path.join(absoluteRoot, "**/*.jsx"),
        `!**/node_modules/**`,
        `!**/dist/**`,
        `!**/.next/**`,
      ]);
    }

    // Load package.json for package reference checks
    let packageDeps: string[] = [];
    const packageJsonPath = path.join(absoluteRoot, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
        packageDeps = [
          ...Object.keys(pkg.dependencies || {}),
          ...Object.keys(pkg.devDependencies || {}),
        ];
      } catch (e) {
        // Ignore JSON parsing errors
      }
    }

    const sourceFiles = project.getSourceFiles();

    // 2. TypeScript Pre-Emit Diagnostics Pass
    const tsDiagnostics = project.getPreEmitDiagnostics();
    for (const diag of tsDiagnostics) {
      const sourceFile = diag.getSourceFile();
      const filePath = sourceFile ? sourceFile.getFilePath() : "unknown";
      
      const start = diag.getStart();
      let line = 0;
      let character = 0;
      if (sourceFile && start !== undefined) {
        const lineAndCol = sourceFile.getLineAndColumnAtPos(start);
        line = lineAndCol.line;
        character = lineAndCol.column;
      }

      const tsCode = diag.getCode();
      const codeStr = `TS${tsCode}`;
      const rawMessage = diag.getMessageText();
      const messageText = typeof rawMessage === "string" ? rawMessage : rawMessage.getMessageText();

      let category: DiagnosticCategory = "typescript";
      let suggestedRepair: string | undefined;

      // Classify TS compilation error code
      if ([2307, 2732, 2834, 2835].includes(tsCode)) {
        category = "import";
        suggestedRepair = "Verify that the import path or file extension is correct and the target file exists.";
      } else if ([6133, 6192, 6196].includes(tsCode)) {
        category = "eslint";
        suggestedRepair = "Remove the unused declaration or prefix the variable name with an underscore.";
      } else if ([2451, 2300].includes(tsCode)) {
        category = "typescript";
        suggestedRepair = "Resolve duplicate name definitions by merging or renaming variables.";
      } else if ([17004, 17008, 2604].includes(tsCode)) {
        category = "jsx";
        suggestedRepair = "Ensure that the JSX syntax is formatted correctly and components are properly capitalized.";
      }

      diagnostics.push({
        code: codeStr,
        severity: "error",
        category,
        message: messageText,
        suggestedRepair,
        relatedFiles: sourceFile ? [filePath] : [],
        location: sourceFile
          ? {
              line,
              character,
              length: diag.getLength(),
              sourceFile: filePath,
            }
          : undefined,
      });
    }

    // 3. Custom AST Linting and Framework Verification Pass
    for (const sourceFile of sourceFiles) {
      const filePath = sourceFile.getFilePath();

      // Check imports against package.json
      for (const imp of sourceFile.getImportDeclarations()) {
        const specifier = imp.getModuleSpecifierValue();
        const start = imp.getStart();
        const lineAndCol = sourceFile.getLineAndColumnAtPos(start);

        // A. Check missing package dependencies
        if (!specifier.startsWith(".") && !path.isAbsolute(specifier)) {
          const isNodeBuiltin = this.isNodeBuiltin(specifier);
          if (!isNodeBuiltin && packageDeps.length > 0 && !packageDeps.includes(specifier.split("/")[0])) {
            diagnostics.push({
              code: "PKG_MISSING_DEPENDENCY",
              severity: "error",
              category: "package",
              message: `Package "${specifier}" is imported but not defined in package.json dependencies.`,
              suggestedRepair: `Run 'npm install ${specifier.split("/")[0]}' to register the dependency.`,
              relatedFiles: [filePath, packageJsonPath],
              location: {
                line: lineAndCol.line,
                character: lineAndCol.column,
                length: imp.getWidth(),
                sourceFile: filePath,
              },
            });
          }
        }

        // B. Check relative import file existence
        if (specifier.startsWith(".")) {
          const resolvedFile = imp.getModuleSpecifierSourceFile();
          if (!resolvedFile) {
            diagnostics.push({
              code: "IMPORT_UNRESOLVED_FILE",
              severity: "error",
              category: "import",
              message: `Cannot resolve relative import path "${specifier}" inside ${path.basename(filePath)}.`,
              suggestedRepair: "Verify the spelling of the file path and check if the target file was renamed or deleted.",
              relatedFiles: [filePath],
              location: {
                line: lineAndCol.line,
                character: lineAndCol.column,
                length: imp.getWidth(),
                sourceFile: filePath,
              },
            });
          }
        }
      }

      // C. React JSX key property check on loops
      sourceFile.forEachDescendant((node) => {
        if (node.getKind() === SyntaxKind.CallExpression) {
          const exprText = node.getText();
          // Heuristic: mapping loop returning JSX
          if (exprText.includes(".map(") && (exprText.includes("<") || exprText.includes("React.createElement"))) {
            // Find JSX Elements returned within this call expression
            const jsxElements = node.getDescendantsOfKind(SyntaxKind.JsxElement);
            const jsxSelfClosing = node.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement);
            const jsxAll = [...jsxElements, ...jsxSelfClosing];

            if (jsxAll.length > 0) {
              const rootJSX = jsxAll[0];
              // Check if it has a 'key' prop
              let hasKey = false;
              if (rootJSX.getKind() === SyntaxKind.JsxElement) {
                const opening = (rootJSX as JsxElement).getOpeningElement();
                hasKey = opening.getAttributes().some((attr: any) => attr.getText().startsWith("key="));
              } else if (rootJSX.getKind() === SyntaxKind.JsxSelfClosingElement) {
                hasKey = (rootJSX as JsxSelfClosingElement).getAttributes().some((attr: any) => attr.getText().startsWith("key="));
              }

              if (!hasKey) {
                const lineAndCol = sourceFile.getLineAndColumnAtPos(rootJSX.getStart());
                diagnostics.push({
                  code: "JSX_MISSING_KEY",
                  severity: "warning",
                  category: "jsx",
                  message: "Outer JSX elements returned inside list loops should have a unique 'key' attribute.",
                  suggestedRepair: "Add a key attribute (e.g. key={item.id}) to the outer JSX element returned in this loop.",
                  relatedFiles: [filePath],
                  location: {
                    line: lineAndCol.line,
                    character: lineAndCol.column,
                    length: rootJSX.getWidth(),
                    sourceFile: filePath,
                  },
                });
              }
            }
          }
        }

        // D. Framework Rules: React Hook conditional call check
        if (node.getKind() === SyntaxKind.IfStatement) {
          const identifiers = node.getDescendantsOfKind(SyntaxKind.Identifier);
          for (const ident of identifiers) {
            const name = ident.getText();
            if (name.startsWith("use") && name.length > 3 && name[3] === name[3].toUpperCase()) {
              const lineAndCol = sourceFile.getLineAndColumnAtPos(ident.getStart());
              diagnostics.push({
                code: "FRAMEWORK_REACT_CONDITIONAL_HOOK",
                severity: "error",
                category: "framework",
                message: `React Hook "${name}" is called conditionally inside an 'if' block.`,
                suggestedRepair: "React Hooks must be called unconditionally at the top level of components.",
                relatedFiles: [filePath],
                location: {
                  line: lineAndCol.line,
                  character: lineAndCol.column,
                  length: name.length,
                  sourceFile: filePath,
                },
              });
            }
          }
        }
      });
    }

    return diagnostics;
  }

  private static isNodeBuiltin(moduleName: string): boolean {
    const builtins = [
      "path",
      "fs",
      "os",
      "crypto",
      "events",
      "util",
      "child_process",
      "http",
      "https",
      "stream",
      "buffer",
      "url",
      "querystring",
      "zlib",
    ];
    return builtins.includes(moduleName);
  }
}
