import * as ts from "typescript";
import { SvelteComponentIR } from "./ir-builder";
import { transformProps } from "./props-transformer";
import { transformStateSetters } from "./state-transformer";
import { transformRefs } from "./hooks-transformer";
import { transformLifecycle } from "./lifecycle-transformer";
import { transformContextUsage } from "./context-transformer";
import { transformStores } from "./store-transformer";
import { transformRouterNavigation } from "./router-transformer";
import { rewriteImports } from "./import-rewriter";
import { transformJSXToSvelteTemplate } from "./jsx-transformer";
import { generateSvelteStyleBlock } from "./style-transformer";

export function generateSvelteComponent(ir: SvelteComponentIR, sourceFile: ts.SourceFile): string {
  const storeImports = new Set<string>();
  const storeDeclarations = new Set<string>();
  const routerImports = new Set<string>();
  const extraSvelteImports = new Set<string>();

  // 1. Convert props
  const propsCode = transformProps(ir.props);

  // 2. Convert state & refs declarations
  const statesCode = ir.states.map((s) => {
    const typeAnnotation = s.type && s.type !== "any" ? `: ${s.type}` : "";
    return `let ${s.name}${typeAnnotation} = ${s.defaultValue};`;
  });
  const refsCode = ir.refs.map((r) => `let ${r.name} = ${r.defaultValue};`);

  // 3. Convert lifecycle
  const lifecycleRes = transformLifecycle(ir.effects);
  lifecycleRes.imports.forEach((imp) => extraSvelteImports.add(imp));

  // 4. Convert context usage
  const contextRes = transformContextUsage(ir.contexts);
  contextRes.imports.forEach((imp) => extraSvelteImports.add(imp));

  // 5. Transform method bodies
  const transformedMethods = ir.methods.map((m) => {
    let body = m.body;

    // Apply code transformations
    body = transformStateSetters(body, ir.states);
    body = transformRefs(body, ir.refs);

    // Apply store transforms
    const storeRes = transformStores(body, ir.stores);
    body = storeRes.code;
    storeRes.storeImports.forEach((imp) => storeImports.add(imp));
    storeRes.storeDeclarations.forEach((dec) => storeDeclarations.add(dec));

    // Apply router navigation
    const routerRes = transformRouterNavigation(body);
    body = routerRes.code;
    routerRes.routerImports.forEach((imp) => routerImports.add(imp));

    return body;
  });

  // 6. Transform effect calls
  const transformedEffects = lifecycleRes.calls.map((call) => {
    let body = call;

    // Apply code transformations
    body = transformStateSetters(body, ir.states);
    body = transformRefs(body, ir.refs);

    // Apply store transforms
    const storeRes = transformStores(body, ir.stores);
    body = storeRes.code;
    storeRes.storeImports.forEach((imp) => storeImports.add(imp));
    storeRes.storeDeclarations.forEach((dec) => storeDeclarations.add(dec));

    // Apply router navigation
    const routerRes = transformRouterNavigation(body);
    body = routerRes.code;
    routerRes.routerImports.forEach((imp) => routerImports.add(imp));

    return body;
  });
  // 6a. Transform callback hooks to standard helper functions
  const callbacksCode = ir.callbacks.map((c) => {
    let body = c.body;
    body = transformStateSetters(body, ir.states);
    body = transformRefs(body, ir.refs);
    const storeRes = transformStores(body, ir.stores);
    body = storeRes.code;
    const routerRes = transformRouterNavigation(body);
    body = routerRes.code;
    return `const ${c.name} = ${body};`;
  });

  // 6b. Transform memo hooks to Svelte reactive declarations
  const memosCode = ir.memos.map((m) => {
    let body = m.body;
    body = transformStateSetters(body, ir.states);
    body = transformRefs(body, ir.refs);
    const storeRes = transformStores(body, ir.stores);
    body = storeRes.code;
    const routerRes = transformRouterNavigation(body);
    body = routerRes.code;

    // Try to extract a clean expression from the arrow function (e.g., () => number * 2)
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

    return `$: ${m.name} = ${expr};`;
  });

  // 7. Rewrite imports
  const rewrittenImports = rewriteImports(ir.imports, {
    extraSvelteImports: Array.from(extraSvelteImports),
  });

  // 8. Add router and store imports
  if (routerImports.size > 0) {
    rewrittenImports.push(`import { ${Array.from(routerImports).join(", ")} } from "svelte-routing";`);
  }
  storeImports.forEach((imp) => rewrittenImports.push(imp));

  // 9. Generate template & style block
  const svelteTemplate = transformJSXToSvelteTemplate(ir.jsxNode, sourceFile, ir.styledComponents);
  const styleBlock = generateSvelteStyleBlock(ir.styledComponents);

  // 10. Inject Portal action if portal rendering was triggered in the template
  if (svelteTemplate.includes("use:portal")) {
    transformedMethods.push(`
  function portal(node: HTMLElement, target: HTMLElement | null) {
    if (!target) return;
    target.appendChild(node);
    return {
      destroy() {
        if (node.parentNode) node.parentNode.removeChild(node);
      }
    };
  }
    `);
  }

  // 11. Assemble everything
  const scriptBlocks = [
    ...rewrittenImports,
    "",
    // Extra top-level helper statements & types (like interfaces)
    ...ir.extraStatements,
    "",
    // Props
    ...propsCode,
    "",
    // States & Refs
    ...statesCode,
    ...refsCode,
    "",
    // Memos & Callbacks
    ...memosCode,
    ...callbacksCode,
    "",
    // Context declarations
    ...contextRes.declarations,
    "",
    // Store declarations
    ...Array.from(storeDeclarations),
    "",
    // Lifecycle variables (e.g. cleanup hooks)
    ...lifecycleRes.declarations,
    "",
    // Lifecycle hooks
    ...transformedEffects,
    "",
    // Methods
    ...transformedMethods,
  ];

  // Filter out empty lines cleanly
  const scriptBody = scriptBlocks
    .filter((line, i, arr) => line.trim() !== "" || (arr[i - 1] && arr[i - 1].trim() !== ""))
    .join("\n  ");

  return `<script lang="ts">
  ${scriptBody.trim()}
</script>

${svelteTemplate.trim()}

${styleBlock.trim()}
`;
}
