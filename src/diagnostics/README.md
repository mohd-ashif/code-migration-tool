# 🛠️ Compiler Diagnostic Engine

The **Diagnostic Engine** compiles, inspects, and analyzes migrated code quality inside the validation workspaces. 

Instead of returning a binary `success` or `failure` compilation state, the engine aggregates compiler errors, unresolved imports, custom code rules, JSX issues, and framework validations into categorized type-safe diagnostics.

---

## ⚡ Key Checks Performed

1.  **TypeScript Diagnostics**: Queries the native TypeScript compiler to pull syntax errors, Type check problems, and pre-emit issues.
2.  **Package Dependency Auditor**: Matches imported module names against `package.json` dependencies to prevent undeclared NPM imports.
3.  **Unresolved Path Finder**: Traces local files recursively to identify broken relative path links.
4.  **React Hook Conditional Call Checks**: Traverses AST nodes to find hook identifiers (`useX`) called inside conditional branches (`if` statements).
5.  **JSX Unique Key Warnings**: Detects JSX items rendered inside `.map()` loops lacking a `key` prop attribute.

---

## 💻 Code Example

### 1. Ingesting & Analyzing Workspace
```typescript
import { DiagnosticEngine } from "./diagnostic-engine";
import { DiagnosticReporter } from "./diagnostic-reporter";

// Run compilation & lint check passes
const items = DiagnosticEngine.analyze("/path/to/my/workspace");

// Output formatted results
console.log(DiagnosticReporter.formatConsole(items));
```

### 2. Formats Supported

*   **Terminal Output (`formatConsole`)**: ANSI colored messages summarizing code issues.
*   **Markdown Summaries (`formatMarkdown`)**: Generates structured table reports suitable for log artifact generation.
*   **JSON Strings (`formatJSON`)**: Standard serialized arrays.
