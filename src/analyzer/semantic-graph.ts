import { ISemanticGraph, SemanticNode } from "./types";

export class SemanticGraph implements ISemanticGraph {
  private nodes: Map<string, SemanticNode> = new Map();

  addNode(node: SemanticNode): void {
    if (!this.nodes.has(node.id)) {
      this.nodes.set(node.id, {
        ...node,
        dependencies: [...(node.dependencies || [])],
        dependents: [...(node.dependents || [])],
      });
    }
  }

  getNode(id: string): SemanticNode | undefined {
    return this.nodes.get(id);
  }

  getNodes(): SemanticNode[] {
    return Array.from(this.nodes.values());
  }

  addEdge(sourceId: string, targetId: string): void {
    const sourceNode = this.nodes.get(sourceId);
    const targetNode = this.nodes.get(targetId);

    if (sourceNode && targetNode) {
      if (!sourceNode.dependencies.includes(targetId)) {
        sourceNode.dependencies.push(targetId);
      }
      if (!targetNode.dependents.includes(sourceId)) {
        targetNode.dependents.push(sourceId);
      }
    }
  }

  getComponent(id: string): SemanticNode | undefined {
    const node = this.nodes.get(id);
    return node && node.symbolType === "component" ? node : undefined;
  }

  getSymbol(name: string): SemanticNode[] {
    const results: SemanticNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.symbolName === name) {
        results.push(node);
      }
    }
    return results;
  }

  findImport(moduleSpecifier: string): SemanticNode[] {
    const results: SemanticNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.symbolType === "import" && node.symbolName.includes(moduleSpecifier)) {
        results.push(node);
      }
    }
    return results;
  }

  findExport(symbolName: string): SemanticNode | undefined {
    for (const node of this.nodes.values()) {
      if (node.symbolType === "export" && node.symbolName === symbolName) {
        return node;
      }
    }
    return undefined;
  }

  getDependencies(nodeId: string): SemanticNode[] {
    const node = this.nodes.get(nodeId);
    if (!node) return [];
    return node.dependencies
      .map((id) => this.nodes.get(id))
      .filter((n): n is SemanticNode => n !== undefined);
  }

  getDependents(nodeId: string): SemanticNode[] {
    const node = this.nodes.get(nodeId);
    if (!node) return [];
    return node.dependents
      .map((id) => this.nodes.get(id))
      .filter((n): n is SemanticNode => n !== undefined);
  }
}
