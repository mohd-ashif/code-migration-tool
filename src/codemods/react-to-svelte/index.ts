import { parseSourceFile } from "./parser";
import { analyzeReactComponent } from "./semantic-analyzer";
import { buildComponentIR } from "./ir-builder";
import { generateSvelteComponent } from "./generator";
import { validateComponentIR } from "./validator";
import { analyzeSvelteDiagnostics } from "./diagnostics";
import { generateConfigs } from "./config-generator";
import { generatePackageJson } from "./package-generator";
import { ParsedFile } from "../../types/parser.types";

export { parseSourceFile } from "./parser";
export { analyzeReactComponent } from "./semantic-analyzer";
export { buildComponentIR } from "./ir-builder";
export { generateSvelteComponent } from "./generator";
export { validateComponentIR } from "./validator";
export { analyzeSvelteDiagnostics } from "./diagnostics";
export { generateConfigs } from "./config-generator";
export { generatePackageJson } from "./package-generator";

/**
 * High-level orchestration function to migrate a single React component file to Svelte.
 */
export function migrateReactCodeToSvelte(sourceCode: string, filePath: string): string {
  const sourceFile = parseSourceFile(sourceCode, filePath);
  const analysis = analyzeReactComponent(sourceFile);

  if (!analysis.isComponent) {
    return sourceCode;
  }

  const ir = buildComponentIR(analysis);
  const validation = validateComponentIR(ir);
  if (!validation.valid) {
    console.warn(`[ReactToSvelte] IR validation failed for ${filePath}:`, validation.issues);
  }

  const svelteCode = generateSvelteComponent(ir, sourceFile);

  const diagnostics = analyzeSvelteDiagnostics(svelteCode, filePath);
  if (diagnostics.some((d) => d.severity === "error")) {
    console.error(`[ReactToSvelte] Serious diagnostics issues found for ${filePath}:`, diagnostics);
  }

  return svelteCode;
}

/**
 * Project-wide orchestrator function to migrate a React project workspace to Svelte.
 */
export function migrateReactProjectToSvelte(files: ParsedFile[]): ParsedFile[] {
  const resultFiles: ParsedFile[] = [];
  let convertedAny = false;

  files.forEach((file) => {
    const path = file.path;
    const content = file.content;

    // 1. Process package.json
    if (path === "package.json") {
      resultFiles.push({
        path,
        content: generatePackageJson(content),
      });
      return;
    }

    // 2. Process index.html
    if (path === "index.html" || path.endsWith("index.html")) {
      let cleanHtml = content;
      cleanHtml = cleanHtml.replace(/id=["']root["']/g, 'id="app"');
      cleanHtml = cleanHtml.replace(/src\/main\.(tsx|jsx|ts|js)/g, 'src/main.ts');
      cleanHtml = cleanHtml.replace(/src\/index\.(tsx|jsx|ts|js)/g, 'src/main.ts');
      resultFiles.push({ path, content: cleanHtml });
      return;
    }

    // 3. Process tsconfig.json
    if (path === "tsconfig.json" || path.endsWith("tsconfig.json")) {
      try {
        const tsconfig = JSON.parse(content);
        if (tsconfig.compilerOptions) {
          // Remove React-specific JSX options
          delete tsconfig.compilerOptions.jsx;
          if (tsconfig.compilerOptions.types) {
            tsconfig.compilerOptions.types = tsconfig.compilerOptions.types.filter(
              (t: string) => !t.includes("react")
            );
          }
        }
        resultFiles.push({ path, content: JSON.stringify(tsconfig, null, 2) });
      } catch (e) {
        resultFiles.push({ path, content });
      }
      return;
    }

    // 4. Process React Entrypoint (e.g. main.tsx or index.tsx that initializes React)
    const isEntryPoint =
      (path.endsWith("main.tsx") ||
        path.endsWith("main.jsx") ||
        path.endsWith("index.tsx") ||
        path.endsWith("index.jsx") ||
        path.endsWith("main.ts") ||
        path.endsWith("index.ts")) &&
      (content.includes("ReactDOM") || content.includes("createRoot") || content.includes("React.createRoot"));

    if (isEntryPoint) {
      convertedAny = true;
      const svelteEntryPoint = `import App from "./App.svelte";

const app = new App({
  target: document.getElementById("app")!,
});

export default app;
`;
      const newPath = path.replace(/\.(tsx|jsx)$/, ".ts").replace(/\.(ts|js)$/, ".ts");
      resultFiles.push({
        path: newPath,
        content: svelteEntryPoint,
      });
      return;
    }

    // 5. Process source files
    if (
      path.endsWith(".tsx") ||
      path.endsWith(".jsx") ||
      path.endsWith(".ts") ||
      path.endsWith(".js")
    ) {
      const sourceFile = parseSourceFile(content, path);
      const analysis = analyzeReactComponent(sourceFile);

      if (analysis.isComponent) {
        convertedAny = true;
        const ir = buildComponentIR(analysis);
        const svelteCode = generateSvelteComponent(ir, sourceFile);
        const newPath = path.replace(/\.(tsx|jsx)$/, ".svelte");
        resultFiles.push({
          path: newPath,
          content: svelteCode,
        });
        return;
      }

      // If it's a TSX/JSX file but not a component, rename extension to .ts/.js to prevent compiler issues
      if (path.endsWith(".tsx") || path.endsWith(".jsx")) {
        const newPath = path.replace(/\.tsx$/, ".ts").replace(/\.jsx$/, ".js");
        resultFiles.push({
          path: newPath,
          content,
        });
        return;
      }
    }

    // Retain other files
    resultFiles.push(file);
  });

  // Inject Svelte boilerplate configurations if components were migrated
  if (convertedAny) {
    const configs = generateConfigs();
    configs.forEach((cfg) => {
      if (!resultFiles.some((rf) => rf.path === cfg.filename)) {
        resultFiles.push({
          path: cfg.filename,
          content: cfg.content,
        });
      }
    });
  }

  return resultFiles;
}
