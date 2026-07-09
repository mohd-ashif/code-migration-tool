import { ReactImport } from "./semantic-analyzer";

export function rewriteImports(
  imports: ReactImport[],
  options?: { extraSvelteImports?: string[] }
): string[] {
  const rewritten: string[] = [];
  const svelteImports = new Set<string>(options?.extraSvelteImports || []);

  imports.forEach((imp) => {
    let mod = imp.moduleSpecifier;

    // 1. Remove React/ReactDOM entirely
    if (
      mod === "react" ||
      mod === "react-dom" ||
      mod === "react-dom/client" ||
      mod.startsWith("react/jsx-runtime") ||
      mod.startsWith("react-dom/")
    ) {
      // Keep any Svelte imports we might map from React, but strip React itself
      const named = imp.namedImports || [];
      named.forEach((n) => {
        if (n === "useState" || n === "useReducer") {
          // useState/useReducer do not need direct Svelte imports (they compile to local variables/stores)
        } else if (n === "useEffect" || n === "useLayoutEffect") {
          // useEffect maps to lifecycle hooks
        } else if (n === "useContext") {
          svelteImports.add("getContext");
        } else if (n === "useRef") {
          // useRef does not need import
        }
      });
      return;
    }

    // 2. Map react-router-dom -> svelte-routing
    if (mod === "react-router-dom") {
      const named = imp.namedImports || [];
      const svelteRouterNamed = named
        .map((n) => {
          if (n === "Routes" || n === "BrowserRouter" || n === "Switch") return "Router";
          if (n === "useNavigate") return "navigate";
          return n;
        })
        .filter((n, index, self) => n !== "" && self.indexOf(n) === index);

      if (svelteRouterNamed.length > 0) {
        rewritten.push(`import { ${svelteRouterNamed.join(", ")} } from "svelte-routing";`);
      }
      return;
    }

    // 3. Rewrite local file imports (e.g., .tsx / .jsx -> .svelte)
    if (mod.startsWith(".") && (mod.endsWith(".tsx") || mod.endsWith(".jsx"))) {
      mod = mod.replace(/\.(tsx|jsx)$/, ".svelte");
    } else if (
      mod.startsWith(".") &&
      !mod.endsWith(".ts") &&
      !mod.endsWith(".css") &&
      !mod.endsWith(".js") &&
      !mod.endsWith(".json")
    ) {
      const pathParts = mod.split("/");
      const fileName = pathParts[pathParts.length - 1];
      // If it starts with capital letter, assume it's a React component
      if (/^[A-Z]/.test(fileName)) {
        mod = `${mod}.svelte`;
      }
    }

    // Reconstruct imports
    if (imp.defaultImport) {
      if (imp.namedImports && imp.namedImports.length > 0) {
        rewritten.push(`import ${imp.defaultImport}, { ${imp.namedImports.join(", ")} } from "${mod}";`);
      } else {
        rewritten.push(`import ${imp.defaultImport} from "${mod}";`);
      }
    } else if (imp.namedImports && imp.namedImports.length > 0) {
      rewritten.push(`import { ${imp.namedImports.join(", ")} } from "${mod}";`);
    } else if (imp.namespaceImport) {
      rewritten.push(`import * as ${imp.namespaceImport} from "${mod}";`);
    } else {
      rewritten.push(`import "${mod}";`);
    }
  });

  // Add consolidated Svelte lifecycle/context imports
  if (svelteImports.size > 0) {
    rewritten.unshift(`import { ${Array.from(svelteImports).join(", ")} } from "svelte";`);
  }

  return rewritten;
}
