import { ISemanticGraph } from "../analyzer/types";

export class GraphAnalyzer {
  /**
   * Identifies all nodes participating in circular dependency loops.
   * Performs a Depth-First Search (DFS) with recursion stack tracking.
   */
  public static detectCycles(graph: ISemanticGraph): Set<string> {
    const circularNodes = new Set<string>();
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (nodeId: string, currentPath: string[]) => {
      visited.add(nodeId);
      recStack.add(nodeId);
      currentPath.push(nodeId);

      const deps = graph.getDependencies(nodeId);
      for (const dep of deps) {
        if (!visited.has(dep.id)) {
          dfs(dep.id, [...currentPath]);
        } else if (recStack.has(dep.id)) {
          // Circular cycle detected! Mark all participating nodes
          const startIdx = currentPath.indexOf(dep.id);
          if (startIdx !== -1) {
            const cycle = currentPath.slice(startIdx);
            cycle.forEach((id) => circularNodes.add(id));
          }
        }
      }

      recStack.delete(nodeId);
    };

    const nodes = graph.getNodes();
    for (const node of nodes) {
      if (!visited.has(node.id)) {
        dfs(node.id, []);
      }
    }

    return circularNodes;
  }

  /**
   * Flags unused components/hooks/classes (i.e. dead code with no incoming dependencies).
   */
  public static detectUnused(graph: ISemanticGraph): Set<string> {
    const unusedNodes = new Set<string>();
    const nodes = graph.getNodes();

    for (const node of nodes) {
      const incoming = graph.getDependents(node.id);

      // Heuristic rules for dead code:
      // 1. Symbol is not imported or referenced anywhere in the local workspace.
      // 2. Excluding entrypoints (e.g. main, index, or App components).
      const isEntrypoint =
        node.symbolName.toLowerCase() === "app" ||
        node.symbolName.toLowerCase() === "main" ||
        node.relativePath.toLowerCase().includes("index.ts") ||
        node.relativePath.toLowerCase().includes("index.tsx") ||
        node.relativePath.toLowerCase().includes("main.ts") ||
        node.relativePath.toLowerCase().includes("main.tsx") ||
        node.relativePath.toLowerCase().includes("root") ||
        node.symbolType === "import" ||
        node.symbolType === "export";

      if (incoming.length === 0 && !isEntrypoint) {
        unusedNodes.add(node.id);
      }
    }

    return unusedNodes;
  }
}
