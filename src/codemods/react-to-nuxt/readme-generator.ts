/**
 * Converts a React/Vite-based project README into a Nuxt 3-based project README.
 * Uses 100% regex-free string splits and joins to transform documentation content.
 */
export function transformReadmeToNuxt(content: string): string {
  let output = content;
  
  const replacements = [
    // Multi-word specific ecosystem library translations first to prevent generic collisions
    ["React Hook Form", "VeeValidate Form Builder"],
    ["react-hook-form", "vee-validate"],
    ["Redux Toolkit", "Pinia State Management"],
    ["redux-toolkit", "pinia"],
    ["Create React App", "Nuxt 3 App Setup"],
    ["React Router", "Nuxt Pages & Directory Routing"],
    ["react-router-dom", "vue-router"],
    ["React Query", "Nuxt useFetch / useAsyncData"],
    ["react-query", "nuxt"],
    ["Zustand", "Pinia Stores"],
    ["zustand", "pinia"],
    ["Formik", "VeeValidate Form Handling"],
    ["formik", "vee-validate"],
    
    // Generic framework/build translations
    ["React", "Nuxt 3"],
    ["react", "nuxt"],
    ["Vite", "Nuxt 3"],
    ["vite", "nuxt"],
    ["Redux", "Pinia"],
    ["redux", "pinia"],
    ["Hooks", "Composables"],
    ["hooks", "composables"],
    ["npm run dev", "npm run dev (using Nuxt Dev Server)"],
    ["npm run build", "npm run build (using Nuxt Build)"],
  ];
  
  replacements.forEach(([from, to]) => {
    output = output.split(from).join(to);
  });
  
  // Append Nuxt architectural notes
  const nuxtGuide = `

## Nuxt 3 Architecture & Migration Notes
- **Auto-Imports**: All custom composables located in the \`composables/\` folder (e.g., \`useExpenses\`) and standard Vue APIs (\`ref\`, \`computed\`, \`watch\`) are auto-imported by Nuxt. No explicit import statements are required in your component files.
- **Routing**: React Router declarations have been migrated to Nuxt's filesystem-based routing located in the \`pages/\` directory.
- **State Management**: Redux/Zustand slice states are migrated to Pinia Stores.
- **SSR & Hydration**: Nuxt 3 supports Server-Side Rendering (SSR) out of the box. Ensure any browser-only APIs (like \`window\` or \`localStorage\`) are safely wrapped in client-only checks (e.g. \`import.meta.client\` or within composable triggers).
- **Layouts**: General layouts are placed in the \`layouts/\` directory and can be used declaratively.
`;

  output += nuxtGuide;
  
  return output;
}
