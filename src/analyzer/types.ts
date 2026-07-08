export type SymbolType =
  | "component"
  | "class"
  | "interface"
  | "enum"
  | "function"
  | "hook"
  | "import"
  | "export";

export type FrameworkType =
  | "react"
  | "angular"
  | "vue"
  | "next"
  | "svelte"
  | "nuxt"
  | "unknown";

export interface SemanticNode {
  /** Unique identifier for the node, e.g. "absolutePath:symbolName" or a unique hash */
  id: string;
  /** Absolute file path where the symbol is declared */
  absolutePath: string;
  /** File path relative to the project root directory */
  relativePath: string;
  /** Name of the symbol (class name, function name, variable name, module specifier etc.) */
  symbolName: string;
  /** Type of symbol (component, class, hook, etc.) */
  symbolType: SymbolType;
  /** Target framework classified for this symbol */
  framework: FrameworkType;
  /** IDs of nodes that this node depends on */
  dependencies: string[];
  /** IDs of nodes that depend on this node */
  dependents: string[];
  /** Absolute path of the source file containing this node */
  sourceFile: string;
}

export interface ISemanticGraph {
  /** Adds a semantic node to the graph */
  addNode(node: SemanticNode): void;
  /** Retrieves a node by its unique ID */
  getNode(id: string): SemanticNode | undefined;
  /** Returns all nodes in the graph */
  getNodes(): SemanticNode[];
  /** Adds a dependency edge from sourceId to targetId */
  addEdge(sourceId: string, targetId: string): void;
  
  /** Retrieves component node by ID */
  getComponent(id: string): SemanticNode | undefined;
  /** Retrieves nodes matching a specific symbol name */
  getSymbol(name: string): SemanticNode[];
  /** Finds import nodes matching a module specifier */
  findImport(moduleSpecifier: string): SemanticNode[];
  /** Finds an export node matching a symbol name */
  findExport(symbolName: string): SemanticNode | undefined;
  /** Retrieves direct dependencies of a node */
  getDependencies(nodeId: string): SemanticNode[];
  /** Retrieves direct dependents of a node */
  getDependents(nodeId: string): SemanticNode[];
}
