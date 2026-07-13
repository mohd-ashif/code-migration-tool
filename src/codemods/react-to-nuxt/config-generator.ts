export interface ProjectConfig {
  filename: string;
  content: string;
}

export function generateConfigs(): ProjectConfig[] {
  return [
    {
      filename: "nuxt.config.ts",
      content: `import { defineNuxtConfig } from 'nuxt/config';

export default defineNuxtConfig({
  modules: ['@pinia/nuxt'],
  typescript: {
    strict: true
  },
  devtools: {
    enabled: false
  }
});
`,
    },
    {
      filename: "tsconfig.json",
      content: `{
  "extends": "./.nuxt/tsconfig.json"
}
`,
    },
    {
      filename: ".eslintrc.json",
      content: `{
  "root": true,
  "extends": [
    "eslint:recommended",
    "plugin:vue/vue3-recommended"
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
  "printWidth": 100
}
`,
    },
  ];
}
