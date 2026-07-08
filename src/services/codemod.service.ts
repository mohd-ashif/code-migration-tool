import { ParsedFile } from "../types/parser.types";
import { SourceFramework, TargetFramework } from "../types/migration.types";
import { transformAngularToReact } from "../codemods/angular/angular-class-to-function";
import { transformVueSFCToJSX } from "../codemods/vue/vue-sfc-to-jsx";
import { transformJSToTS, transformTSToJS } from "../codemods/javascript/js-to-ts";
import { transformReactToNext } from "../codemods/react/react-to-next";
import { transformReactToVue } from "../codemods/react/react-to-vue";
import { migrateNextToReact } from "../codemods/next/next-to-react";

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
];

export function isSupportedMigrationPair(source: SourceFramework, target: TargetFramework): boolean {
  return supportedMigrationPairs.some((pair) => pair.source === source && pair.target === target);
}

export async function runCodemod(
  projectFiles: ParsedFile[],
  sourceFramework: SourceFramework,
  targetFramework: TargetFramework
): Promise<ParsedFile[]> {
  let migrated: ParsedFile[] = [];

  // Project-wide conversions
  if (sourceFramework === "angular" && (targetFramework === "react" || targetFramework === "typescript")) {
    migrated = await migrateAngularToReact(projectFiles);
  } else if (sourceFramework === "nuxt" && targetFramework === "next") {
    migrated = await migrateNuxtToNext(projectFiles);
  } else if (sourceFramework === "next" && targetFramework === "react") {
    migrated = await migrateNextToReact(projectFiles, false);
  } else if (sourceFramework === "next" && targetFramework === "typescript") {
    migrated = await migrateNextToReact(projectFiles, true);
  } else if (sourceFramework === "react" && targetFramework === "next") {
    migrated = await migrateReactToNext(projectFiles);
  } else if (sourceFramework === "typescript" && targetFramework === "next") {
    migrated = await migrateReactToNext(projectFiles);
  } else {
    // File-by-file fallback mapping
    migrated = projectFiles.map((file) => {
      let content = file.content;
      let path = file.path;

      if (sourceFramework === "vue" && targetFramework === "react") {
        content = transformVueSFCToJSX(content);
      } else if (sourceFramework === "vue" && targetFramework === "typescript") {
        content = transformVueSFCToJSX(content);
        const res = transformJSToTS(content, path);
        content = res.content;
        path = res.path;
      } else if (sourceFramework === "vue" && targetFramework === "next") {
        content = transformVueSFCToJSX(content);
        const res = transformJSToTS(content, path);
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
        const result = transformJSToTS(content, path);
        content = result.content;
        path = result.path;
      } else if (sourceFramework === "react" && targetFramework === "typescript") {
        const result = transformJSToTS(content, path);
        content = result.content;
        path = result.path;
      } else if (sourceFramework === "react" && targetFramework === "vue") {
        const result = transformReactToVue(content, path);
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

  // 4. Apply State & Styling Migration layers on top of output files
  migrated = migrateStateLibrary(migrated);
  migrated = migrateStyles(migrated);

  // 5. Execute Sandboxed Validation and Auto-Repair loop
  const repairResult = await autoRepairProject(migrated);
  migrated = repairResult.files;

  return migrated;
}
