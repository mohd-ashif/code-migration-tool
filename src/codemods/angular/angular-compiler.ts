import { ParsedFile } from "../../types/parser.types";
import * as ts from "typescript";
import { transformAngularToReact } from "./angular-class-to-function";

interface AngularComponentInfo {
  className: string;
  templateUrl?: string;
  templateContent?: string;
  styleUrls: string[];
  tsPath: string;
}

export async function migrateAngularToReact(files: ParsedFile[]): Promise<ParsedFile[]> {
  const resultFiles: ParsedFile[] = [];
  const components: AngularComponentInfo[] = [];
  
  // 1. Scan for component metadata details
  files.forEach(f => {
    if (f.path.endsWith(".component.ts")) {
      const sourceFile = ts.createSourceFile(f.path, f.content, ts.ScriptTarget.Latest, true);
      let className = "";
      let templateUrl = "";
      let templateContent = "";
      const styleUrls: string[] = [];

      function visit(node: ts.Node) {
        if (ts.isClassDeclaration(node) && node.name) {
          className = node.name.text;
        }
        if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
          const key = node.name.text;
          if (key === "templateUrl" && ts.isStringLiteral(node.initializer)) {
            templateUrl = node.initializer.text;
          }
          if (key === "template" && ts.isStringLiteral(node.initializer)) {
            templateContent = node.initializer.text;
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(sourceFile);

      if (className) {
        components.push({
          className,
          templateUrl,
          templateContent,
          styleUrls,
          tsPath: f.path
        });
      }
    }
  });

  // 2. Compile HTML templates and TS component classes
  files.forEach(f => {
    // Exclude HTML template files from direct copy since they are compiled into React components
    const isComponentHtml = components.some(c => c.templateUrl && f.path.endsWith(c.templateUrl.replace("./", "")));
    if (isComponentHtml) return;

    let content = f.content;
    let path = f.path;

    if (f.path.endsWith(".component.ts")) {
      const compInfo = components.find(c => c.tsPath === f.path);
      if (compInfo) {
        let compiledTemplate = compInfo.templateContent || "";
        
        // If template is in separate HTML file, fetch it
        if (compInfo.templateUrl) {
          const htmlFilename = compInfo.templateUrl.split("/").pop() || "";
          const htmlFile = files.find(hf => hf.path.endsWith(htmlFilename));
          if (htmlFile) {
            compiledTemplate = htmlFile.content;
          }
        }

        // Reconstruct inline decorator template inside .ts file so transformAngularToReact compiles it
        const decoratedSource = `@Component({ template: \`${compiledTemplate}\` }) export class ${compInfo.className} { ${f.content.substring(f.content.indexOf("{") + 1)}`;
        content = transformAngularToReact(decoratedSource);
        path = f.path.replace(/\.ts$/, ".tsx");
      }
    } else if (f.path.endsWith(".service.ts")) {
      // Compile Angular Service to React Custom Hook
      content = content.replace(/@Injectable\([\s\S]*?\)\s*export class\s+(\w+)\s*\{([\s\S]*?)\}/i, (match, className, body) => {
        const hookName = `use${className.replace("Service", "")}`;
        return `export function ${hookName}() {\n  ${body.trim()}\n}`;
      });
      content = content.replace(/import\s+{[^}]+?Injectable[^}]*?}\s+from\s+['"]@angular\/core['"];?/g, "");
    }

    resultFiles.push({ path, content });
  });

  // 3. Create entrypoint files for React SPA
  const mainComponent = components[0]?.className || "AppComponent";
  const mainFilename = components[0]?.tsPath.split("/").pop()?.replace(/\.ts$/, "") || "app.component";

  const appContent = `import React from 'react';\nimport ${mainComponent} from "./${mainFilename}";\n\nexport default function App() {\n  return <${mainComponent} />;\n}\n`;
  resultFiles.push({ path: "src/App.tsx", content: appContent });

  const mainContent = `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\nimport './index.css';\n\nReactDOM.createRoot(document.getElementById('root')!).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);\n`;
  resultFiles.push({ path: "src/main.tsx", content: mainContent });

  const htmlContent = `<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Angular Migrated to React</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n`;
  resultFiles.push({ path: "index.html", content: htmlContent });

  // 4. Generate package.json configuration
  const pkgFile = files.find(f => f.path === "package.json");
  let pkgData: any = {};
  if (pkgFile) {
    try {
      pkgData = JSON.parse(pkgFile.content);
    } catch (e) {
      pkgData = {};
    }
  }

  pkgData.dependencies = pkgData.dependencies || {};
  pkgData.devDependencies = pkgData.devDependencies || {};

  // Remove Angular dependencies
  Object.keys(pkgData.dependencies).forEach(dep => {
    if (dep.startsWith("@angular/")) {
      delete pkgData.dependencies[dep];
    }
  });

  pkgData.dependencies["react"] = "^18.2.0";
  pkgData.dependencies["react-dom"] = "^18.2.0";
  pkgData.devDependencies["vite"] = "^5.0.0";
  pkgData.devDependencies["@vitejs/plugin-react"] = "^4.0.0";
  pkgData.devDependencies["typescript"] = "^5.0.0";

  pkgData.scripts = {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  };

  const newPkgContent = JSON.stringify(pkgData, null, 2);
  const pkgIndex = resultFiles.findIndex(rf => rf.path === "package.json");
  if (pkgIndex >= 0) {
    resultFiles[pkgIndex].content = newPkgContent;
  } else {
    resultFiles.push({ path: "package.json", content: newPkgContent });
  }

  resultFiles.push({
    path: "vite.config.ts",
    content: `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n});\n`
  });

  return resultFiles;
}
