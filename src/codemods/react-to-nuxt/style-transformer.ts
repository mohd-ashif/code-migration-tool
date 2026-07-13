import { StyledComponent } from "./semantic-analyzer";

/**
 * Converts React inline style objects or expressions to Vue inline style format.
 * Separates static declarations from dynamic expressions.
 * e.g., {{ color: 'red', textDecoration: t.done ? 'line-through' : 'none' }}
 *    -> style="color: red;" :style="{ 'text-decoration': t.done ? 'line-through' : 'none' }"
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

      // Regex-free CamelCase to kebab-case conversion
      let key = "";
      for (let i = 0; i < rawKey.length; i++) {
        const char = rawKey[i];
        if (char === "'" || char === '"') continue;
        if (char === char.toUpperCase() && char !== char.toLowerCase()) {
          key += "-" + char.toLowerCase();
        } else {
          key += char;
        }
      }

      // Regex-free static string checking
      const cleanVal = rawVal.trim();
      const startQuote = cleanVal.startsWith("'") || cleanVal.startsWith('"');
      const endQuote = cleanVal.endsWith("'") || cleanVal.endsWith('"');
      let isStaticString = startQuote && endQuote;

      if (isStaticString) {
        if (cleanVal.includes("?") || cleanVal.includes(":") || cleanVal.includes("${")) {
          isStaticString = false;
        }
      }

      // Regex-free static number checking
      let isStaticNumber = false;
      let checkVal = cleanVal;
      const units = ["px", "em", "rem", "%", "vh", "vw", "ms", "s"];
      units.forEach((u) => {
        if (checkVal.endsWith(u)) {
          checkVal = checkVal.substring(0, checkVal.length - u.length);
        }
      });
      const parsedNum = Number(checkVal);
      if (!isNaN(parsedNum) && checkVal.trim() !== "") {
        isStaticNumber = true;
      }

      if (isStaticString) {
        const stringVal = cleanVal.slice(1, -1);
        staticParts.push(`${key}: ${stringVal}`);
      } else if (isStaticNumber) {
        // If it is a raw number (without unit), pad with px
        let unitPadded = cleanVal;
        let hasUnit = false;
        units.forEach((u) => {
          if (cleanVal.endsWith(u)) hasUnit = true;
        });
        if (!hasUnit) {
          unitPadded = `${cleanVal}px`;
        }
        staticParts.push(`${key}: ${unitPadded}`);
      } else {
        let unquotedVal = cleanVal;
        if (startQuote && endQuote) {
          unquotedVal = cleanVal.slice(1, -1).trim();
        }
        dynamicDirectives.push(`'${key}': ${unquotedVal}`);
      }
    }
  });

  const resultAttrs: string[] = [];
  if (staticParts.length > 0) {
    resultAttrs.push(`style="${staticParts.join("; ")};"`);
  }
  if (dynamicDirectives.length > 0) {
    resultAttrs.push(`:style="{ ${dynamicDirectives.join(", ")} }"`);
  }

  if (resultAttrs.length > 0) {
    return resultAttrs.join(" ");
  }

  return `:style="${content}"`;
}

/**
 * Compiles all extracted styled-components into a scoped Vue <style scoped> block.
 */
export function generateVueStyleBlock(styledComponents: StyledComponent[]): string {
  if (styledComponents.length === 0) return "";

  const rules = styledComponents.map((sc) => {
    let cleanCss = sc.css;

    if (cleanCss.includes("&")) {
      cleanCss = cleanCss.split("&").join(`.${sc.name}`);
    }

    if (!cleanCss.includes(`.${sc.name}`)) {
      return `.${sc.name} {\n  ${cleanCss.split("\n").join("\n  ")}\n}`;
    }
    return cleanCss;
  });

  return `<style scoped>\n${rules.join("\n\n")}\n</style>`;
}
