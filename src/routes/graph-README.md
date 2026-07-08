# 🌐 Dependency Graph Visualization API

The **Dependency Graph API** provides structured endpoints to fetch project module dependency trees, components, imports, custom hooks, cycle dependencies, and unused components. 

The API supports **Cursor/Offset Pagination** to safely process and visual render huge project codebases in frontend layout libraries (like **React Flow**).

---

## 🚀 Endpoint Reference

### `GET /api/graph`

Returns paginated nodes and matching dependency connections.

#### Query Parameters
*   `jobId` (Required): The ID of the finished migration job.
*   `page` (Optional): The page index (default: `1`).
*   `limit` (Optional): Maximum nodes returned per page (default: `50`).
*   `search` (Optional): Filter symbol labels using matching strings.
*   `filter` (Optional): Filter node kinds (e.g. `component`, `hook`, `class`, `interface`).

#### Response JSON Schema (`PaginatedGraphResponse`)
```json
{
  "success": true,
  "nodes": [
    {
      "id": "src/Page.tsx:Page:component",
      "label": "Page",
      "type": "component",
      "file": "src/Page.tsx",
      "isCircular": true,
      "isUnused": false
    },
    {
      "id": "src/Unused.tsx:Unused:component",
      "label": "Unused",
      "type": "component",
      "file": "src/Unused.tsx",
      "isCircular": false,
      "isUnused": true
    }
  ],
  "edges": [
    {
      "id": "src/Page.tsx:Page:component->src/Button.tsx:Button:component",
      "source": "src/Page.tsx:Page:component",
      "target": "src/Button.tsx:Button:component",
      "type": "dependency"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "totalNodes": 24,
    "totalPages": 1
  },
  "summary": {
    "totalComponents": 12,
    "totalHooks": 4,
    "circularCount": 3,
    "unusedCount": 1
  }
}
```
