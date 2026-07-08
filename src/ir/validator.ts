import { UnifiedModuleIR, UnifiedComponentIR, UnifiedRoutingConfig } from "./types";

export interface ValidationIssue {
  type: "error" | "warning";
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export class UnifiedIRValidator {
  /**
   * Validates structural integrity of the Unified Module IR,
   * checking for missing fields, incorrect types, and routing issues.
   */
  public static validate(ir: UnifiedModuleIR): ValidationResult {
    const issues: ValidationIssue[] = [];

    // 1. Verify module path properties
    if (!ir.absolutePath) {
      issues.push({ type: "error", path: "absolutePath", message: "absolutePath must be defined." });
    }
    if (!ir.relativePath) {
      issues.push({ type: "error", path: "relativePath", message: "relativePath must be defined." });
    }

    // 2. Verify Components
    ir.components.forEach((comp, idx) => {
      this.validateComponent(comp, `components[${idx}]`, issues);
    });

    // 3. Verify Routing configuration (circular reference detection)
    const visitedRoutes = new Set<string>();
    this.validateRouting(ir.routes, "routes", visitedRoutes, issues);

    return {
      valid: !issues.some((issue) => issue.type === "error"),
      issues,
    };
  }

  private static validateComponent(comp: UnifiedComponentIR, basePath: string, issues: ValidationIssue[]) {
    if (!comp.name) {
      issues.push({ type: "error", path: `${basePath}.name`, message: "Component name is required." });
    }

    // Check states
    comp.state.forEach((st, idx) => {
      if (!st.name) {
        issues.push({ type: "error", path: `${basePath}.state[${idx}].name`, message: "State name is required." });
      }
    });

    // Check props
    comp.props.forEach((prop, idx) => {
      if (!prop.name) {
        issues.push({ type: "error", path: `${basePath}.props[${idx}].name`, message: "Prop name is required." });
      }
    });

    // Check template root node
    if (!comp.template) {
      issues.push({ type: "error", path: `${basePath}.template`, message: "Template root node is required." });
    } else {
      if (!comp.template.type) {
        issues.push({ type: "error", path: `${basePath}.template.type`, message: "Template node type is required." });
      }
    }
  }

  private static validateRouting(
    routes: UnifiedRoutingConfig[],
    basePath: string,
    visited: Set<string>,
    issues: ValidationIssue[]
  ) {
    routes.forEach((route, idx) => {
      const currentPath = `${basePath}[${idx}]`;

      if (!route.path && route.path !== "") {
        issues.push({ type: "error", path: `${currentPath}.path`, message: "Route path is required." });
      }

      if (route.path) {
        if (visited.has(route.path)) {
          issues.push({
            type: "warning",
            path: `${currentPath}.path`,
            message: `Potential circular or duplicate route path detected: "${route.path}".`,
          });
        } else {
          visited.add(route.path);
        }
      }

      if (route.children && route.children.length > 0) {
        const subVisited = new Set(visited);
        this.validateRouting(route.children, `${currentPath}.children`, subVisited, issues);
      }
    });
  }
}
