import * as ts from "typescript";

export interface StoreTransformationResult {
  code: string;
  storeImports: string[];
  storeDeclarations: string[];
}

export function transformStores(
  code: string,
  stores: Array<{ storeName: string; variableName: string; selector?: string }>
): StoreTransformationResult {
  const storeImports: string[] = [];
  const storeDeclarations: string[] = [];
  let transformed = code;

  // 1. Remove useDispatch initializer: const dispatch = useDispatch();
  transformed = transformed.replace(/const\s+\w+\s*=\s*useDispatch\(\s*\);?/g, "");

  // 2. Remove useSelector lines: const value = useSelector(...)
  // We do this by searching for the assignment and replacing it with empty space,
  // since we will declare it reactively as $: value = $valueStore;
  stores.forEach((store) => {
    // Escape selector pattern for regex safety or match call pattern
    const pattern = new RegExp(
      `const\\s+\\b${store.variableName}\\b\\s*=\\s*(useSelector|useStore)\\([\\s\\S]*?\\);?`,
      "g"
    );
    transformed = transformed.replace(pattern, "");

    // 3. Create Svelte store bindings
    let sliceName = "app";
    if (store.selector) {
      // Try to parse slice name from state => state.counter.value or state => state.counter
      const match = store.selector.match(/state\s*=>\s*state\.(\w+)/);
      if (match) {
        sliceName = match[1];
      }
    }
    const storeName = `${sliceName}Store`;

    storeImports.push(`import { ${storeName} } from "../stores";`);
    
    // To preserve references to the local variable inside helper methods,
    // we declare a Svelte reactive assignment: $: count = $counterStore;
    storeDeclarations.push(`$: ${store.variableName} = $${storeName};`);
  });

  return {
    code: transformed,
    storeImports: Array.from(new Set(storeImports)),
    storeDeclarations,
  };
}
