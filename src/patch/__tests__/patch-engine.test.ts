// @ts-nocheck
import { ASTPatchEngine } from "../patch-engine";

describe("ASTPatchEngine", () => {
  it("should compute and apply minimal patches for inserts, deletes, replaces, and import updates", () => {
    const originalCode = `
      import { useState } from 'react';
      import { LegacyLogger } from './legacy';

      // Important comment to preserve
      export function MyComponent() {
        const [val, setVal] = useState(0);
        return <div>{val}</div>;
      }

      export class UnusedHelper {
        log() { console.log('unused'); }
      }
    `;

    const targetCode = `
      import { useState, useEffect } from 'react';
      import { NewLogger } from './new';

      // Important comment to preserve
      export function MyComponent() {
        const [val, setVal] = useState(0);
        useEffect(() => {
          console.log('val changed', val);
        }, [val]);
        return <div>{val}</div>;
      }

      export interface NewConfig {
        enabled: boolean;
      }
    `;

    const result = ASTPatchEngine.patch(originalCode, targetCode);

    expect(result.patches).toBeDefined();
    expect(result.patches.length).toBeGreaterThan(0);

    // Check patch types
    const patchTypes = result.patches.map((p) => p.type);
    expect(patchTypes).toContain("delete"); // delete UnusedHelper class & LegacyLogger import
    expect(patchTypes).toContain("insert"); // insert NewConfig interface & NewLogger import
    expect(patchTypes).toContain("replace"); // replace MyComponent function
    expect(patchTypes).toContain("update-imports"); // update-imports for react

    // Verify modified output formatting preserves comments
    const output = result.modifiedContent;
    expect(output).toContain("// Important comment to preserve");
    expect(output).toContain("import { useState, useEffect } from 'react';");
    expect(output).toContain("import { NewLogger } from './new';");
    expect(output).toContain("useEffect(");
    expect(output).toContain("interface NewConfig");

    expect(output).not.toContain("class UnusedHelper");
    expect(output).not.toContain("import { LegacyLogger }");
  });
});
