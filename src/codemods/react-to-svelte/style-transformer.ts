import { StyledComponent } from "./semantic-analyzer";

/**
 * Converts React inline style objects or expressions to Svelte inline style format.
 * Dynamically separates static declarations from dynamic expressions using Svelte style directives.
 * e.g., {{ color: 'red', textDecoration: t.done ? 'line-through' : 'none' }}
 *    -> style="color: red;" style:text-decoration={t.done ? 'line-through' : 'none'}
 */
export function transformInlineStyle(styleText: string): string {
  let content = styleText.trim();
  if (content.startsWith("{{") && content.endsWith("}}")) {
    content = content.slice(2, -2).trim();
  } else if (content.startsWith("{") && content.endsWith("}")) {
    content = content.slice(1, -1).trim();
  }

  const declarations = content.split(",");
  const staticParts: string[] = [];
  const dynamicDirectives: string[] = [];

  declarations.forEach((decl) => {
    const parts = decl.split(":");
    if (parts.length >= 2) {
      const rawKey = parts[0].trim();
      const rawVal = parts.slice(1).join(":").trim();

      // Convert camelCase to kebab-case (e.g. fontSize -> font-size)
      const key = rawKey
        .replace(/['"]/g, "")
        .replace(/([A-Z])/g, "-$1")
        .toLowerCase();

      let isStaticString = /^(['"])(.*?)\1$/.test(rawVal);
      const isStaticNumber = /^\d+(\.\d+)?(px|em|rem|%|vh|vw|ms|s)?$/.test(rawVal);

      if (isStaticString && (rawVal.includes("?") || rawVal.includes(":") || rawVal.includes("${") || !/^[a-zA-Z0-9\s#(),.-]+$/.test(rawVal.slice(1, -1)))) {
        isStaticString = false;
      }

      if (isStaticString) {
        const stringVal = rawVal.slice(1, -1);
        staticParts.push(`${key}: ${stringVal}`);
      } else if (isStaticNumber) {
        staticParts.push(`${key}: ${rawVal}`);
      } else {
        // Dynamic expression - use Svelte style directive
        let cleanVal = rawVal;
        if (/^(['"])(.*?)\1$/.test(cleanVal)) {
          cleanVal = cleanVal.slice(1, -1).trim();
        }
        dynamicDirectives.push(`style:${key}={${cleanVal}}`);
      }
    }
  });

  const resultAttrs: string[] = [];
  if (staticParts.length > 0) {
    resultAttrs.push(`style="${staticParts.join("; ")};"`);
  }
  if (dynamicDirectives.length > 0) {
    resultAttrs.push(...dynamicDirectives);
  }

  if (resultAttrs.length > 0) {
    return resultAttrs.join(" ");
  }

  return `style={${content}}`; // Fallback
}

/**
 * Compiles all extracted styled-components into a scoped Svelte <style> block.
 */
export function generateSvelteStyleBlock(styledComponents: StyledComponent[]): string {
  if (styledComponents.length === 0) return "";

  const rules = styledComponents.map((sc) => {
    let cleanCss = sc.css;

    // Map nested selectors: replace & selector with the component class name (.Container)
    if (cleanCss.includes("&")) {
      cleanCss = cleanCss.replace(/&/g, `.${sc.name}`);
    }

    // Wrap in standard selector if not already wrapped
    if (!cleanCss.includes(`.${sc.name}`)) {
      return `.${sc.name} {\n  ${cleanCss.split("\n").join("\n  ")}\n}`;
    }
    return cleanCss;
  });

  return `<style>\n${rules.join("\n\n")}\n</style>`;
}
