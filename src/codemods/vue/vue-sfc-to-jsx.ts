export function transformVueSFCToJSX(source: string): string {
  // 1. Extract template and script blocks
  const templateMatch = source.match(/<template>([\s\S]*?)<\/template>/i);
  const scriptMatch = source.match(/<script(?:\s+setup)?>([\s\S]*?)<\/script>/i);
  
  const template = templateMatch ? templateMatch[1].trim() : "";
  const script = scriptMatch ? scriptMatch[1].trim() : "";
  const isScriptSetup = /<script\s+setup>/i.test(source);

  let reactState: string[] = [];
  let reactMethods: string[] = [];
  let componentBody = "";
  
  // 2. Parse script block
  if (script) {
    if (isScriptSetup) {
      // Composition API / Script Setup
      // E.g. const title = ref('My Vue App')
      const refRegex = /(?:const|let|var)\s+(\w+)\s*=\s*ref\(([\s\S]*?)\)/g;
      let refMatch;
      let cleanScript = script;
      while ((refMatch = refRegex.exec(script)) !== null) {
        const name = refMatch[1];
        const initialVal = refMatch[2];
        reactState.push(`const [${name}, set${name.charAt(0).toUpperCase()}${name.slice(1)}] = useState(${initialVal});`);
        // Replace variable.value = ... with setVariable(...) in the remaining script code
        const setterRegex = new RegExp(`${name}\\.value\\s*=\\s*([^;\\n]+)`, 'g');
        cleanScript = cleanScript.replace(setterRegex, `set${name.charAt(0).toUpperCase()}${name.slice(1)}($1)`);
        // Replace variable.value reference with variable
        const refValRegex = new RegExp(`${name}\\.value`, 'g');
        cleanScript = cleanScript.replace(refValRegex, name);
      }
      
      // Remove the converted ref lines from script body
      cleanScript = cleanScript.replace(/(?:const|let|var)\s+(\w+)\s*=\s*ref\([\s\S]*?\);?/g, "");
      componentBody = cleanScript;
    } else {
      // Options API (export default { data(), methods, etc })
      // Extract data() return object
      const dataMatch = script.match(/data\s*\(\s*\)\s*{\s*return\s*{([\s\S]*?)}\s*;?\s*}/i);
      if (dataMatch) {
        const dataFields = dataMatch[1].split(",");
        dataFields.forEach(field => {
          const parts = field.split(":");
          if (parts.length >= 2) {
            const name = parts[0].trim();
            const val = parts.slice(1).join(":").trim();
            if (name) {
              reactState.push(`const [${name}, set${name.charAt(0).toUpperCase()}${name.slice(1)}] = useState(${val});`);
            }
          }
        });
      }

      // Extract methods block
      const methodsMatch = script.match(/methods\s*:\s*{([\s\S]*?)}/i);
      if (methodsMatch) {
        // Parse individual methods
        const methodLines = methodsMatch[1].trim();
        // Regex to match method declarations e.g. handleClick() { ... } or handleClick: function() { ... }
        const methodRegex = /(\w+)\s*(?:\(\s*([^)]*?)\s*\)|:\s*function\s*\(\s*([^)]*?)\s*\))\s*{([\s\S]*?)}/g;
        let methodMatch;
        while ((methodMatch = methodRegex.exec(methodLines)) !== null) {
          const name = methodMatch[1];
          const args = methodMatch[2] || methodMatch[3] || "";
          let body = methodMatch[4].trim();
          
          // Replace this.variable = ... with setVariable(...)
          reactState.forEach(stateLine => {
            const stateName = stateLine.match(/const\s+\[(\w+)/)?.[1];
            if (stateName) {
              const thisRegex = new RegExp(`this\\.${stateName}\\s*=\\s*([^;\\n]+)`, 'g');
              body = body.replace(thisRegex, `set${stateName.charAt(0).toUpperCase()}${stateName.slice(1)}($1)`);
              
              // Replace this.variable reference with variable
              const refRegex = new RegExp(`this\\.${stateName}`, 'g');
              body = body.replace(refRegex, stateName);
            }
          });
          
          reactMethods.push(`const ${name} = (${args}) => {\n    ${body}\n  };`);
        }
      }
    }
  }

  // 3. Convert Vue directives in template to React JSX
  let jsx = template;

  // Convert Vue event handlers e.g. @click="handleClick" -> onClick={handleClick}
  jsx = jsx.replace(/@(\w+)=["']([^"']+)["']/g, (match, event, handler) => {
    const reactEvent = `on${event.charAt(0).toUpperCase()}${event.slice(1)}`;
    return `${reactEvent}={${handler}}`;
  });
  
  jsx = jsx.replace(/v-on:(\w+)=["']([^"']+)["']/g, (match, event, handler) => {
    const reactEvent = `on${event.charAt(0).toUpperCase()}${event.slice(1)}`;
    return `${reactEvent}={${handler}}`;
  });

  // Convert Vue class bindings e.g. :class="val" -> className={val}
  jsx = jsx.replace(/:class=["']([^"']+)["']/g, "className={$1}");
  jsx = jsx.replace(/v-bind:class=["']([^"']+)["']/g, "className={$1}");

  // Convert standard Vue bindings e.g. :src="val" -> src={val}
  jsx = jsx.replace(/:(\w+)=["']([^"']+)["']/g, "$1={$2}");
  jsx = jsx.replace(/v-bind:(\w+)=["']([^"']+)["']/g, "$1={$2}");

  // Convert double mustache variable interpolation e.g. {{ title }} -> {title}
  jsx = jsx.replace(/\{\{\s*([\s\S]*?)\s*\}\}/g, "{$1}");

  // Convert v-if="condition"
  // Simple block wrapper: search for tags with v-if
  // Note: For complex multi-line templates, custom compiler AST is preferred.
  // For basic SFC template translation:
  const vifRegex = /<(\w+)([^>]*?)\s+v-if=["']([^"']+)["']([^>]*?)>([\s\S]*?)<\/\1>/g;
  jsx = jsx.replace(vifRegex, "{$3 && <$1$2$4>$5</$1>}");

  // Convert v-for="item in items"
  const vforRegex = /<(\w+)([^>]*?)\s+v-for=["'](\w+)\s+in\s+(\w+)["']([^>]*?)>([\s\S]*?)<\/\1>/g;
  jsx = jsx.replace(vforRegex, "{$4.map($3 => <$1$2$5>$6</$1>)}");

  // Remove Vue specific structural attributes if any left
  jsx = jsx.replace(/\s+v-else(-if)?=["'][^"']+["']/g, "");

  // 4. Assemble React component output
  const imports = `import React, { useState } from 'react';\n`;
  const stateCode = reactState.join("\n  ");
  const methodsCode = reactMethods.join("\n  ");
  
  const reactComponent = `${imports}
export default function VueMigratedComponent() {
  ${stateCode}
  
  ${methodsCode}
  
  ${componentBody}
  
  return (
    ${jsx}
  );
}
`;

  return reactComponent;
}
