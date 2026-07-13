import { DiagnosticItem, DiagnosticSeverity } from "../../diagnostics/diagnostic-types";

export function analyzeVueDiagnostics(
  vueCode: string,
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
    const pattern = new RegExp(`\\b${hook}\\b`, "g");
    if (pattern.test(vueCode)) {
      diagnostics.push({
        code: "UNMIGRATED_HOOK",
        severity: "warning" as DiagnosticSeverity,
        category: "framework",
        message: `Detected unmigrated React hook: "${hook}". Please ensure it was resolved into Vue reactive refs or computed/watch hooks.`,
        relatedFiles: [filePath],
      });
    }
  });

  // 2. Audit for React JSX attribute leftovers
  if (vueCode.includes("className=")) {
    diagnostics.push({
      code: "CLASSNAME_LEFTOVER",
      severity: "error" as DiagnosticSeverity,
      category: "jsx",
      message: "Detected leftover React 'className=' attribute. In Vue, this must be 'class=' or ':class='.",
      suggestedRepair: "Replace all instances of className= with class=",
      relatedFiles: [filePath],
    });
  }

  // 3. Audit for React event handlers leftovers
  const onClickLeftover = /on[A-Z]\w*=/g;
  if (onClickLeftover.test(vueCode)) {
    diagnostics.push({
      code: "EVENT_HANDLER_LEFTOVER",
      severity: "warning" as DiagnosticSeverity,
      category: "jsx",
      message: "Detected potential React-style event handler (e.g. onClick=). Vue requires event directives (e.g. @click=).",
      relatedFiles: [filePath],
    });
  }

  return diagnostics;
}
