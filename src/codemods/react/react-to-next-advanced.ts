import { ParsedFile } from "../../types/parser.types";
import { checkRequiresClientDirective, transformReactRouterImportsAndHooks } from "../../utils/ast-helper";

interface RouteInfo {
  routePath: string;
  componentName: string;
  importPath: string;
}

interface FileVerification {
  path: string;
  hasStaticImports: boolean;
  hasDynamicImports: boolean;
  isBarrelExported: boolean;
  isReferencedInConfig: boolean;
  isReferencedInRouting: boolean;
  isBuildEntrypoint: boolean;
  isUnused: boolean;
  evidence: string[];
}

function verifyDependencies(files: ParsedFile[]): FileVerification[] {
  return files.map(file => {
    const filename = file.path;
    const parts = filename.split(/[/\\]/);
    const basename = parts.pop() || "";
    const nameWithoutExt = basename.replace(/\.[^/.]+$/, "");

    // Configuration files
    const isConfig = [
      "package.json", "tsconfig.json", "next.config.js", "next.config.ts", 
      "vite.config.ts", "vite.config.js", "postcss.config.js", "tailwind.config.js",
      ".env", ".env.local", ".env.development", "package-lock.json"
    ].includes(basename);

    // Asset and stylesheet files
    const isAssetOrStyle = /\.(css|scss|sass|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i.test(basename);

    if (isConfig || isAssetOrStyle) {
      return {
        path: filename,
        hasStaticImports: true,
        hasDynamicImports: false,
        isBarrelExported: false,
        isReferencedInConfig: true,
        isReferencedInRouting: false,
        isBuildEntrypoint: false,
        isUnused: false,
        evidence: ["Configuration or asset file."]
      };
    }

    let hasStaticImports = false;
    let hasDynamicImports = false;
    let isBarrelExported = false;
    let isReferencedInConfig = false;
    let isReferencedInRouting = false;
    let isBuildEntrypoint = ["src/main.tsx", "src/main.jsx", "src/index.tsx", "src/index.jsx", "index.html", "src/index.js", "src/main.js"].includes(filename);

    const evidence: string[] = [];

    // Scan other files for references
    files.forEach(otherFile => {
      if (otherFile.path === filename) return;

      const content = otherFile.content;

      // 1. Static imports: import ... from './basename'
      const staticImportRegex = new RegExp(`from\\s+['"][^'"]*?${nameWithoutExt}['"]`, 'i');
      if (staticImportRegex.test(content)) {
        hasStaticImports = true;
        evidence.push(`Static import found in ${otherFile.path}`);
      }

      // 2. Dynamic imports: import('./basename')
      const dynamicImportRegex = new RegExp(`import\\(\\s*['"][^'"]*?${nameWithoutExt}['"]\\s*\\)`, 'i');
      if (dynamicImportRegex.test(content)) {
        hasDynamicImports = true;
        evidence.push(`Dynamic import found in ${otherFile.path}`);
      }

      // 3. Barrel exports: export ... from './basename'
      const barrelExportRegex = new RegExp(`export\\s+(?:[\\s\\S]*?\\s+from\\s+)?['"][^'"]*?${nameWithoutExt}['"]`, 'i');
      if (barrelExportRegex.test(content)) {
        isBarrelExported = true;
        evidence.push(`Barrel export found in ${otherFile.path}`);
      }

      // 4. Config references
      if (otherFile.path.endsWith("tsconfig.json") || otherFile.path.endsWith("package.json") || otherFile.path.endsWith("vite.config.ts")) {
        if (content.includes(filename) || content.includes(nameWithoutExt)) {
          isReferencedInConfig = true;
          evidence.push(`Configuration reference found in ${otherFile.path}`);
        }
      }

      // 5. Routing references
      const componentName = nameWithoutExt.charAt(0).toUpperCase() + nameWithoutExt.slice(1);
      const routingRegex = new RegExp(`element\\s*=\\s*\\{\\s*<\\s*${componentName}\\s*`, 'i');
      if (routingRegex.test(content)) {
        isReferencedInRouting = true;
        evidence.push(`Routing element reference found in ${otherFile.path}`);
      }
    });

    if (isBuildEntrypoint) {
      evidence.push("Build entrypoint.");
    }

    const isUnused = !hasStaticImports && !hasDynamicImports && !isBarrelExported && 
                     !isReferencedInConfig && !isReferencedInRouting && !isBuildEntrypoint;

    return {
      path: filename,
      hasStaticImports,
      hasDynamicImports,
      isBarrelExported,
      isReferencedInConfig,
      isReferencedInRouting,
      isBuildEntrypoint,
      isUnused,
      evidence
    };
  });
}

export async function migrateReactToNext(files: ParsedFile[]): Promise<ParsedFile[]> {
  const resultFiles: ParsedFile[] = [];
  
  // 1. Run Complete Project Dependency Analysis first
  const depAnalysis = verifyDependencies(files);
  const manualReviews: string[] = [];

  // Detect if TypeScript is used
  const isTypeScript = files.some(f => f.path.endsWith(".ts") || f.path.endsWith(".tsx"));
  const extension = isTypeScript ? "tsx" : "jsx";

  // 2. Scan package.json to get dependency info
  let pkgFile = files.find(f => f.path === "package.json");
  let pkgData: any = {};
  if (pkgFile) {
    try {
      pkgData = JSON.parse(pkgFile.content);
    } catch (e) {
      pkgData = {};
    }
  }

  // 3. Environment Variables Mapping (VITE_ -> NEXT_PUBLIC_)
  files.forEach(f => {
    if (f.path.includes(".env")) {
      f.content = f.content.replace(/VITE_/g, "NEXT_PUBLIC_");
      f.content = f.content.replace(/REACT_APP_/g, "NEXT_PUBLIC_");
    }
  });

  // 4. Detect routes in components
  const routes: RouteInfo[] = [];
  files.forEach(f => {
    if (f.path.endsWith(".tsx") || f.path.endsWith(".jsx") || f.path.endsWith(".js") || f.path.endsWith(".ts")) {
      const routeRegex = /<Route\s+[^>]*?path=["']([^"']+)["'][^>]*?element\s*=\s*\{\s*<\s*([A-Z][A-Za-z0-9_]*)\s*(?:\/>|>\s*<\s*\/\s*\2\s*>|\s*[^>]*?>)\s*\}/g;
      let match;
      while ((match = routeRegex.exec(f.content)) !== null) {
        const routePath = match[1];
        const componentName = match[2];
        
        const importRegex = new RegExp(`import\\s+(?:{\\s*${componentName}\\s*}|${componentName})\\s+from\\s+["']([^"']+)["']`, 'i');
        const importMatch = f.content.match(importRegex);
        let importPath = importMatch ? importMatch[1] : "";
        
        if (importPath.startsWith(".")) {
          const dirParts = f.path.split(/[/\\]/);
          dirParts.pop();
          const dir = dirParts.join("/");
          
          const absolutePathParts = [...dirParts];
          const relativeParts = importPath.split("/");
          for (const part of relativeParts) {
            if (part === ".") continue;
            if (part === "..") {
              absolutePathParts.pop();
            } else {
              absolutePathParts.push(part);
            }
          }
          importPath = absolutePathParts.join("/");
        }

        routes.push({
          routePath,
          componentName,
          importPath: importPath || `src/components/${componentName}`
        });
      }
    }
  });

  // 5. Exclude SPA entrypoints and truly unused files
  const filesToExclude = [
    "index.html",
    "src/main.tsx",
    "src/main.jsx",
    "src/index.tsx",
    "src/index.jsx",
    "src/index.js",
    "src/main.js"
  ];

  // Process existing files
  files.forEach(f => {
    const analysis = depAnalysis.find(da => da.path === f.path);
    
    // Deleting build entrypoints is expected for Vite -> Next
    if (filesToExclude.includes(f.path)) {
      return; 
    }

    // Prioritize file preservation over aggressive cleanup.
    // If a file is analyzed as unused/orphan, we keep it and flag it for manual review.
    if (analysis && analysis.isUnused) {
      manualReviews.push(`Orphan File: ${f.path} is not referenced anywhere, but was preserved in the project for manual review.`);
    }

    let content = f.content;
    let path = f.path;

    // Convert env variables in source code
    content = content.replace(/import\.meta\.env\.VITE_/g, "process.env.NEXT_PUBLIC_");
    content = content.replace(/import\.meta\.env\.REACT_APP_/g, "process.env.NEXT_PUBLIC_");
    content = content.replace(/process\.env\.VITE_/g, "process.env.NEXT_PUBLIC_");
    content = content.replace(/process\.env\.REACT_APP_/g, "process.env.NEXT_PUBLIC_");

    // Convert React Router to Next.js Router
    if (path.endsWith(".tsx") || path.endsWith(".jsx") || path.endsWith(".ts") || path.endsWith(".js")) {
      content = transformReactRouterImportsAndHooks(content, path);
      
      // Inject "use client" if it uses client hooks or state
      if (checkRequiresClientDirective(content, path) && !content.trim().startsWith('"use client"') && !content.trim().startsWith("'use client'")) {
        content = `"use client";\n\n${content}`;
      }
    }

    resultFiles.push({ path, content });
  });

  // 6. Handle App routing and entry points
  if (routes.length > 0) {
    routes.forEach(route => {
      let pagePath = "";
      let depth = 1;
      
      if (route.routePath === "/" || route.routePath === "") {
        pagePath = `app/page.${extension}`;
        depth = 1;
      } else {
        let cleanRoute = route.routePath.replace(/^\/|\/$/g, "");
        cleanRoute = cleanRoute.replace(/:([a-zA-Z0-9_]+)/g, "[$1]");
        pagePath = `app/${cleanRoute}/page.${extension}`;
        depth = cleanRoute.split("/").length + 1;
      }

      const relativeBack = "../".repeat(depth);
      let relativeImport = route.importPath;
      
      if (!relativeImport.startsWith("src/") && !relativeImport.startsWith("components/")) {
        const matchedFile = files.find(f => f.path.includes(relativeImport));
        if (matchedFile) {
          relativeImport = matchedFile.path.replace(/\.[^/.]+$/, "");
        }
      }

      const componentImportPath = `${relativeBack}${relativeImport}`;
      const pageContent = `"use client";\n\nimport React from "react";\nimport ${route.componentName} from "${componentImportPath}";\n\nexport default function Page() {\n  return <${route.componentName} />;\n}\n`;
      
      const existingPageIndex = resultFiles.findIndex(rf => rf.path === pagePath);
      if (existingPageIndex >= 0) {
        resultFiles[existingPageIndex].content = pageContent;
      } else {
        resultFiles.push({ path: pagePath, content: pageContent });
      }
    });
  }

  // Ensure app/page.tsx is present
  const hasRootPage = resultFiles.some(f => f.path === `app/page.tsx` || f.path === `app/page.jsx`);
  if (!hasRootPage) {
    const appFile = files.find(f => f.path === "src/App.tsx" || f.path === "src/App.jsx" || f.path === "src/App.js");
    let rootPageContent = "";
    if (appFile) {
      // Option A: Keep src/App.tsx and import it from app/page.tsx to avoid duplication and build compile issues
      const relativeBack = "../";
      const appPathWithoutExt = appFile.path.replace(/\.[^/.]+$/, "");
      rootPageContent = `"use client";\n\nimport React from "react";\nimport App from "${relativeBack}${appPathWithoutExt}";\n\nexport default function Page() {\n  return <App />;\n}\n`;
    } else {
      rootPageContent = `import React from "react";\n\nexport default function Page() {\n  return (\n    <div className="flex flex-col items-center justify-center min-h-screen py-2">\n      <main className="flex flex-col items-center justify-center flex-1 px-20 text-center">\n        <h1 className="text-6xl font-bold">\n          Welcome to <a className="text-blue-600" href="https://nextjs.org">Next.js!</a>\n        </h1>\n      </main>\n    </div>\n  );\n}\n`;
    }
    resultFiles.push({ path: `app/page.${extension}`, content: rootPageContent });
  }

  // Create app/layout.tsx
  const hasLayout = resultFiles.some(f => f.path === `app/layout.tsx` || f.path === `app/layout.jsx`);
  if (!hasLayout) {
    const cssFile = files.find(f => f.path.endsWith("index.css") || f.path.endsWith("global.css") || f.path.endsWith("App.css"));
    let cssImport = "";
    if (cssFile) {
      cssImport = `import "../${cssFile.path}";\n`;
    }

    const layoutContent = `import React from "react";\nimport { Metadata } from "next";\n${cssImport}\nexport const metadata: Metadata = {\n  title: "Migrated Next.js App",\n  description: "Automatically migrated from React TS",\n};\n\nexport default function RootLayout({\n  children,\n}: {\n  children: React.ReactNode;\n}) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  );\n}\n`;
    resultFiles.push({ path: `app/layout.${extension}`, content: layoutContent });
  }

  // 7. Update package.json details
  if (pkgFile) {
    pkgData.dependencies = pkgData.dependencies || {};
    pkgData.devDependencies = pkgData.devDependencies || {};

    delete pkgData.devDependencies["vite"];
    delete pkgData.devDependencies["@vitejs/plugin-react"];
    delete pkgData.devDependencies["react-scripts"];
    delete pkgData.dependencies["react-router-dom"];

    pkgData.dependencies["next"] = "^14.0.0";
    
    if (!pkgData.dependencies["react"]) pkgData.dependencies["react"] = "^18.2.0";
    if (!pkgData.dependencies["react-dom"]) pkgData.dependencies["react-dom"] = "^18.2.0";

    pkgData.scripts = {
      "dev": "next dev",
      "build": "next build",
      "start": "next start",
      "lint": "next lint"
    };

    delete pkgData.scripts["eject"];

    const pkgIndex = resultFiles.findIndex(rf => rf.path === "package.json");
    const newPkgContent = JSON.stringify(pkgData, null, 2);
    if (pkgIndex >= 0) {
      resultFiles[pkgIndex].content = newPkgContent;
    } else {
      resultFiles.push({ path: "package.json", content: newPkgContent });
    }
  }

  // 8. Generate Next configs
  const hasNextConfig = resultFiles.some(rf => rf.path === "next.config.js" || rf.path === "next.config.ts");
  if (!hasNextConfig) {
    resultFiles.push({
      path: "next.config.js",
      content: `/** @type {import('next').NextConfig} */\nconst nextConfig = {\n  reactStrictMode: true,\n};\n\nmodule.exports = nextConfig;\n`
    });
  }

  if (isTypeScript) {
    const hasNextEnv = resultFiles.some(rf => rf.path === "next-env.d.ts");
    if (!hasNextEnv) {
      resultFiles.push({
        path: "next-env.d.ts",
        content: `/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n\n// NOTE: This file should not be edited\n// See https://nextjs.org/docs/basic-features/typescript for more information.\n`
      });
    }

    const tsconfigFile = files.find(rf => rf.path === "tsconfig.json");
    let tsconfigData: any = {};
    if (tsconfigFile) {
      try {
        tsconfigData = JSON.parse(tsconfigFile.content);
      } catch (e) {
        tsconfigData = {};
      }
    }
    tsconfigData.compilerOptions = tsconfigData.compilerOptions || {};
    tsconfigData.compilerOptions.target = tsconfigData.compilerOptions.target || "es5";
    tsconfigData.compilerOptions.lib = ["dom", "dom.iterable", "esnext"];
    tsconfigData.compilerOptions.allowJs = true;
    tsconfigData.compilerOptions.skipLibCheck = true;
    tsconfigData.compilerOptions.strict = tsconfigData.compilerOptions.strict ?? true;
    tsconfigData.compilerOptions.noEmit = true;
    tsconfigData.compilerOptions.esModuleInterop = true;
    tsconfigData.compilerOptions.module = "esnext";
    tsconfigData.compilerOptions.moduleResolution = "node";
    tsconfigData.compilerOptions.resolveJsonModule = true;
    tsconfigData.compilerOptions.isolatedModules = true;
    tsconfigData.compilerOptions.jsx = "preserve";
    tsconfigData.compilerOptions.incremental = true;
    
    tsconfigData.compilerOptions.plugins = tsconfigData.compilerOptions.plugins || [];
    if (!tsconfigData.compilerOptions.plugins.some((p: any) => p.name === "next")) {
      tsconfigData.compilerOptions.plugins.push({ name: "next" });
    }

    tsconfigData.include = ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"];
    tsconfigData.exclude = ["node_modules"];

    const tsconfigIndex = resultFiles.findIndex(rf => rf.path === "tsconfig.json");
    const newTsconfigContent = JSON.stringify(tsconfigData, null, 2);
    if (tsconfigIndex >= 0) {
      resultFiles[tsconfigIndex].content = newTsconfigContent;
    } else {
      resultFiles.push({ path: "tsconfig.json", content: newTsconfigContent });
    }
  }

  // 9. Append the internal dependency metadata json file
  resultFiles.push({
    path: ".migration_metadata.json",
    content: JSON.stringify({ depAnalysis, manualReviews })
  });

  return resultFiles;
}
