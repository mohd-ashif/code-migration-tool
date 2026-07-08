# 🧩 AST Patch Engine

The **AST Patch Engine** calculates and applies structural changes between two ASTs (original and target states) with strict constraints: **no text replacement, no regex, and maximum formatting preservation.**

Rather than compiling a new source file from scratch—which drops comments, spacing, and styling—the patch engine computes a sequence of minimal edits and applies them as direct AST tree node mutations.

---

## ⚡ Key Features

1.  **Strict AST Diffing**: Computes exact additions, removals, updates, and moves of declarations (Classes, Functions, Interfaces, Enums) and imports.
2.  **Reverse Edit Application**: Sorts mutations and applies them from bottom-to-top (reverse sequence), keeping offset positions of preceding elements intact.
3.  **Preserved Formatting**: Leaves untouched code, comments, whitespace, and layout completely intact.
4.  **No Text Manipulation**: Mutates node values directly via `ts-morph` AST methods (e.g. `node.remove()`, `node.replaceWithText()`, etc.).

---

## 💻 Code Example

```typescript
import { ASTPatchEngine } from "./patch-engine";

const originalCode = `
  import { useState } from 'react';
  
  export function MyWidget() {
    return <div>Original Widget</div>;
  }
`;

const targetCode = `
  import { useState, useEffect } from 'react';
  
  export function MyWidget() {
    useEffect(() => {
      console.log('Mounted');
    }, []);
    return <div>Updated Widget</div>;
  }
  
  export interface ExtraInfo {
    id: string;
  }
`;

// Compute patches and generate patched output preserving formatting
const result = ASTPatchEngine.patch(originalCode, targetCode);

console.log("Patches Generated:", result.patches);
console.log("Patched Code:\n", result.modifiedContent);
```
