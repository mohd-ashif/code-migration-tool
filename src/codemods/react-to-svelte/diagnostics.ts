import { DiagnosticItem, DiagnosticSeverity } from "../../diagnostics/diagnostic-types";

export function analyzeSvelteDiagnostics(
  svelteCode: string,
  filePath: string
): DiagnosticItem[] {
  const diagnostics: DiagnosticItem[] = [];

  // 1. Audit for unmigrated React hooks
  const unmigratedHooks = [
    "useState",
    "useEffect",
    "useRef",
    "useMemo",
    "useCallback",
    "useContext",
    "useReducer",
  ];
  unmigratedHooks.forEach((hook) => {
    // Look for hook declarations in the Svelte code
    const pattern = new RegExp(`\\b${hook}\\b`, "g");
    if (pattern.test(svelteCode)) {
      diagnostics.push({
        code: "UNMIGRATED_HOOK",
        severity: "warning" as DiagnosticSeverity,
        category: "framework",
        message: `Detected unmigrated React hook: "${hook}". Please ensure it was resolved into Svelte reactive variables or lifecycle hooks.`,
        relatedFiles: [filePath],
      });
    }
  });

  // 2. Audit for React JSX attribute leftovers
  if (svelteCode.includes("className=")) {
    diagnostics.push({
      code: "CLASSNAME_LEFTOVER",
      severity: "error" as DiagnosticSeverity,
      category: "jsx",
      message: "Detected leftover React 'className=' attribute. In Svelte, this must be 'class='.",
      suggestedRepair: "Replace all instances of className= with class=",
      relatedFiles: [filePath],
    });
  }

  // 3. Audit for React event handlers leftovers
  const onClickLeftover = /on[A-Z]\w*=/g;
  if (onClickLeftover.test(svelteCode)) {
    diagnostics.push({
      code: "EVENT_HANDLER_LEFTOVER",
      severity: "warning" as DiagnosticSeverity,
      category: "jsx",
      message: "Detected potential React-style event handler (e.g. onClick=). Svelte requires event directives (e.g. on:click=).",
      relatedFiles: [filePath],
    });
  }

  return diagnostics;
}
