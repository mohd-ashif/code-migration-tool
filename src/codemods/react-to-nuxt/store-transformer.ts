// React -> Nuxt store transformer

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

  // 2. Remove useSelector / useStore declarations
  stores.forEach((store) => {
    const pattern = new RegExp(
      `const\\s+\\b${store.variableName}\\b\\s*=\\s*(useSelector|useStore)\\([\\s\\S]*?\\);?`,
      "g"
    );
    transformed = transformed.replace(pattern, "");

    // 3. Map to Pinia store imports and declarations
    let sliceName = "app";
    if (store.selector) {
      const match = store.selector.match(/state\s*=>\s*state\.(\w+)/);
      if (match) {
        sliceName = match[1];
      }
    }
    const storeFuncName = `use${sliceName.charAt(0).toUpperCase()}${sliceName.slice(1)}Store`;

    storeImports.push(`import { ${storeFuncName} } from "../stores/${sliceName}";`);
    
    // In Vue, we initialize the Pinia store and use computed for dynamic reactive slices
    const storeVarName = `${sliceName}Store`;
    storeDeclarations.push(`const ${storeVarName} = ${storeFuncName}();`);
    storeDeclarations.push(`const ${store.variableName} = computed(() => ${storeVarName}.${store.variableName});`);
  });

  return {
    code: transformed,
    storeImports: Array.from(new Set(storeImports)),
    storeDeclarations,
  };
}
