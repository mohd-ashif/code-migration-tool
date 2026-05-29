import { ParsedFile } from "../types/parser.types";

export type DetectedFramework = "angular" | "vue" | "react" | "typescript" | "javascript";

export function detectFramework(files: ParsedFile[]): DetectedFramework {
  const content = files.map((file) => file.content).join("\n");
  const filePaths = files.map((file) => file.path).join("\n");
  
  // Angular detection
  if (
    content.includes("@Component") ||
    content.includes("@NgModule") ||
    content.includes("@Injectable") ||
    content.includes("import { Component }") ||
    content.includes("from '@angular")
  ) {
    return "angular";
  }
  
  // Vue detection
  if (
    content.includes("<template>") ||
    content.includes("v-if") ||
    content.includes("v-for") ||
    content.includes("@click") ||
    filePaths.includes(".vue")
  ) {
    return "vue";
  }
  
  // React detection
  if (
    (content.includes("from 'react'") || content.includes("from \"react\"")) ||
    content.includes("import React") ||
    filePaths.includes(".jsx") ||
    ((filePaths.includes(".tsx") || content.includes("<>") || content.includes("<div") || content.includes("<span")) && content.includes("</"))
  ) {
    return "react";
  }
  
  // TypeScript detection (based on file extensions and type syntax)
  if (
    filePaths.includes(".ts") || filePaths.includes(".tsx") ||
    content.includes(": string") ||
    content.includes(": number") ||
    content.includes(": boolean") ||
    content.includes("interface ") ||
    content.includes("type ")
  ) {
    return "typescript";
  }
  
  return "javascript";
}
