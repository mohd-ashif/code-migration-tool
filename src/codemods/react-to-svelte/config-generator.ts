export interface ProjectConfig {
  filename: string;
  content: string;
}

export function generateConfigs(): ProjectConfig[] {
  return [
    {
      filename: "vite.config.ts",
      content: `import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      src: '/src',
    },
  },
});
`,
    },
    {
      filename: "svelte.config.js",
      content: `import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
};
`,
    },
    {
      filename: "tsconfig.json",
      content: `{
  "extends": "@tsconfig/svelte/tsconfig.json",
  "compilerOptions": {
    "target": "ESNext",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "resolveJsonModule": true,
    "allowJs": true,
    "checkJs": true,
    "strict": true,
    "noImplicitAny": false,
    "noEmit": true,
    "moduleResolution": "node",
    "isolatedModules": true,
    "allowSyntheticDefaultImports": true
  },
  "include": ["src/**/*.d.ts", "src/**/*.ts", "src/**/*.js", "src/**/*.svelte"]
}
`,
    },
    {
      filename: ".eslintrc.json",
      content: `{
  "root": true,
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:svelte/recommended"
  ],
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "parserOptions": {
    "sourceType": "module",
    "ecmaVersion": 2020,
    "extraFileExtensions": [".svelte"]
  },
  "env": {
    "browser": true,
    "es2017": true,
    "node": true
  },
  "overrides": [
    {
      "files": ["*.svelte"],
      "parser": "svelte-eslint-parser",
      "parserOptions": {
        "parser": "@typescript-eslint/parser"
      }
    }
  ]
}
`,
    },
    {
      filename: ".prettierrc",
      content: `{
  "useTabs": false,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "plugins": ["prettier-plugin-svelte"],
  "overrides": [
    {
      "files": "*.svelte",
      "options": {
        "parser": "svelte"
      }
    }
  ]
}
`,
    },
  ];
}
