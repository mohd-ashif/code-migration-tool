import { SvelteComponentIR } from "./ir-builder";

export interface ValidationIssue {
  type: "error" | "warning";
  message: string;
  field: string;
}

export function validateComponentIR(ir: SvelteComponentIR): { valid: boolean; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];

  // Check component name
  if (!ir.name) {
    issues.push({
      type: "error",
      message: "Component name is missing.",
      field: "name",
    });
  } else if (!/^[A-Z]/.test(ir.name)) {
    issues.push({
      type: "warning",
      message: `Component name "${ir.name}" should start with an uppercase letter to conform to standard conventions.`,
      field: "name",
    });
  }

  // Check duplicate state/props names
  const seenNames = new Set<string>();
  ir.props.forEach((prop) => {
    if (seenNames.has(prop.name)) {
      issues.push({
        type: "error",
        message: `Duplicate declaration: Prop "${prop.name}" is declared multiple times.`,
        field: `props.${prop.name}`,
      });
    }
    seenNames.add(prop.name);
  });

  ir.states.forEach((state) => {
    if (seenNames.has(state.name)) {
      issues.push({
        type: "error",
        message: `Duplicate declaration: State variable "${state.name}" overlaps with another prop or state.`,
        field: `states.${state.name}`,
      });
    }
    seenNames.add(state.name);
  });

  return {
    valid: !issues.some((issue) => issue.type === "error"),
    issues,
  };
}
