import { ParsedFile } from "../../types/parser.types";

const cssToTailwindDict: Record<string, string> = {
  "display: flex": "flex",
  "display: block": "block",
  "display: inline": "inline",
  "display: grid": "grid",
  "flex-direction: column": "flex-col",
  "flex-direction: row": "flex-row",
  "justify-content: center": "justify-center",
  "justify-content: space-between": "justify-between",
  "align-items: center": "items-center",
  "text-align: center": "text-center",
  "text-align: left": "text-left",
  "text-align: right": "text-right",
  "font-weight: bold": "font-bold",
  "text-transform: uppercase": "uppercase",
  "margin: 0 auto": "mx-auto",
  "width: 100%": "w-full",
  "height: 100%": "h-full",
  "position: absolute": "absolute",
  "position: relative": "relative",
  "position: fixed": "fixed",
  "cursor: pointer": "cursor-pointer"
};

/**
 * Translates standard CSS style properties into equivalent Tailwind CSS utility classes.
 */
export function convertCSSToTailwind(cssContent: string): string {
  let tailwindClasses: string[] = [];
  const rules = cssContent.split(";");

  rules.forEach(rule => {
    const cleanRule = rule.trim().toLowerCase();
    if (cssToTailwindDict[cleanRule]) {
      tailwindClasses.push(cssToTailwindDict[cleanRule]);
    } else {
      // General heuristics for padding, margin, borders
      // e.g. padding: 10px -> p-2.5
      const paddingMatch = cleanRule.match(/padding:\s*(\d+)px/i);
      if (paddingMatch) {
        const val = Math.round(parseInt(paddingMatch[1]) / 4);
        tailwindClasses.push(`p-${val}`);
      }
      const marginMatch = cleanRule.match(/margin-top:\s*(\d+)px/i);
      if (marginMatch) {
        const val = Math.round(parseInt(marginMatch[1]) / 4);
        tailwindClasses.push(`mt-${val}`);
      }
      const colorMatch = cleanRule.match(/background-color:\s*(\w+)/i);
      if (colorMatch) {
        tailwindClasses.push(`bg-${colorMatch[1]}-500`);
      }
    }
  });

  return tailwindClasses.join(" ");
}

export function migrateStyles(files: ParsedFile[]): ParsedFile[] {
  return files.map(f => {
    let content = f.content;
    
    // Scan React/Vue markup files to replace inline style declarations with Tailwind classes
    if (f.path.endsWith(".tsx") || f.path.endsWith(".jsx") || f.path.endsWith(".vue")) {
      content = content.replace(/style=\{\{\s*([\s\S]*?)\s*\}\}/g, (match, styleBody) => {
        // Translate style={{ display: 'flex', marginTop: '10px' }} -> className="flex mt-2"
        const rules = styleBody
          .replace(/['"]/g, "")
          .split(",")
          .map((r: string) => {
            const parts = r.split(":");
            if (parts.length < 2) return "";
            const key = parts[0].trim().replace(/([A-Z])/g, "-$1").toLowerCase();
            const val = parts[1].trim();
            return `${key}: ${val}`;
          })
          .filter(Boolean)
          .join(";");
        
        const tailwind = convertCSSToTailwind(rules);
        return tailwind ? `className="${tailwind}"` : match;
      });
    }

    return { ...f, content };
  });
}
