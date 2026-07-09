export function generatePackageJson(originalPackageJsonContent: string): string {
  try {
    const pkg = JSON.parse(originalPackageJsonContent);

    // 1. Remove React dependencies
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

    // 2. Add Svelte dependencies
    pkg.dependencies = {
      ...pkg.dependencies,
      svelte: "^4.2.0",
      "svelte-routing": "^2.11.0",
    };

    pkg.devDependencies = {
      ...pkg.devDependencies,
      "@sveltejs/vite-plugin-svelte": "^2.4.5",
      "@tsconfig/svelte": "^5.0.2",
      "svelte-check": "^3.5.2",
      tslib: "^2.6.2",
      typescript: "^5.2.2",
      vite: "^4.4.9",
      eslint: "^8.48.0",
      "eslint-plugin-svelte": "^2.33.0",
      "prettier-plugin-svelte": "^3.0.3",
    };

    // 3. Update build scripts
    pkg.scripts = {
      ...pkg.scripts,
      dev: "vite",
      build: "vite build",
      preview: "vite preview",
      check: "svelte-check --tsconfig ./tsconfig.json",
    };

    return JSON.stringify(pkg, null, 2);
  } catch (err) {
    // If invalid JSON, return a default template Svelte package.json
    return `{
  "name": "svelte-migrated-app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "check": "svelte-check --tsconfig ./tsconfig.json"
  },
  "dependencies": {
    "svelte": "^4.2.0",
    "svelte-routing": "^2.11.0"
  },
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "^2.4.5",
    "@tsconfig/svelte": "^5.0.2",
    "svelte-check": "^3.5.2",
    "tslib": "^2.6.2",
    "typescript": "^5.2.2",
    "vite": "^4.4.9"
  }
}
`;
  }
}
