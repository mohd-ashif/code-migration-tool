import { parseSourceFile } from "./parser";
import { analyzeReactComponent } from "./semantic-analyzer";
import { buildComponentIR } from "./ir-builder";
import { generateVueComponent } from "./generator";
import { validateComponentIR } from "./validator";
import { analyzeVueDiagnostics } from "./diagnostics";
import { generateConfigs } from "./config-generator";
import { generatePackageJson } from "./package-generator";
import { extractRoutesFromCode, mapReactRouteToNuxtPagePath } from "./router-transformer";
import { generateComposable } from "./composable-generator";
import { ParsedFile } from "../../types/parser.types";

export { parseSourceFile } from "./parser";
export { analyzeReactComponent } from "./semantic-analyzer";
export { buildComponentIR } from "./ir-builder";
export { generateVueComponent } from "./generator";
export { validateComponentIR } from "./validator";
export { analyzeVueDiagnostics } from "./diagnostics";
export { generateConfigs } from "./config-generator";
export { generatePackageJson } from "./package-generator";
export { getVueEventDirective, transformInlineStyle } from "./vue-template-generator";
export { generateVueStyleBlock } from "./generator";

/**
 * Regex-free JSON comment stripper and trailing comma cleaner.
 */
export function cleanJsonComments(jsonStr: string): string {
  let output = "";
  let inString = false;
  let inSingleComment = false;
  let inMultiComment = false;
  
  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    const nextChar = jsonStr[i + 1] || "";
    
    if (inSingleComment) {
      if (char === "\n" || char === "\r") {
        inSingleComment = false;
        output += char;
      }
      continue;
    }
    
    if (inMultiComment) {
      if (char === "*" && nextChar === "/") {
        inMultiComment = false;
        i++;
      }
      continue;
    }
    
    if (char === '"' && jsonStr[i - 1] !== "\\") {
      inString = !inString;
    }
    
    if (!inString) {
      if (char === "/" && nextChar === "/") {
        inSingleComment = true;
        i++;
        continue;
      }
      if (char === "/" && nextChar === "*") {
        inMultiComment = true;
        i++;
        continue;
      }
    }
    
    output += char;
  }
  
  let cleanOutput = "";
  for (let i = 0; i < output.length; i++) {
    const char = output[i];
    if (char === ",") {
      let nextNonSpace = "";
      let nextIndex = i + 1;
      while (nextIndex < output.length) {
        const next = output[nextIndex];
        if (next !== " " && next !== "\t" && next !== "\n" && next !== "\r") {
          nextNonSpace = next;
          break;
        }
        nextIndex++;
      }
      if (nextNonSpace === "}" || nextNonSpace === "]") {
        continue; // Skip trailing comma
      }
    }
    cleanOutput += char;
  }
  
  return cleanOutput;
}

/**
 * Migrate a single React component file content to Vue 3 Setup SFC.
 */
export function migrateReactCodeToNuxt(sourceCode: string, filePath: string): string {
  const sourceFile = parseSourceFile(sourceCode, filePath);
  const analysis = analyzeReactComponent(sourceFile);

  if (!analysis.isComponent) {
    return sourceCode;
  }

  const ir = buildComponentIR(analysis);
  const validation = validateComponentIR(ir);
  if (!validation.valid) {
    console.warn(`[ReactToNuxt] IR validation failed for ${filePath}:`, validation.issues);
  }

  const vueCode = generateVueComponent(ir, sourceFile);

  const diagnostics = analyzeVueDiagnostics(vueCode, filePath);
  if (diagnostics.some((d) => d.severity === "error")) {
    console.error(`[ReactToNuxt] Serious diagnostics issues found for ${filePath}:`, diagnostics);
  }

  return vueCode;
}

/**
 * Migrate a React project workspace to Nuxt 3.
 */
export function migrateReactProjectToNuxt(files: ParsedFile[]): ParsedFile[] {
  const resultFiles: ParsedFile[] = [];
  let convertedAny = false;

  // 1. Scan for React Router routes globally
  const allRoutes: Array<{ path: string; componentName: string }> = [];
  files.forEach((f) => {
    if (f.path.endsWith(".tsx") || f.path.endsWith(".jsx")) {
      const routes = extractRoutesFromCode(f.content);
      if (routes.length > 0) {
        allRoutes.push(...routes);
      }
    }
  });

  const componentCache = new Map<string, { vueCode: string; originalPath: string }>();

  // 2. Pre-process and compile all components and hooks
  files.forEach((file) => {
    const path = file.path;
    const content = file.content;

    if (
      path.endsWith(".tsx") ||
      path.endsWith(".jsx") ||
      path.endsWith(".ts") ||
      path.endsWith(".js")
    ) {
      const sourceFile = parseSourceFile(content, path);

      // Check if Custom Hook file
      const isHookFile = path.includes("src/hooks/") || path.includes("/hooks/") || path.includes("\\hooks\\");
      if (isHookFile) {
        convertedAny = true;
        const analysis = analyzeReactComponent(sourceFile);
        const vueComposable = generateComposable(content, analysis.states);
        const newPath = path
          .split("src/hooks/").join("composables/")
          .split("hooks/").join("composables/");
        
        resultFiles.push({
          path: newPath,
          content: vueComposable,
        });
        return;
      }

      const analysis = analyzeReactComponent(sourceFile);
      if (analysis.isComponent) {
        convertedAny = true;
        const ir = buildComponentIR(analysis);
        const vueCode = generateVueComponent(ir, sourceFile);

        componentCache.set(analysis.componentName, {
          vueCode,
          originalPath: path,
        });
      }
    }
  });

  // 3. Process all remaining project files
  files.forEach((file) => {
    const path = file.path;
    const content = file.content;

    // 1. Process package.json
    if (path === "package.json" || path.endsWith("/package.json") || path.endsWith("\\package.json")) {
      resultFiles.push({
        path,
        content: generatePackageJson(content),
      });
      return;
    }

    // 1.5. Process README.md
    if (path.toLowerCase() === "readme.md" || path.toLowerCase().endsWith("/readme.md") || path.toLowerCase().endsWith("\\readme.md")) {
      const { transformReadmeToNuxt } = require("./readme-generator");
      resultFiles.push({
        path,
        content: transformReadmeToNuxt(content),
      });
      return;
    }

    // 2. Process index.html & vite.config.ts (removed for Nuxt 3 projects)
    if (
      path === "index.html" ||
      path.endsWith("index.html") ||
      path === "vite.config.ts" ||
      path.endsWith("/vite.config.ts") ||
      path.endsWith("\\vite.config.ts") ||
      path === "vite.config.js" ||
      path.endsWith("/vite.config.js") ||
      path.endsWith("\\vite.config.js")
    ) {
      return;
    }

    // 3. Process tsconfig.json
    if (path === "tsconfig.json" || path.endsWith("tsconfig.json")) {
      const cleanContent = cleanJsonComments(content);
      try {
        const tsconfig = JSON.parse(cleanContent);
        tsconfig.extends = "./.nuxt/tsconfig.json";
        if (tsconfig.compilerOptions) {
          delete tsconfig.compilerOptions.jsx;
          if (tsconfig.compilerOptions.types) {
            tsconfig.compilerOptions.types = tsconfig.compilerOptions.types.filter(
              (t: string) => !t.includes("react")
            );
          }
        }
        resultFiles.push({ path, content: JSON.stringify(tsconfig, null, 2) });
      } catch (e) {
        // Fallback simple parsing
        let fallback = cleanContent;
        const jsxIndex = fallback.indexOf('"jsx"');
        if (jsxIndex !== -1) {
          const commaIndex = fallback.indexOf(",", jsxIndex);
          if (commaIndex !== -1) {
            fallback = fallback.substring(0, jsxIndex) + fallback.substring(commaIndex + 1);
          } else {
            fallback = fallback.substring(0, jsxIndex) + "}";
          }
        }
        resultFiles.push({ path, content: fallback });
      }
      return;
    }

    // 4. Process React Entrypoint
    const lowerPath = path.toLowerCase();
    const isEntryPoint =
      (lowerPath.endsWith("main.tsx") ||
        lowerPath.endsWith("main.jsx") ||
        lowerPath.endsWith("index.tsx") ||
        lowerPath.endsWith("index.jsx") ||
        lowerPath.endsWith("main.ts") ||
        lowerPath.endsWith("index.ts") ||
        lowerPath.endsWith("main.js") ||
        lowerPath.endsWith("index.js")) &&
      (content.includes("ReactDOM") ||
        content.includes("createRoot") ||
        content.includes("React.createRoot") ||
        content.includes("react-dom"));

    if (isEntryPoint) {
      convertedAny = true;
      return;
    }

    // 5. Skip Hook Files since they were compiled in Step 2
    const isHookFile = path.includes("src/hooks/") || path.includes("/hooks/") || path.includes("\\hooks\\");
    if (isHookFile) {
      return;
    }

    // 6. Process React Components and map them to Nuxt routing directory structures
    if (
      path.endsWith(".tsx") ||
      path.endsWith(".jsx") ||
      path.endsWith(".ts") ||
      path.endsWith(".js")
    ) {
      const sourceFile = parseSourceFile(content, path);
      const analysis = analyzeReactComponent(sourceFile);

      if (analysis.isComponent) {
        // App.tsx maps to app.vue root
        if (path.endsWith("App.tsx") || path.endsWith("App.jsx") || path.endsWith("App.vue")) {
          const cached = componentCache.get(analysis.componentName);
          if (cached) {
            resultFiles.push({
              path: "app.vue",
              content: cached.vueCode,
            });
          }
          return;
        }

        // If component is a routed page, map to pages/
        const matchedRoute = allRoutes.find((r) => r.componentName === analysis.componentName);
        if (matchedRoute) {
          const nuxtPagePath = mapReactRouteToNuxtPagePath(matchedRoute.path);
          const cached = componentCache.get(analysis.componentName);
          if (cached) {
            resultFiles.push({
              path: nuxtPagePath,
              content: cached.vueCode,
            });
          }
          return;
        }

        // Default components/ layout destination
        const cached = componentCache.get(analysis.componentName);
        if (cached) {
          const ext = path.endsWith(".tsx") ? ".tsx" : ".jsx";
          let newPath = path.substring(0, path.length - ext.length) + ".vue";
          if (newPath.includes("src/components/")) {
            newPath = newPath.split("src/components/").join("components/");
          } else {
            if (newPath.startsWith("src/")) {
              newPath = "components/" + newPath.substring(4);
            }
          }
          resultFiles.push({
            path: newPath,
            content: cached.vueCode,
          });
        }
        return;
      }

      // Handle non-component files renaming extensions
      if (path.endsWith(".tsx") || path.endsWith(".jsx")) {
        const newPath = path.endsWith(".tsx") 
          ? path.substring(0, path.length - 4) + ".ts" 
          : path.substring(0, path.length - 4) + ".js";
        resultFiles.push({
          path: newPath,
          content,
        });
        return;
      }
    }

    // Other non-compiled files
    resultFiles.push(file);
  });

  // Inject configs
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

    const hasAppVue = resultFiles.some((rf) => rf.path === "app.vue");
    if (!hasAppVue) {
      const appVueContent = `<template>
  <div>
    <NuxtPage />
  </div>
</template>
`;
      resultFiles.push({
        path: "app.vue",
        content: appVueContent,
      });
    }
  }

  return resultFiles;
}
