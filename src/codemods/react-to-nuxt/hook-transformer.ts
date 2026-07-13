import { ReactEffect } from "./semantic-analyzer";

export interface LifecycleTransformationResult {
  imports: string[]; // (Kept for reference, though we rely on auto-imports)
  calls: string[];
  declarations: string[];
}

export function transformLifecycle(effects: ReactEffect[]): LifecycleTransformationResult {
  const imports = new Set<string>();
  const calls: string[] = [];
  const declarations: string[] = [];

  effects.forEach((eff, index) => {
    const isMount = eff.dependencies.length === 0 && eff.node.arguments.length >= 2; // useEffect(fn, [])
    const hasDeps = eff.dependencies.length > 0;

    // We clean the arrow function wrappers (e.g. () => { ... } or () => expr)
    let effectBody = eff.body.trim();

    if (isMount) {
      imports.add("onMounted");
      imports.add("onUnmounted");
      calls.push(`onMounted(() => {
  const cleanup = (${effectBody})();
  if (typeof cleanup === 'function') {
    onUnmounted(cleanup);
  }
});`);
    } else if (hasDeps) {
      imports.add("watch");
      // Format dependencies: map state variables to state.value
      const depsArrayText = `[${eff.dependencies.join(", ")}]`;
      calls.push(`watch(() => ${depsArrayText}, (newVals, oldVals, onCleanup) => {
  const cleanup = (${effectBody})();
  if (typeof cleanup === 'function') {
    onCleanup(cleanup);
  }
}, { immediate: true });`);
    } else {
      imports.add("watchEffect");
      // Omitted dependency array - runs on every update/initialization
      calls.push(`watchEffect((onCleanup) => {
  const cleanup = (${effectBody})();
  if (typeof cleanup === 'function') {
    onCleanup(cleanup);
  }
});`);
    }
  });

  return {
    imports: Array.from(imports),
    calls,
    declarations,
  };
}
