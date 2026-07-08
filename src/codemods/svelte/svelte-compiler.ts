import { ParsedFile } from "../../types/parser.types";

export function transformSvelteToReact(source: string, filePath: string): { content: string; path: string } {
  // 1. Separate script and markup blocks
  const scriptMatch = source.match(/<script>([\s\S]*?)<\/script>/i);
  const script = scriptMatch ? scriptMatch[1].trim() : "";
  let markup = source.replace(/<script>[\s\S]*?<\/script>/i, "").trim();

  const reactState: string[] = [];
  const reactMemos: string[] = [];
  const reactMethods: string[] = [];
  let scriptRest = "";

  // 2. Parse Svelte script code
  if (script) {
    // Svelte let variables -> React useState
    // E.g. let count = 0; or let title = "hello";
    const letRegex = /let\s+(\w+)\s*=\s*([^;]+);/g;
    let match;
    let cleanScript = script;
    
    while ((match = letRegex.exec(script)) !== null) {
      const name = match[1];
      const val = match[2].trim();
      reactState.push(`const [${name}, set${name.charAt(0).toUpperCase()}${name.slice(1)}] = useState(${val});`);
      
      // Replace count = count + 1 with setCount(count + 1) in remaining script lines
      const setterRegex = new RegExp(`\\b${name}\\s*=\\s*([^;\\n]+)`, 'g');
      cleanScript = cleanScript.replace(setterRegex, `set${name.charAt(0).toUpperCase()}${name.slice(1)}($1)`);
    }

    // Convert reactive statements: $: double = count * 2; -> const double = useMemo(() => count * 2, [count]);
    const reactiveRegex = /\$:\s*(\w+)\s*=\s*([^;\n]+);?/g;
    let reactMatch;
    while ((reactMatch = reactiveRegex.exec(script)) !== null) {
      const name = reactMatch[1];
      const expr = reactMatch[2].trim();
      
      // Simple dependency discovery by scanning variable names in expression
      const deps: string[] = [];
      reactState.forEach(st => {
        const varName = st.match(/const\s+\[(\w+)/)?.[1];
        if (varName && expr.includes(varName)) {
          deps.push(varName);
        }
      });

      reactMemos.push(`const ${name} = useMemo(() => ${expr}, [${deps.join(", ")}]);`);
    }

    // Strip let and reactive lines from script body
    cleanScript = cleanScript.replace(/let\s+\w+\s*=\s*[^;]+;/g, "");
    cleanScript = cleanScript.replace(/\$:\s*\w+\s*=\s*[^;\n]+;?/g, "");
    scriptRest = cleanScript.trim();
  }

  // 3. Convert Svelte markup directives to JSX
  // Convert Svelte slots: <slot /> -> {children}
  markup = markup.replace(/<slot\s*\/>/g, "{children}");

  // Convert Svelte element bindings: bind:value={name} -> value={name} onChange={e => setName(e.target.value)}
  markup = markup.replace(/bind:value=\{\s*(\w+)\s*\}/g, (match, stateName) => {
    const setterName = `set${stateName.charAt(0).toUpperCase()}${stateName.slice(1)}`;
    return `value={${stateName}} onChange={e => ${setterName}(e.target.value)}`;
  });

  // Convert Svelte events: on:click={handleClick} -> onClick={handleClick}
  markup = markup.replace(/on:(\w+)=\{\s*([^}]+?)\s*\}/g, (match, event, handler) => {
    const reactEvent = `on${event.charAt(0).toUpperCase()}${event.slice(1)}`;
    return `${reactEvent}={${handler}}`;
  });

  // Convert Svelte conditionals: {#if condition} ... {:else} ... {/if}
  // Simplified replacement for compiler demonstration
  markup = markup.replace(/\{#if\s+([^}]+?)\}([\s\S]*?)\{\/if\}/g, (match, cond, inner) => {
    if (inner.includes("{:else}")) {
      const parts = inner.split("{:else}");
      return `{${cond} ? (${parts[0].trim()}) : (${parts[1].trim()})}`;
    }
    return `{${cond} && (${inner.trim()})}`;
  });

  // Convert Svelte loops: {#each items as item} ... {/each}
  markup = markup.replace(/\{#each\s+(\w+)\s+as\s+(\w+)\}([\s\S]*?)\{\/each\}/g, "{$1.map($2 => ($3))}");

  // 4. Assemble React component
  const imports = `import React, { useState, useMemo } from 'react';\n`;
  const stateCode = reactState.join("\n  ");
  const memoCode = reactMemos.join("\n  ");
  
  const componentName = filePath.split(/[/\\]/).pop()?.replace(/\.svelte$/, "") || "SvelteComponent";

  const reactContent = `${imports}
export default function ${componentName}({ children }) {
  ${stateCode}
  
  ${memoCode}
  
  ${scriptRest}
  
  return (
    ${markup}
  );
}
`;

  const newPath = filePath.replace(/\.svelte$/, ".tsx");
  return { content: reactContent, path: newPath };
}
