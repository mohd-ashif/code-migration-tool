import { ParsedFile } from "../../types/parser.types";
import { transformVueSFCToJSX } from "../vue/vue-sfc-to-jsx";

interface NuxtPageInfo {
  originalPath: string;
  targetPath: string;
  componentName: string;
}

export async function migrateNuxtToNext(files: ParsedFile[]): Promise<ParsedFile[]> {
  const resultFiles: ParsedFile[] = [];
  const pages: NuxtPageInfo[] = [];

  // 1. Scan and map Nuxt pages directory to Next.js App Router layout
  files.forEach(f => {
    // E.g. pages/dashboard.vue or pages/about/index.vue
    const pageMatch = f.path.match(/^pages\/([\s\S]*?)\.(vue|js|ts)$/i);
    if (pageMatch) {
      const sub = pageMatch[1];
      let targetPath = "";
      let componentName = "PageComponent";

      if (sub === "index") {
        targetPath = "app/page.tsx";
        componentName = "IndexPage";
      } else {
        const cleanSub = sub.replace(/\/index$/, "");
        targetPath = `app/${cleanSub}/page.tsx`;
        componentName = cleanSub
          .split("/")
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join("") + "Page";
      }

      pages.push({
        originalPath: f.path,
        targetPath,
        componentName
      });
    }
  });

  // 2. Loop and transform project files
  files.forEach(f => {
    // Exclude Nuxt configuration files
    if (f.path === "nuxt.config.ts" || f.path === "nuxt.config.js" || f.path.startsWith(".nuxt/")) {
      return;
    }

    let content = f.content;
    let path = f.path;

    // Check if it is a page component we are mapping to app/
    const pageMap = pages.find(p => p.originalPath === f.path);
    if (pageMap) {
      path = pageMap.targetPath;
      if (f.path.endsWith(".vue")) {
        content = transformVueSFCToJSX(content);
        // Ensure export default function matches target name
        content = content.replace(/export\s+default\s+function\s+\w+\(\)/g, `export default function ${pageMap.componentName}()`);
      }
    } else if (f.path.startsWith("layouts/default.vue")) {
      // Convert default layout to Next.js app/layout.tsx
      path = "app/layout.tsx";
      content = transformVueSFCToJSX(content);
      content = content.replace("export default function VueMigratedComponent", "export default function RootLayout");
      // Add standard html layout wrapper tags around return JSX
      content = content.replace(/return\s*\(\s*([\s\S]*?)\s*\);/i, (m, jsx) => {
        return `return (\n    <html lang="en">\n      <body>\n        ${jsx.trim()}\n      </body>\n    </html>\n  );`;
      });
    }

    // Convert Nuxt environment variables (NUXT_PUBLIC_ -> NEXT_PUBLIC_)
    content = content.replace(/NUXT_PUBLIC_/g, "NEXT_PUBLIC_");

    resultFiles.push({ path, content });
  });

  // Ensure app/layout.tsx exists if missing
  const hasRootLayout = resultFiles.some(rf => rf.path === "app/layout.tsx");
  if (!hasRootLayout) {
    const layoutContent = `import React from 'react';\n\nexport const metadata = {\n  title: 'Migrated Nuxt App',\n  description: 'Automatically migrated to Next.js App Router',\n};\n\nexport default function RootLayout({\n  children,\n}: {\n  children: React.ReactNode;\n}) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  );\n}\n`;
    resultFiles.push({ path: "app/layout.tsx", content: layoutContent });
  }

  // Ensure app/page.tsx exists if missing
  const hasRootPage = resultFiles.some(rf => rf.path === "app/page.tsx");
  if (!hasRootPage) {
    const rootPageContent = `import React from 'react';\n\nexport default function Home() {\n  return (\n    <div>\n      <h1>Welcome to Next.js!</h1>\n    </div>\n  );\n}\n`;
    resultFiles.push({ path: "app/page.tsx", content: rootPageContent });
  }

  // 3. Create package.json configuration
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

  delete pkgData.dependencies["nuxt"];

  pkgData.dependencies["next"] = "^14.0.0";
  pkgData.dependencies["react"] = "^18.2.0";
  pkgData.dependencies["react-dom"] = "^18.2.0";
  pkgData.devDependencies["typescript"] = "^5.0.0";
  pkgData.devDependencies["@types/react"] = "^18.2.0";

  pkgData.scripts = {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  };

  const newPkgContent = JSON.stringify(pkgData, null, 2);
  const pkgIndex = resultFiles.findIndex(rf => rf.path === "package.json");
  if (pkgIndex >= 0) {
    resultFiles[pkgIndex].content = newPkgContent;
  } else {
    resultFiles.push({ path: "package.json", content: newPkgContent });
  }

  resultFiles.push({
    path: "next.config.js",
    content: `/** @type {import('next').NextConfig} */\nconst nextConfig = {\n  reactStrictMode: true,\n};\n\nmodule.exports = nextConfig;\n`
  });

  return resultFiles;
}
