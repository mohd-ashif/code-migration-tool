import { Request, Response, NextFunction } from "express";
import { getJobResult } from "../services/job.service";
import { SemanticGraphBuilder } from "../analyzer/semantic-graph-builder";
import { GraphAnalyzer } from "../services/graph-analyzer";
import { GraphNode, GraphEdge } from "../types/graph.types";
import * as path from "path";
import * as fs from "fs";

export async function handleGetGraph(req: Request, res: Response, next: NextFunction) {
  try {
    const jobId = req.query.jobId as string;
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = parseInt((req.query.limit as string) || "50", 10);
    const search = req.query.search as string;
    const filter = req.query.filter as string;

    if (!jobId) {
      return res.status(400).json({ success: false, message: "jobId query param is required." });
    }

    const job = await getJobResult(jobId);
    if (!job || !job.result || !job.result.migratedFiles) {
      return res.status(404).json({ success: false, message: "Job result or migrated files not found." });
    }

    const files = job.result.migratedFiles;

    // Create a temporary workspace for AST graph scanning
    const tempDir = path.join(__dirname, "..", "..", "scratch", `graph-viz-${jobId}-${Date.now()}`);

    try {
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      files.forEach((f) => {
        const fullPath = path.join(tempDir, f.path);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, f.content, "utf8");
      });

      // Build SemanticGraph from the temporary directory
      const semanticGraph = SemanticGraphBuilder.build(tempDir);

      // Perform analyses
      const circularIds = GraphAnalyzer.detectCycles(semanticGraph);
      const unusedIds = GraphAnalyzer.detectUnused(semanticGraph);

      // Compile nodes
      const allNodes: GraphNode[] = semanticGraph.getNodes().map((node) => {
        let type: GraphNode["type"] = "unknown";
        if (
          ["component", "hook", "class", "interface", "enum", "function", "import", "export"].includes(
            node.symbolType
          )
        ) {
          type = node.symbolType as any;
        }

        return {
          id: node.id,
          label: node.symbolName,
          type,
          file: node.relativePath,
          isCircular: circularIds.has(node.id),
          isUnused: unusedIds.has(node.id),
        };
      });

      // Filter nodes based on search and type filter
      let filteredNodes = allNodes;
      if (search) {
        filteredNodes = filteredNodes.filter((n) => n.label.toLowerCase().includes(search.toLowerCase()));
      }
      if (filter) {
        filteredNodes = filteredNodes.filter((n) => n.type === filter);
      }

      // Pagination
      const totalNodes = filteredNodes.length;
      const totalPages = Math.ceil(totalNodes / limit);
      const paginatedNodes = filteredNodes.slice((page - 1) * limit, page * limit);
      const paginatedNodeIds = new Set(paginatedNodes.map((n) => n.id));

      // Compile edges from the semantic graph
      const allEdges: GraphEdge[] = [];
      const nodes = semanticGraph.getNodes();
      for (const node of nodes) {
        const deps = semanticGraph.getDependencies(node.id);
        for (const dep of deps) {
          allEdges.push({
            id: `${node.id}->${dep.id}`,
            source: node.id,
            target: dep.id,
            type: node.symbolType === "import" ? "import" : "dependency",
          });
        }
      }

      // Filter edges to return only those connected to paginated nodes where BOTH nodes are rendered
      const paginatedEdges = allEdges.filter(
        (edge) => paginatedNodeIds.has(edge.source) && paginatedNodeIds.has(edge.target)
      );

      // Count metrics
      const totalComponents = allNodes.filter((n) => n.type === "component").length;
      const totalHooks = allNodes.filter((n) => n.type === "hook").length;

      res.status(200).json({
        success: true,
        nodes: paginatedNodes,
        edges: paginatedEdges,
        pagination: {
          page,
          limit,
          totalNodes,
          totalPages,
        },
        summary: {
          totalComponents,
          totalHooks,
          circularCount: circularIds.size,
          unusedCount: unusedIds.size,
        },
      });
    } finally {
      // Sandbox Cleanup
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (e) {
        // Ignore cleanup issues
      }
    }
  } catch (error) {
    next(error);
  }
}
