export interface GraphNode {
  id: string;
  label: string;
  type: "component" | "hook" | "class" | "interface" | "enum" | "function" | "import" | "export" | "unknown";
  file: string;
  isCircular: boolean;
  isUnused: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: "dependency" | "hierarchy" | "import";
}

export interface GraphPaginationInfo {
  page: number;
  limit: number;
  totalNodes: number;
  totalPages: number;
}

export interface GraphSummaryInfo {
  totalComponents: number;
  totalHooks: number;
  circularCount: number;
  unusedCount: number;
}

export interface PaginatedGraphResponse {
  success: boolean;
  nodes: GraphNode[];
  edges: GraphEdge[];
  pagination: GraphPaginationInfo;
  summary: GraphSummaryInfo;
}
