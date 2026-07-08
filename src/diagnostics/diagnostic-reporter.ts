import { DiagnosticItem } from "./diagnostic-types";
import * as path from "path";

export class DiagnosticReporter {
  /**
   * Formats diagnostic items with ANSI color codes for terminal CLI outputs.
   */
  public static formatConsole(items: DiagnosticItem[]): string {
    if (items.length === 0) {
      return "\x1b[32m✔ No diagnostic issues found. Perfect codebase build!\x1b[0m\n";
    }

    let output = "";
    let errorCount = 0;
    let warningCount = 0;
    let infoCount = 0;

    for (const item of items) {
      let severityColor = "";
      let severityLabel = "";

      if (item.severity === "error") {
        severityColor = "\x1b[31m"; // Red
        severityLabel = "ERROR";
        errorCount++;
      } else if (item.severity === "warning") {
        severityColor = "\x1b[33m"; // Yellow
        severityLabel = "WARNING";
        warningCount++;
      } else {
        severityColor = "\x1b[34m"; // Blue
        severityLabel = "INFO";
        infoCount++;
      }

      output += `${severityColor}[${severityLabel}] (${item.category.toUpperCase()}) Code ${item.code}\x1b[0m\n`;
      output += `  Message: ${item.message}\n`;

      if (item.location) {
        const fileBase = path.basename(item.location.sourceFile);
        output += `  Location: ${fileBase}:${item.location.line}:${item.location.character}\n`;
      }

      if (item.suggestedRepair) {
        output += `  \x1b[36mSuggested Fix: ${item.suggestedRepair}\x1b[0m\n`;
      }
      
      output += "\n";
    }

    output += `\x1b[1mSummary: Found ${errorCount} errors, ${warningCount} warnings, and ${infoCount} info items.\x1b[0m\n`;
    return output;
  }

  /**
   * Generates a beautifully structured GitHub markdown table representing all workspace diagnostics.
   */
  public static formatMarkdown(items: DiagnosticItem[]): string {
    if (items.length === 0) {
      return "### ✔ No diagnostic issues found. Perfect codebase build!\n";
    }

    let md = "# 📋 Compiler Diagnostic Report\n\n";
    md += "| Code | Severity | Category | Message | Location | Suggested Repair |\n";
    md += "| :--- | :---: | :---: | :--- | :--- | :--- |\n";

    for (const item of items) {
      const severityIcon = item.severity === "error" ? "🔴 Error" : item.severity === "warning" ? "🟡 Warning" : "🔵 Info";
      
      let locStr = "Global";
      if (item.location) {
        const fileBase = path.basename(item.location.sourceFile);
        locStr = `${fileBase}#L${item.location.line}:${item.location.character}`;
      }

      const cleanMessage = item.message.replace(/\|/g, "\\|");
      const cleanFix = (item.suggestedRepair || "").replace(/\|/g, "\\|");

      md += `| \`${item.code}\` | ${severityIcon} | \`${item.category}\` | ${cleanMessage} | \`${locStr}\` | ${cleanFix || "N/A"} |\n`;
    }

    return md;
  }

  /**
   * Serializes the diagnostic items array into a standard JSON string.
   */
  public static formatJSON(items: DiagnosticItem[]): string {
    return JSON.stringify(items, null, 2);
  }
}
