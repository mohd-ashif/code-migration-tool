// Vue SFC Generator for React -> Nuxt 3
import * as ts from "typescript";
import { NuxtComponentIR } from "./ir-builder";
import { StyledComponent } from "./semantic-analyzer";
import { generateScriptSetup } from "./script-setup-generator";
import { transformJSXToVueTemplate } from "./vue-template-generator";
import { rewriteImports } from "./import-rewriter";
import { transformStateSetters } from "./state-transformer";
import { transformRefs } from "./hooks-transformer";
import { transformLifecycle } from "./hook-transformer";
import { transformStores } from "./store-transformer";
import { transformRouterNavigation } from "./router-transformer";

export function generateVueComponent(ir: NuxtComponentIR, sourceFile: ts.SourceFile): string {
  const storeImports = new Set<string>();
  const storeDeclarations = new Set<string>();
  const routerImports = new Set<string>();
  const extraVueImports = new Set<string>();

  // 1. Generate core script components (defineProps, ref states, inject, etc.)
  const scriptSetupLines = generateScriptSetup(ir);

  // 2. Convert lifecycle hooks (useEffect)
  const lifecycleRes = transformLifecycle(ir.effects);
  lifecycleRes.imports.forEach((imp) => extraVueImports.add(imp));

  // 2.5. Generate Vue template (so dynamically registered methods like submitForm are added to ir.methods first)
  const templateCtx = {
    registerMethod: (name: string, body: string) => {
      if (!ir.methods.some((m) => m.name === name)) {
        ir.methods.push({ name, body, params: [], returnType: "any" });
      }
    },
    emits: ir.emits,
    sourceFile,
    styledComponents: ir.styledComponents
  };
  const vueTemplate = transformJSXToVueTemplate(ir.jsxNode, templateCtx);
  const styleBlock = generateVueStyleBlock(ir.styledComponents);

  // 3. Transform method bodies
  const allStates = [
    ...ir.states,
    ...ir.externalStates.map((name) => ({ name, setter: "", defaultValue: "" })),
    ...ir.stores.map((s) => ({ name: s.variableName, setter: "", defaultValue: "" }))
  ];

  const transformedMethods = ir.methods.map((m) => {
    let body = m.body;
    body = transformStateSetters(body, allStates, ir.emits);
    body = transformRefs(body, ir.refs);
    const storeRes = transformStores(body, ir.stores);
    body = storeRes.code;
    storeRes.storeImports.forEach((imp: string) => storeImports.add(imp));
    storeRes.storeDeclarations.forEach((dec: string) => storeDeclarations.add(dec));
    const routerRes = transformRouterNavigation(body);
    body = routerRes.code;
    routerRes.routerImports.forEach((imp) => routerImports.add(imp));
    return body;
  });

  // 4. Transform lifecycle callbacks
  const transformedEffects = lifecycleRes.calls.map((call) => {
    let body = call;
    body = transformStateSetters(body, allStates, ir.emits);
    body = transformRefs(body, ir.refs);
    const storeRes = transformStores(body, ir.stores);
    body = storeRes.code;
    storeRes.storeImports.forEach((imp: string) => storeImports.add(imp));
    storeRes.storeDeclarations.forEach((dec: string) => storeDeclarations.add(dec));
    const routerRes = transformRouterNavigation(body);
    body = routerRes.code;
    routerRes.routerImports.forEach((imp) => routerImports.add(imp));
    return body;
  });

  // 5. Transform useCallback helpers
  const callbacksCode = ir.callbacks.map((c) => {
    let body = c.body;
    body = transformStateSetters(body, allStates, ir.emits);
    body = transformRefs(body, ir.refs);
    const storeRes = transformStores(body, ir.stores);
    body = storeRes.code;
    const routerRes = transformRouterNavigation(body);
    body = routerRes.code;
    return `const ${c.name} = ${body};`;
  });

  // 6. Transform useMemo variables -> computed()
  const memosCode = ir.memos.map((m) => {
    let body = m.body;
    body = transformStateSetters(body, allStates, ir.emits);
    body = transformRefs(body, ir.refs);
    const storeRes = transformStores(body, ir.stores);
    body = storeRes.code;
    const routerRes = transformRouterNavigation(body);
    body = routerRes.code;

    const arrowMatch = body.match(/^\s*(?:\([^)]*\)|[a-zA-Z_$][\w$]*)\s*=>\s*([\s\S]+)$/);
    let expr = body;
    if (arrowMatch) {
      const inner = arrowMatch[1].trim();
      if (!inner.startsWith("{")) {
        expr = inner;
      } else {
        expr = `(${body})()`;
      }
    } else {
      expr = `(${body})()`;
    }
    return `const ${m.name} = computed(() => ${expr});`;
  });

  // 7. Rewrite imports
  const rewrittenImports = rewriteImports(ir.imports, {
    extraVueImports: Array.from(extraVueImports),
  });

  // 8. Add Pinia store imports
  storeImports.forEach((imp) => rewrittenImports.push(imp));

  // 9. Assemble script setup body
  const scriptBlocks = [
    ...rewrittenImports,
    "",
    // Extra top level statements & types (like interfaces)
    ...ir.extraStatements,
    "",
    // Script setup lines
    ...scriptSetupLines,
    "",
    // Redux/Zustand store declarations
    ...Array.from(storeDeclarations),
    "",
    // Computed Memos
    ...memosCode,
    "",
    // Callbacks
    ...callbacksCode,
    "",
    // Lifecycle watches & effects
    ...transformedEffects,
    "",
    // Custom helper methods
    ...transformedMethods,
  ];

  const scriptBody = scriptBlocks
    .filter((line, i, arr) => line.trim() !== "" || (arr[i - 1] && arr[i - 1].trim() !== ""))
    .join("\n  ");

  return `<script setup lang="ts">
  ${scriptBody.trim()}
</script>

<template>
  ${vueTemplate.trim() || "<div></div>"}
</template>

${styleBlock.trim()}
`;
}

export function generateVueStyleBlock(styledComponents: StyledComponent[]): string {
  if (styledComponents.length === 0) return "";

  const rules = styledComponents.map((sc) => {
    let cleanCss = sc.css;

    if (cleanCss.includes("&")) {
      cleanCss = cleanCss.split("&").join(`.${sc.name}`);
    }

    if (!cleanCss.includes(`.${sc.name}`)) {
      return `.${sc.name} {\n  ${cleanCss.split("\n").join("\n  ")}\n}`;
    }
    return cleanCss;
  });

  return `<style scoped>\n${rules.join("\n\n")}\n</style>`;
}
