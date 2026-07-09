import { ReactEffect } from "./semantic-analyzer";

export interface LifecycleTransformationResult {
  imports: string[];
  calls: string[];
  declarations: string[];
}

export function transformLifecycle(effects: ReactEffect[]): LifecycleTransformationResult {
  const imports = new Set<string>();
  const calls: string[] = [];
  const declarations: string[] = [];

  effects.forEach((eff, index) => {
    const isMount = eff.dependencies.length === 0 && eff.node.arguments.length >= 2; // e.g. useEffect(fn, [])
    const hasDeps = eff.dependencies.length > 0;

    // Determine Svelte equivalents
    if (isMount) {
      imports.add("onMount");
      calls.push(`onMount(() => {
    const cleanup = (${eff.body})();
    if (typeof cleanup === 'function') return cleanup;
  });`);
    } else if (hasDeps) {
      const cleanupVar = `cleanup_effect_${index}`;
      declarations.push(`let ${cleanupVar};`);
      imports.add("onDestroy");
      
      const depsTrigger = eff.dependencies.join("; ");
      calls.push(`$: {
    ${depsTrigger};
    if (${cleanupVar}) ${cleanupVar}();
    ${cleanupVar} = (${eff.body})();
  }`);

      // Register the final cleanup on destroy
      calls.push(`onDestroy(() => {
    if (${cleanupVar}) ${cleanupVar}();
  });`);
    } else {
      // Runs on every update
      imports.add("afterUpdate");
      calls.push(`afterUpdate(() => {
    (${eff.body})();
  });`);
    }
  });

  return {
    imports: Array.from(imports),
    calls,
    declarations,
  };
}
