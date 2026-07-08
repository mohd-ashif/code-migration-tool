import { ParsedFile } from "../../types/parser.types";

interface PageRoute {
  routePath: string;
  componentName: string;
  originalPath: string;
  targetPath: string;
}

export async function migrateNextToReact(files: ParsedFile[], isTypeScript: boolean): Promise<ParsedFile[]> {
  const resultFiles: ParsedFile[] = [];
  const extension = isTypeScript ? "tsx" : "jsx";
  const fileExt = isTypeScript ? "ts" : "js";
  
  const pageRoutes: PageRoute[] = [];
  const filesToExclude = [
    "next.config.js",
    "next.config.ts",
    "next-env.d.ts",
    ".next",
    "app/layout.tsx",
    "app/layout.jsx",
    "app/layout.js"
  ];

  // 1. Scan for Next.js App Router Page files to compile the client-side router
  files.forEach(f => {
    const isPage = f.path.match(/^app\/([\s\S]*?)\/?page\.(tsx|jsx|js)$/i);
    if (isPage) {
      const subPath = isPage[1];
      let routePath = "";
      let componentName = "RootPage";
      
      if (!subPath || subPath === "") {
        routePath = "/";
        componentName = "RootPage";
      } else {
        const cleanSub = subPath.replace(/\/$/, "");
        routePath = `/${cleanSub.replace(/\[(\w+)\]/g, ":$1")}`;
        
        // Convert route path to CamelCase component name
        componentName = cleanSub
          .split("/")
          .map(part => part.replace(/[\[\]]/g, ""))
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join("") + "Page";
      }

      const targetPath = `src/pages/${componentName}.${extension}`;
      pageRoutes.push({
        routePath,
        componentName,
        originalPath: f.path,
        targetPath
      });
    }
  });

  // 2. Loop and transform existing files
  files.forEach(f => {
    const isExcluded = filesToExclude.includes(f.path) || f.path.startsWith(".next/");
    if (isExcluded) return;

    let content = f.content;
    let path = f.path;

    // Check if it is a page component we are mapping to pages/
    const pageMap = pageRoutes.find(pr => pr.originalPath === f.path);
    if (pageMap) {
      path = pageMap.targetPath;
      
      // Make sure component export name is correct
      content = content.replace(/export\s+default\s+function\s+\w+\(\)/g, `export default function ${pageMap.componentName}()`);
      content = content.replace(/export\s+default\s+function\s+Page\(\)/g, `export default function ${pageMap.componentName}()`);
    }

    // Convert code references (Next specifics -> React Router equivalents)
    if (path.endsWith(".tsx") || path.endsWith(".jsx") || path.endsWith(".ts") || path.endsWith(".js")) {
      // Remove "use client" directive
      content = content.replace(/^["']use client["'];?\s*/i, "");

      // Translate Link tag imports
      content = content.replace(/import\s+Link\s+from\s+['"]next\/link['"]/g, "import { Link } from 'react-router-dom'");
      content = content.replace(/<Link\s+([^>]*?)href=/g, "<Link $1to=");

      // Translate Image imports
      content = content.replace(/import\s+Image\s+from\s+['"]next\/image['"]/g, "");
      content = content.replace(/<Image\s+([\s\S]*?)\/?>/g, "<img $1 />");

      // Translate routing hooks
      if (content.includes("useRouter") || content.includes("usePathname") || content.includes("useParams")) {
        // Strip next/navigation imports
        content = content.replace(/import\s+{[^}]*?}\s+from\s+['"]next\/navigation['"]/g, "");
        
        // Inject react-router-dom hook imports
        const routerImports: string[] = [];
        if (content.includes("useRouter")) {
          routerImports.push("useNavigate");
          content = content.replace(/const\s+(\w+)\s*=\s*useRouter\(\)/g, "const $1 = useNavigate()");
          content = content.replace(/(\b\w+)\.push\(([^)]+?)\)/g, (match, routerVar, pathArg) => {
            if (routerVar === "router" || routerVar === "navigate") {
              return `navigate(${pathArg})`;
            }
            return match;
          });
          content = content.replace(/(\b\w+)\.replace\(([^)]+?)\)/g, (match, routerVar, pathArg) => {
            if (routerVar === "router" || routerVar === "navigate") {
              return `navigate(${pathArg}, { replace: true })`;
            }
            return match;
          });
        }
        if (content.includes("useParams")) {
          routerImports.push("useParams");
        }
        if (content.includes("usePathname")) {
          routerImports.push("useLocation");
          content = content.replace(/const\s+(\w+)\s*=\s*usePathname\(\)/g, "const location = useLocation();\n  const $1 = location.pathname;");
        }

        if (routerImports.length > 0) {
          content = `import { ${routerImports.join(", ")} } from 'react-router-dom';\n${content}`;
        }
      }
    }

    resultFiles.push({ path, content });
  });

  // 3. Reconstruct src/App.tsx with the Client Router configuration
  let appRouterImports = `import React from 'react';\nimport { BrowserRouter, Routes, Route } from 'react-router-dom';\n`;
  let appRouterRoutes = "";
  
  pageRoutes.forEach(pr => {
    appRouterImports += `import ${pr.componentName} from "./pages/${pr.componentName}";\n`;
    appRouterRoutes += `        <Route path="${pr.routePath}" element={<${pr.componentName} />} />\n`;
  });

  const appContent = `${appRouterImports}
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
${appRouterRoutes}      </Routes>
    </BrowserRouter>
  );
}
`;
  resultFiles.push({ path: `src/App.${extension}`, content: appContent });

  // 4. Reconstruct src/main.tsx entry point
  const mainContent = `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\nimport './index.css';\n\nReactDOM.createRoot(document.getElementById('root')!).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);\n`;
  resultFiles.push({ path: `src/main.${extension}`, content: mainContent });

  // 5. Reconstruct index.html root file
  const htmlContent = `<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Migrated React SPA</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.${extension}"></script>\n  </body>\n</html>\n`;
  resultFiles.push({ path: "index.html", content: htmlContent });

  // 6. Update package.json to configuration framework dependencies
  let pkgFile = files.find(f => f.path === "package.json");
  if (pkgFile) {
    try {
      const pkgData = JSON.parse(pkgFile.content);
      pkgData.dependencies = pkgData.dependencies || {};
      pkgData.devDependencies = pkgData.devDependencies || {};

      delete pkgData.dependencies["next"];
      
      pkgData.dependencies["react"] = "^18.2.0";
      pkgData.dependencies["react-dom"] = "^18.2.0";
      pkgData.dependencies["react-router-dom"] = "^6.20.0";

      pkgData.devDependencies["vite"] = "^5.0.0";
      pkgData.devDependencies["@vitejs/plugin-react"] = "^4.0.0";
      
      if (isTypeScript) {
        pkgData.devDependencies["typescript"] = "^5.0.0";
        pkgData.devDependencies["@types/react"] = "^18.2.0";
        pkgData.devDependencies["@types/react-dom"] = "^18.2.0";
      }

      pkgData.scripts = {
        "dev": "vite",
        "build": isTypeScript ? "tsc && vite build" : "vite build",
        "preview": "vite preview"
      };

      const existingPkgIndex = resultFiles.findIndex(rf => rf.path === "package.json");
      const newPkgContent = JSON.stringify(pkgData, null, 2);
      if (existingPkgIndex >= 0) {
        resultFiles[existingPkgIndex].content = newPkgContent;
      } else {
        resultFiles.push({ path: "package.json", content: newPkgContent });
      }
    } catch (e) {
      // Ignored
    }
  }

  // 7. Add vite.config.ts / vite.config.js
  resultFiles.push({
    path: `vite.config.${fileExt}`,
    content: isTypeScript 
      ? `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n});\n`
      : `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n});\n`
  });

  return resultFiles;
}
