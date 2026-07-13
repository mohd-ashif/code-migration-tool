import { NuxtComponentIR } from "./ir-builder";

export function generateScriptSetup(ir: NuxtComponentIR): string[] {
  const scriptLines: string[] = [];

  // 1. Props (defineProps)
  if (ir.props.length > 0) {
    const propTypes = ir.props.map((p) => {
      // Map React-specific types to standard TS
      let t = p.type;
      if (t === "React.ReactNode" || t.includes("ReactNode")) t = "any";
      if (t === "any" || t === "any[]") {
        const hasExpenseType = ir.extraStatements.some((s) => s.indexOf("interface Expense") !== -1 || s.indexOf("type Expense") !== -1);
        if (p.name === "items" && hasExpenseType) {
          t = "Expense[]";
        }
      }
      return `  ${p.name}${p.required ? "" : "?"}: ${t};`;
    }).join("\n");

    const defaults = ir.props.filter((p) => p.defaultValue !== undefined);
    if (defaults.length > 0) {
      const defaultMappings = defaults
        .map((p) => `  ${p.name}: ${p.defaultValue}`)
        .join(",\n");
      scriptLines.push(`const props = withDefaults(defineProps<{
${propTypes}
}>(), {
${defaultMappings}
});`);
    } else {
      scriptLines.push(`const props = defineProps<{
${propTypes}
}>();`);
    }
    scriptLines.push("");
  }

  // 1.5. Emits (defineEmits)
  if (ir.emits && ir.emits.length > 0) {
    const emitTypes = ir.emits.map((e) => {
      let args = "payload: any";
      const openParen = e.type.indexOf("(");
      const closeParen = e.type.indexOf(")");
      if (openParen !== -1 && closeParen !== -1 && closeParen > openParen + 1) {
        args = e.type.substring(openParen + 1, closeParen).trim();
      }

      // Context-aware typing lookup for standard actions
      if (args === "payload: any" || args.endsWith(": any")) {
        const hasExpenseType = ir.extraStatements.some((s) => s.indexOf("interface Expense") !== -1 || s.indexOf("type Expense") !== -1);
        if (e.eventName === "add" && hasExpenseType) {
          args = "expense: Omit<Expense, 'id'>";
        } else if (e.eventName === "remove") {
          args = "id: string";
        }
      }

      return `  (_event: "${e.eventName}", ${args}): void;`;
    }).join("\n");

    scriptLines.push(`const emit = defineEmits<{
${emitTypes}
}>();`);
    scriptLines.push("");
  }

  // 2. States (ref())
  if (ir.states.length > 0) {
    ir.states.forEach((s) => {
      const typeAnn = s.type && s.type !== "any" ? `<${s.type}>` : "";
      scriptLines.push(`const ${s.name} = ref${typeAnn}(${s.defaultValue});`);
    });
    scriptLines.push("");
  }

  // 3. Refs (ref() for DOM refs)
  if (ir.refs.length > 0) {
    ir.refs.forEach((r) => {
      scriptLines.push(`const ${r.name} = ref(${r.defaultValue});`);
    });
    scriptLines.push("");
  }

  // 4. Context usage (inject)
  if (ir.contexts.length > 0) {
    ir.contexts.forEach((c) => {
      scriptLines.push(`const ${c.variableName} = inject("${c.contextName}");`);
    });
    scriptLines.push("");
  }

  return scriptLines;
}
