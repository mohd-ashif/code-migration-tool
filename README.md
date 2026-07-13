# 🛠️ Code Migration Tool - Backend Service

This is the backend microservice for the **Code Migration Tool**, built with Node.js, Express, and TypeScript. It exposes a set of RESTful APIs to parse, analyze, transform, and compile frontend codebases using AST (Abstract Syntax Tree) transformation engines and AI-assisted codemods.

---

## 🚀 Key Features

*   **Framework Auto-Detection**: Analyzes project files (either uploaded as a `.zip` or sent in a JSON payload) and automatically classifies source frameworks (Angular, Vue, React, Svelte, or Vanilla JavaScript).
*   **Semantic Graph Analyzer**: Resolves files recursively to compile dependency architectures, detecting circular references and dead components.
*   **Unified Migration IR**: Compiles AST definitions into a framework-agnostic pivot model (Props, States, Methods, Lifecycles, and Template nodes).
*   **AST Patch Engine**: Compiles minimal structural diffs and mutates the AST in reverse sequence, keeping formatting and comments completely intact without regex.
*   **React to Nuxt 3 Translation Pipeline**:
    *   **Hook-to-Composable Relocation**: Relocates and compiles custom hooks (e.g. `src/hooks/useX.ts`) to Nuxt 3 composables (`composables/useX.ts`), translating React states (`useState`, `useRef`, `useMemo`, `useEffect`) into Vue equivalents (`ref`, `computed`, `watch`).
    *   **SSR & Hydration Safety**: Identifies top-level storage state initialization (like `localStorage.getItem`), safely initializing reactive refs as defaults on the server and loading them client-side inside a dynamically generated `onMounted` lifecycle wrapper to prevent Nuxt SSR crashes.
    *   **Heuristic Prop-to-Emit Mapping**: Automatically maps function-typed props with action verbs (e.g. `remove`, `add`) to standard Vue child emits (`defineEmits`) rather than keeping them as static props.
    *   **Type Resolution**: Performs context-aware typescript AST lookups to restore type definitions for props and emits (e.g., mapping `Expense[]` and `Omit<Expense, 'id'>` instead of falling back to `any`).
    *   **CSS Static Extraction**: Parses JSX template attributes, automatically extracting static inline style blocks to scoped CSS stylesheets (`<style scoped>`) and assigning unique class names to clean up Vue template markup.
    *   **Key Stripping & Key Cleanup**: Implemented a 100% regex-free compiler key stripper to clean loop structures, resolving the dangling colon (`<tr :>`) markup syntax bug.
    *   **Auto-Import Cleanup**: Strips explicit helper imports (like `ref`, `computed`, `watch`) and relative composables/components folder imports to leverage Nuxt 3's built-in auto-import system.
*   **AI Self-Healing Pipeline**: Orchestrates validation sandboxes, diagnostic checks, and OpenAI completions to patch compiler errors on the fly.
*   **Job Validation Sandbox**: Validates migrated project outputs inside a scratch workspace directory via TypeScript transpilation, import resolution, and sequential compilation pipelines.
    *   **Typecheck Validation**: Automatically runs `npx nuxi typecheck` to verify typescript integrity.
    *   **Build Validation**: Sequentially executes `npm run build` to confirm compiler-readiness before finalizing the migration job.
*   **AST Codemods**: Utilizes robust compiler-level transformations (such as parsing classes, decorator properties, hooks, and lifecycle states) for structure-accurate translation.
*   **Multi-Queue Processing**: Handles long-running compilation workflows asynchronously in a worker pool.
*   **Database Persistence**: Supports relational logging and job state persistence for tracking download history.

---

## 🔄 Supported Migration Matrices

The compiler handles the following transition paths:

| Source Framework | React (JSX) | TypeScript (TSX) | Next.js | Vue 3 | Nuxt.js |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Angular** |  |  | ❌ | ❌ | ❌ |
| **Vue** |  |  |  | ❌ | ❌ |
| **React** | ❌ (Same) |  |  |  |  |
| **JavaScript** | ❌ |  | ❌ | ❌ | ❌ |
| **TypeScript** |  | ❌ (Same) |  |  | ❌ |
| **Next.js** |  |  | ❌ (Same) |  |  |
| **Svelte** |  |  |  | ❌ | ❌ |
| **Nuxt.js** |  | ❌ |  | ❌ | ❌ (Same) |

> [!NOTE]
> Unsupported migration pairs (e.g. migrating *to* Svelte) are validated gracefully at the API controller layer, returning clear, informative suggestions rather than generic parsing failures.

---

## ⚙️ Environment Configuration

Copy the example variables file to begin:
```bash
cp .env.example .env
```

| Variable | Description | Default / Fallback Mode |
| :--- | :--- | :--- |
| `PORT` | Local port the express server listens on. | `4000` |
| `API_KEY` | API request authentication token. | Disabled (Allows all requests if left empty) |
| `DATABASE_URL` / `SUPABASE_URL` | PostgreSQL connection string for persisting jobs. | Disabled (Runs with in-memory `Map` stores) |
| `REDIS_URL` | Redis instance connection string for caching & queues. | Disabled (Queues run locally in-memory via `EventEmitter`) |
| `OPENAI_API_KEY` | API Key for LLM-assisted repair features. | Stub Mode (Runs mock AI responses) |

---

## 🛠️ Architecture Overview

The backend directory layout is organized by layer:

*   [`/src/controllers`](file:///d:/ashif/Resume%20Projects/migration-tool/packages/backend/src/controllers): Handles incoming request validation and delegates job queuing.
*   [`/src/validators`](file:///d:/ashif/Resume%20Projects/migration-tool/packages/backend/src/validators): Validates payload JSON structure and framework input types.
*   [`/src/analyzer`](file:///d:/ashif/Resume%20Projects/migration-tool/packages/backend/src/analyzer): Compiles project-wide semantic graphs and tracks cross-file bindings.
*   [`/src/ir`](file:///d:/ashif/Resume%20Projects/migration-tool/packages/backend/src/ir): Implements the Unified Migration Intermediate Representation.
*   [`/src/diagnostics`](file:///d:/ashif/Resume%20Projects/migration-tool/packages/backend/src/diagnostics): Contains compiler diagnostics checks, JSX key warnings, and reporters.
*   [`/src/patch`](file:///d:/ashif/Resume%20Projects/migration-tool/packages/backend/src/patch): Implements the AST Patch Engine.
*   [`/src/services`](file:///d:/ashif/Resume%20Projects/migration-tool/packages/backend/src/services): Contains key business logic:
    *   [`codemod.service.ts`](file:///d:/ashif/Resume%20Projects/migration-tool/packages/backend/src/services/codemod.service.ts) - Orchestrates transformations.
    *   [`sandbox.service.ts`](file:///d:/ashif/Resume%20Projects/migration-tool/packages/backend/src/services/sandbox.service.ts) - Handles compilation and validation.
    *   [`auto-repair.service.ts`](file:///d:/ashif/Resume%20Projects/migration-tool/packages/backend/src/services/auto-repair.service.ts) - Orchestrates the self-healing loop.
    *   [`graph-analyzer.ts`](file:///d:/ashif/Resume%20Projects/migration-tool/packages/backend/src/services/graph-analyzer.ts) - Computes circular dependencies and dead code.
*   [`/src/codemods`](file:///d:/ashif/Resume%20Projects/migration-tool/packages/backend/src/codemods): Core compiler codes split by framework (React to Next, Angular to React, Vue to JSX).
*   [`/src/queues`](file:///d:/ashif/Resume%20Projects/migration-tool/packages/backend/src/queues): Local background execution tasks and workers.

---

## 📦 Getting Started

### Installation
From the package root or the monorepo root:
```bash
npm install
```

### Dev Server
```bash
npm run dev
```
The server will boot on `http://localhost:4000`.

### Type-Checking & Builds
```bash
npm run build
```
