import { ParsedFile } from "../types/parser.types";
import { SourceFramework, TargetFramework } from "../types/migration.types";
import { queryDatabase } from "../lib/database";

function normalizeSlug(framework: string): string {
  const fw = framework.toLowerCase().trim();
  if (fw === "next") return "nextjs";
  if (fw === "solid") return "solidjs";
  return fw;
}
import { transformAngularToReact } from "../codemods/angular/angular-class-to-function";
import { transformVueSFCToJSX } from "../codemods/vue/vue-sfc-to-jsx";
import { transformJSToTS, transformTSToJS } from "../codemods/javascript/js-to-ts";
import { transformReactToNext } from "../codemods/react/react-to-next";
import { transformReactToVue } from "../codemods/react/react-to-vue";
import { transformReactToSvelte, migrateReactProject } from "../codemods/react/react-to-svelte";
import { migrateNextToReact } from "../codemods/next/next-to-react";
import { migrateReactProjectToSolid } from "../codemods/react-to-solid";
import { migrateReactProjectToQwik } from "../codemods/react-to-qwik";
import { migrateReactProjectToNuxt, migrateReactCodeToNuxt } from "../codemods/react-to-nuxt";
import { migrateAngularProjectToNext } from "../codemods/angular-to-next";

// Phase 2 compilers
import { migrateAngularToReact } from "../codemods/angular/angular-compiler";
import { transformSvelteToReact } from "../codemods/svelte/svelte-compiler";
import { migrateNuxtToNext } from "../codemods/nuxt/nuxt-compiler";
import { migrateStateLibrary } from "../codemods/state/state-migrator";
import { migrateStyles } from "../codemods/style/style-migrator";
import { autoRepairProject } from "./auto-repair.service";

import { migrateReactToNext } from "../codemods/react/react-to-next-advanced";

export const supportedMigrationPairs: Array<{ source: SourceFramework; target: TargetFramework }> = [
  { source: "angular", target: "react" },
  { source: "angular", target: "typescript" },
  { source: "vue", target: "react" },
  { source: "vue", target: "typescript" },
  { source: "vue", target: "next" },
  { source: "javascript", target: "typescript" },
  { source: "react", target: "typescript" },
  { source: "react", target: "next" },
  { source: "react", target: "vue" },
  { source: "react", target: "nuxt" },
  { source: "typescript", target: "react" },
  { source: "typescript", target: "next" },
  { source: "typescript", target: "vue" },
  { source: "next", target: "react" },
  { source: "next", target: "typescript" },
  { source: "next", target: "vue" },
  { source: "next", target: "nuxt" },
  { source: "svelte", target: "react" },
  { source: "svelte", target: "typescript" },
  { source: "svelte", target: "next" },
  { source: "nuxt", target: "next" },
  { source: "nuxt", target: "react" },
  { source: "react", target: "svelte" },
  { source: "react", target: "solid" },
  { source: "react", target: "qwik" },
  { source: "angular", target: "next" },
];

export function isSupportedMigrationPair(source: SourceFramework, target: TargetFramework): boolean {
  return supportedMigrationPairs.some((pair) => pair.source === source && pair.target === target);
}

export async function runCodemod(
  projectFiles: ParsedFile[],
  sourceFramework: SourceFramework,
  targetFramework: TargetFramework,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal
): Promise<ParsedFile[]> {
  const checkAbort = () => {
    if (signal?.aborted) {
      throw new Error("Job aborted");
    }
  };

  checkAbort();
  onProgress?.(5);

  // Load active codemods for target framework
  const slug = normalizeSlug(targetFramework);
  const codemodRows = await queryDatabase(
    `SELECT c.name, c.enabled FROM codemods c
     JOIN frameworks f ON f.id = c.framework_id
     WHERE f.slug = $1`,
    [slug]
  );

  const enabledCodemods = new Set<string>();
  if (codemodRows && codemodRows.length > 0) {
    codemodRows.forEach((row) => {
      if (row.enabled) {
        enabledCodemods.add(row.name);
      }
    });
  }

  let migrated: ParsedFile[] = [];

  // Project-wide conversions
  if (sourceFramework === "angular" && (targetFramework === "react" || targetFramework === "typescript")) {
    migrated = await migrateAngularToReact(projectFiles);
  } else if (sourceFramework === "angular" && targetFramework === "next") {
    migrated = migrateAngularProjectToNext(projectFiles);
  } else if (sourceFramework === "react" && targetFramework === "solid") {
    migrated = migrateReactProjectToSolid(projectFiles);
  } else if (sourceFramework === "react" && targetFramework === "qwik") {
    migrated = migrateReactProjectToQwik(projectFiles);
  } else if (sourceFramework === "nuxt" && targetFramework === "next") {
    migrated = await migrateNuxtToNext(projectFiles);
  } else if (sourceFramework === "next" && targetFramework === "react") {
    migrated = await migrateNextToReact(projectFiles, false);
  } else if (sourceFramework === "next" && targetFramework === "typescript") {
    migrated = await migrateNextToReact(projectFiles, true);
  } else if (sourceFramework === "react" && targetFramework === "next") {
    migrated = await migrateReactToNext(projectFiles, enabledCodemods);
  } else if (sourceFramework === "typescript" && targetFramework === "next") {
    migrated = await migrateReactToNext(projectFiles, enabledCodemods);
  } else if (sourceFramework === "react" && targetFramework === "svelte") {
    migrated = migrateReactProject(projectFiles);
  } else if (sourceFramework === "typescript" && targetFramework === "svelte") {
    migrated = migrateReactProject(projectFiles);
  } else if (sourceFramework === "react" && targetFramework === "nuxt") {
    migrated = migrateReactProjectToNuxt(projectFiles);
  } else if (sourceFramework === "typescript" && targetFramework === "nuxt") {
    migrated = migrateReactProjectToNuxt(projectFiles);
  } else {
    // File-by-file fallback mapping
    migrated = projectFiles.map((file) => {
      let content = file.content;
      let path = file.path;

      if (sourceFramework === "vue" && targetFramework === "react") {
        content = transformVueSFCToJSX(content);
      } else if (sourceFramework === "vue" && targetFramework === "typescript") {
        content = transformVueSFCToJSX(content);
        const res = transformJSToTS(content, path, enabledCodemods);
        content = res.content;
        path = res.path;
      } else if (sourceFramework === "vue" && targetFramework === "next") {
        content = transformVueSFCToJSX(content);
        const res = transformJSToTS(content, path, enabledCodemods);
        content = res.content;
        path = res.path;
      } else if (sourceFramework === "svelte" && (targetFramework === "react" || targetFramework === "typescript")) {
        const res = transformSvelteToReact(content, path);
        content = res.content;
        path = res.path;
      } else if (sourceFramework === "svelte" && targetFramework === "next") {
        const res = transformSvelteToReact(content, path);
        content = res.content;
        path = res.path;
      } else if (sourceFramework === "javascript" && targetFramework === "typescript") {
        const result = transformJSToTS(content, path, enabledCodemods);
        content = result.content;
        path = result.path;
      } else if (sourceFramework === "react" && targetFramework === "typescript") {
        const result = transformJSToTS(content, path, enabledCodemods);
        content = result.content;
        path = result.path;
      } else if (sourceFramework === "react" && targetFramework === "vue") {
        const result = transformReactToVue(content, path);
        content = result.content;
        path = result.path;
      } else if (sourceFramework === "react" && targetFramework === "svelte") {
        const result = transformReactToSvelte(content, path);
        content = result.content;
        path = result.path;
      } else if (sourceFramework === "react" && targetFramework === "nuxt") {
        const result = { content: migrateReactCodeToNuxt(content, path), path: path.replace(/\.(tsx|jsx)$/, ".vue") };
        content = result.content;
        path = result.path;
      } else if (sourceFramework === "typescript" && targetFramework === "vue") {
        const result = transformReactToVue(content, path);
        content = result.content;
        path = result.path;
      } else if (sourceFramework === "typescript" && targetFramework === "react") {
        const result = transformTSToJS(content, path);
        content = result.content;
        path = result.path;
      }

      return { ...file, content, path };
    });
  }

  checkAbort();
  onProgress?.(40);

  // 4. Apply State & Styling Migration layers on top of output files
  migrated = migrateStateLibrary(migrated);
  checkAbort();
  onProgress?.(50);

  migrated = migrateStyles(migrated);
  checkAbort();
  onProgress?.(60);

  // 5. Execute Sandboxed Validation and Auto-Repair loop
  const repairResult = await autoRepairProject(migrated, signal);
  migrated = repairResult.files;
  checkAbort();
  onProgress?.(95);

  // Store auto-repair corrections in metadata so report service can display them
  let metadataFile = migrated.find(f => f.path === ".migration_metadata.json");
  if (!metadataFile) {
    metadataFile = { path: ".migration_metadata.json", content: "{}" };
    migrated.push(metadataFile);
  }
  try {
    const data = JSON.parse(metadataFile.content);
    data.fixedIssues = repairResult.fixedIssues || [];
    metadataFile.content = JSON.stringify(data, null, 2);
  } catch (e) {
    // Ignore JSON serialize errors
  }

  checkAbort();
  onProgress?.(100);

  return migrated;
}
