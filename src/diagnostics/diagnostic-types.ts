export type DiagnosticSeverity = "error" | "warning" | "info";

export type DiagnosticCategory =
  | "typescript"
  | "eslint"
  | "import"
  | "package"
  | "jsx"
  | "framework";

export interface ASTLocation {
  line: number;
  character: number;
  length?: number;
  sourceFile: string;
}

export interface DiagnosticItem {
  /** Error code, e.g. "TS2307" or "LINT_UNUSED_VAR" */
  code: string;
  /** Severity level of the diagnostic */
  severity: DiagnosticSeverity;
  /** Category of compiler diagnostic */
  category: DiagnosticCategory;
  /** Detailed error message */
  message: string;
  /** Suggested code repair or correction suggestion */
  suggestedRepair?: string;
  /** List of files related to this diagnostic */
  relatedFiles: string[];
  /** Optional AST source code location */
  location?: ASTLocation;
  /** Optional stack trace for runtime or execution crashes */
  stackTrace?: string;
}
