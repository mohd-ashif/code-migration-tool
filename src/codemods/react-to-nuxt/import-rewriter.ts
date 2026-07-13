import { ReactImport } from "./semantic-analyzer";

export function rewriteImports(
  imports: ReactImport[],
  options?: { extraVueImports?: string[] }
): string[] {
  const rewritten: string[] = [];

  imports.forEach((imp) => {
    let mod = imp.moduleSpecifier;

    // 1. Remove React / ReactDOM
    if (
      mod === "react" ||
      mod === "react-dom" ||
      mod === "react-dom/client" ||
      mod.startsWith("react/jsx-runtime") ||
      mod.startsWith("react-dom/")
    ) {
      return;
    }

    // 1.5. Remove relative imports of custom composables & components since Nuxt auto-imports them
    if (mod.startsWith(".")) {
      if (mod.includes("/components/") || mod.includes("\\components\\") || mod.endsWith("Form.vue") || mod.endsWith("List.vue")) {
        return;
      }
      let isComposableImport = false;
      if (imp.defaultImport && imp.defaultImport.startsWith("use")) {
        isComposableImport = true;
      }
      if (imp.namedImports && imp.namedImports.length > 0) {
        if (imp.namedImports.some((name) => name.startsWith("use"))) {
          isComposableImport = true;
        }
      }
      if (isComposableImport) {
        return;
      }
    }

    // 2. Remove react-router-dom as Nuxt uses filesystem routing + built-in components/methods
    if (mod === "react-router-dom") {
      return;
    }

    // 3. Rewrite local file imports (e.g., .tsx / .jsx -> .vue)
    if (mod.startsWith(".") && (mod.endsWith(".tsx") || mod.endsWith(".jsx"))) {
      mod = mod.replace(/\.(tsx|jsx)$/, ".vue");
    } else if (
      mod.startsWith(".") &&
      !mod.endsWith(".ts") &&
      !mod.endsWith(".css") &&
      !mod.endsWith(".js") &&
      !mod.endsWith(".json") &&
      !mod.endsWith(".vue")
    ) {
      const pathParts = mod.split("/");
      const fileName = pathParts[pathParts.length - 1];
      if (/^[A-Z]/.test(fileName)) {
        mod = `${mod}.vue`;
      }
    }

    // Reconstruct imports filtering out Nuxt 3 auto-imports
    let named = imp.namedImports ? [...imp.namedImports] : [];
    if (mod === "vue" || mod === "nuxt" || mod === "#app" || mod === "@vue/runtime-core") {
      const autoImports = [
        "ref", "computed", "watch", "watchEffect", 
        "onMounted", "onUnmounted", "navigateTo", 
        "useFetch", "useAsyncData", "useRoute", "useRouter", "inject", "provide"
      ];
      named = named.filter((n) => !autoImports.includes(n));
      if (named.length === 0 && !imp.defaultImport) {
        return;
      }
    }

    if (imp.defaultImport) {
      if (named.length > 0) {
        rewritten.push(`import ${imp.defaultImport}, { ${named.join(", ")} } from "${mod}";`);
      } else {
        rewritten.push(`import ${imp.defaultImport} from "${mod}";`);
      }
    } else if (named.length > 0) {
      rewritten.push(`import { ${named.join(", ")} } from "${mod}";`);
    } else if (imp.namespaceImport) {
      rewritten.push(`import * as ${imp.namespaceImport} from "${mod}";`);
    } else {
      rewritten.push(`import "${mod}";`);
    }
  });

  return rewritten;
}
