export type PatchType = "insert" | "delete" | "replace" | "move" | "update-imports";

export interface ASTPatch {
  /** Type of edit: insert, delete, replace, move, or update-imports */
  type: PatchType;
  /** AST node kind of the targeted declaration (e.g. ClassDeclaration, ImportDeclaration) */
  targetNodeKind: string;
  /** Name of the symbol if available (e.g. "HeroComponent") */
  targetNodeName?: string;
  /** Position bounds of the targeted node inside the original source file */
  originalPos?: { start: number; end: number };
  /** The new code text content to replace/insert */
  newContent?: string;
  /** Optional reference to node identifiers */
  sourceNodeId?: string;
}

export interface ASTPatchResult {
  /** Array of computed AST patches applied */
  patches: ASTPatch[];
  /** Corrected source code output with formatting preserved */
  modifiedContent: string;
}
