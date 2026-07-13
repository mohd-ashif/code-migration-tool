export function generatePackageJson(originalPackageJsonContent: string): string {
  try {
    const pkg = JSON.parse(originalPackageJsonContent);

    // 1. Remove React/Next dependencies
    const reactDeps = [
      "react",
      "react-dom",
      "react-router-dom",
      "@types/react",
      "@types/react-dom",
      "react-scripts",
      "styled-components",
      "emotion",
      "formik",
      "react-hook-form",
      "redux",
      "react-redux",
      "@reduxjs/toolkit",
      "@vitejs/plugin-react",
      "@vitejs/plugin-react-swc",
    ];

    if (pkg.dependencies) {
      reactDeps.forEach((dep) => {
        delete pkg.dependencies[dep];
      });
    }

    if (pkg.devDependencies) {
      reactDeps.forEach((dep) => {
        delete pkg.devDependencies[dep];
      });
    }

    // 2. Add Nuxt 3 / Vue / Pinia dependencies
    pkg.dependencies = {
      ...pkg.dependencies,
      vue: "^3.4.0",
      nuxt: "^3.9.0",
      pinia: "^2.1.7",
      "@pinia/nuxt": "^0.5.1",
    };

    pkg.devDependencies = {
      ...pkg.devDependencies,
      typescript: "^5.3.0",
    };

    // 3. Update build scripts for Nuxt
    pkg.scripts = {
      ...pkg.scripts,
      dev: "nuxt dev",
      build: "nuxt build",
      generate: "nuxt generate",
      preview: "nuxt preview",
      postinstall: "nuxt prepare",
    };

    return JSON.stringify(pkg, null, 2);
  } catch (err) {
    // Return standard template
    return `{
  "name": "nuxt-migrated-app",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "nuxt build",
    "dev": "nuxt dev",
    "generate": "nuxt generate",
    "preview": "nuxt preview",
    "postinstall": "nuxt prepare"
  },
  "dependencies": {
    "vue": "^3.4.0",
    "nuxt": "^3.9.0",
    "pinia": "^2.1.7",
    "@pinia/nuxt": "^0.5.1"
  },
  "devDependencies": {
    "typescript": "^5.3.0"
  }
}
`;
  }
}
