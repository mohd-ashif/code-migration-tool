// @ts-nocheck
import * as fs from "fs";
import * as path from "path";
import { DiagnosticEngine } from "../diagnostic-engine";
import { DiagnosticReporter } from "../diagnostic-reporter";

describe("DiagnosticEngine", () => {
  const testWorkspaceDir = path.resolve(__dirname, "temp-diagnostic-workspace");

  beforeAll(() => {
    // Setup temporary mock codebase files containing errors
    if (!fs.existsSync(testWorkspaceDir)) {
      fs.mkdirSync(testWorkspaceDir, { recursive: true });
    }

    // 1. package.json with basic dependencies
    const packageJsonContent = JSON.stringify({
      dependencies: {
        react: "^18.2.0"
      }
    });

    // 2. File with TypeScript syntax error (missing identifier value)
    const syntaxErrorContent = `
      const a = ;
      export { a };
    `;

    // 3. File with React Hook called conditionally in if block
    const reactHookConditionalContent = `
      import React, { useState } from 'react';
      
      export function Dashboard(props: { isAdmin: boolean }) {
        if (props.isAdmin) {
          const [role, setRole] = useState('admin');
        }
        return <div>Dashboard</div>;
      }
    `;

    // 4. File with JSX mapping missing 'key' property
    const jsxMissingKeyContent = `
      import React from 'react';
      
      export function ListUsers() {
        const users = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }];
        return (
          <ul>
            {users.map(u => (
              <li>{u.name}</li>
            ))}
          </ul>
        );
      }
    `;

    // 5. File with missing external npm package dependency and unresolved relative file
    const packageAndImportIssuesContent = `
      import axios from 'axios'; // axios is missing in package.json dependencies
      import { Helper } from './helper-utils'; // helper-utils does not exist
      
      export function fetch() {
        return axios.get('/api');
      }
    `;

    fs.writeFileSync(path.join(testWorkspaceDir, "package.json"), packageJsonContent);
    fs.writeFileSync(path.join(testWorkspaceDir, "syntax-error.ts"), syntaxErrorContent);
    fs.writeFileSync(path.join(testWorkspaceDir, "react-hook-if.tsx"), reactHookConditionalContent);
    fs.writeFileSync(path.join(testWorkspaceDir, "missing-key.tsx"), jsxMissingKeyContent);
    fs.writeFileSync(path.join(testWorkspaceDir, "issues.ts"), packageAndImportIssuesContent);
  });

  afterAll(() => {
    // Clean up mock codebase files
    if (fs.existsSync(testWorkspaceDir)) {
      fs.rmSync(testWorkspaceDir, { recursive: true, force: true });
    }
  });

  it("should detect TypeScript pre-emit syntax compiler errors", () => {
    const diagnostics = DiagnosticEngine.analyze(testWorkspaceDir);
    expect(diagnostics.length).toBeGreaterThan(0);

    // Verify syntax error is found and categorized
    const syntaxError = diagnostics.find((d) => d.location?.sourceFile.endsWith("syntax-error.ts"));
    expect(syntaxError).toBeDefined();
    expect(syntaxError?.severity).toBe("error");
    expect(syntaxError?.category).toBe("typescript");
  });

  it("should detect missing packages and unresolved relative imports", () => {
    const diagnostics = DiagnosticEngine.analyze(testWorkspaceDir);

    // Check package.json auditor for missing axios dependency
    const missingPkg = diagnostics.find((d) => d.code === "PKG_MISSING_DEPENDENCY");
    expect(missingPkg).toBeDefined();
    expect(missingPkg?.category).toBe("package");
    expect(missingPkg?.message).toContain("axios");

    // Check unresolved relative imports helper-utils
    const missingImport = diagnostics.find((d) => d.code === "IMPORT_UNRESOLVED_FILE");
    expect(missingImport).toBeDefined();
    expect(missingImport?.category).toBe("import");
    expect(missingImport?.message).toContain("helper-utils");
  });

  it("should detect React hook conditional calls", () => {
    const diagnostics = DiagnosticEngine.analyze(testWorkspaceDir);

    // Check conditional useState call
    const conditionalHook = diagnostics.find((d) => d.code === "FRAMEWORK_REACT_CONDITIONAL_HOOK");
    expect(conditionalHook).toBeDefined();
    expect(conditionalHook?.category).toBe("framework");
    expect(conditionalHook?.severity).toBe("error");
    expect(conditionalHook?.message).toContain("useState");
  });

  it("should detect lists missing JSX key properties", () => {
    const diagnostics = DiagnosticEngine.analyze(testWorkspaceDir);

    // Check mapping missing key prop
    const missingKey = diagnostics.find((d) => d.code === "JSX_MISSING_KEY");
    expect(missingKey).toBeDefined();
    expect(missingKey?.category).toBe("jsx");
    expect(missingKey?.severity).toBe("warning");
  });

  it("should output formatted text formats via DiagnosticReporter", () => {
    const diagnostics = DiagnosticEngine.analyze(testWorkspaceDir);

    // Test console format
    const consoleText = DiagnosticReporter.formatConsole(diagnostics);
    expect(consoleText).toContain("Summary:");
    expect(consoleText).toContain("Code TS");
    expect(consoleText).toContain("JSX_MISSING_KEY");

    // Test markdown format
    const mdText = DiagnosticReporter.formatMarkdown(diagnostics);
    expect(mdText).toContain("# 📋 Compiler Diagnostic Report");
    expect(mdText).toContain("| Code |");

    // Test JSON format
    const jsonText = DiagnosticReporter.formatJSON(diagnostics);
    expect(jsonText.startsWith("[")).toBe(true);
    expect(jsonText).toContain("PKG_MISSING_DEPENDENCY");
  });
});
