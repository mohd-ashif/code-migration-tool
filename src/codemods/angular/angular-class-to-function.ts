export function transformAngularToReact(source: string): string {
  // 1. Match the Angular Component decorator and class structure
  // E.g. @Component({ selector: '...', template: '...' }) export class Name { ... }
  const componentRegex = /@Component\(\s*\{([\s\S]*?)\}\s*\)\s*export\s+class\s+(\w+)\s*\{([\s\S]*?)\}/i;
  const match = source.match(componentRegex);

  if (!match) {
    // Fallback: If decorator is not matched, return a simple functional conversion
    return source.replace(/@Component\([\s\S]*?\)\s*export class/, "export function");
  }

  const decoratorConfig = match[1];
  const className = match[2];
  const classBody = match[3].trim();

  // 2. Extract inline template if present
  const templateMatch = decoratorConfig.match(/template\s*:\s*[`'"]([\s\S]*?)[`'"]/i);
  let template = templateMatch ? templateMatch[1].trim() : "<div>Angular Migrated Template</div>";

  const reactState: string[] = [];
  const reactMethods: string[] = [];

  // 3. Parse class body for state and methods
  // Find simple property declarations: name = value; or name: type = value;
  const propRegex = /(\w+)\s*(?::\s*[^=;]+)?\s*=\s*([^;]+);/g;
  let propMatch;
  while ((propMatch = propRegex.exec(classBody)) !== null) {
    const name = propMatch[1];
    const initialVal = propMatch[2].trim();
    reactState.push(`const [${name}, set${name.charAt(0).toUpperCase()}${name.slice(1)}] = useState(${initialVal});`);
  }

  // Find class methods: name(args) { body }
  const methodRegex = /(\w+)\s*\(\s*([^)]*?)\s*\)\s*{([\s\S]*?)}/g;
  let methodMatch;
  while ((methodMatch = methodRegex.exec(classBody)) !== null) {
    const name = methodMatch[1];
    const args = methodMatch[2] || "";
    let body = methodMatch[3].trim();

    // Replace this.prop = val with setProp(val)
    reactState.forEach(stateLine => {
      const stateName = stateLine.match(/const\s+\[(\w+)/)?.[1];
      if (stateName) {
        const thisSetRegex = new RegExp(`this\\.${stateName}\\s*=\\s*([^;\\n]+)`, 'g');
        body = body.replace(thisSetRegex, `set${stateName.charAt(0).toUpperCase()}${stateName.slice(1)}($1)`);

        const thisGetRegex = new RegExp(`this\\.${stateName}`, 'g');
        body = body.replace(thisGetRegex, stateName);
      }
    });

    reactMethods.push(`const ${name} = (${args}) => {\n    ${body}\n  };`);
  }

  // 4. Translate Angular directives inside the template to JSX
  let jsx = template;

  // Convert double braces: {{ title }} -> {title}
  jsx = jsx.replace(/\{\{\s*([\s\S]*?)\s*\}\}/g, "{$1}");

  // Convert event bindings: (click)="handleClick()" -> onClick={handleClick}
  jsx = jsx.replace(/\((\w+)\)=["']([^"'\(\)]*)(?:\(\))?["']/g, (m, event, handler) => {
    const reactEvent = `on${event.charAt(0).toUpperCase()}${event.slice(1)}`;
    return `${reactEvent}={${handler.trim()}}`;
  });

  // Convert property bindings: [src]="logo" -> src={logo}
  jsx = jsx.replace(/\[(\w+)\]=["']([^"']+)["']/g, "$1={$2}");

  // Convert *ngIf="condition" -> {condition && <Element />}
  const ngIfRegex = /<(\w+)([^>]*?)\s*\*ngIf=["']([^"']+)["']([^>]*?)>([\s\S]*?)<\/\1>/g;
  jsx = jsx.replace(ngIfRegex, "{$3 && <$1$2$4>$5</$1>}");

  // Convert *ngFor="let item of items" -> {items.map(item => <Element />)}
  const ngForRegex = /<(\w+)([^>]*?)\s*\*ngFor=["']let\s+(\w+)\s+of\s+(\w+)["']([^>]*?)>([\s\S]*?)<\/\1>/g;
  jsx = jsx.replace(ngForRegex, "{$4.map($3 => <$1$2$5>$6</$1>)}");

  // Remove any remaining unresolved Angular directives
  jsx = jsx.replace(/\s*\*ngIf=["'][^"']+["']/g, "");
  jsx = jsx.replace(/\s*\*ngFor=["'][^"']+["']/g, "");

  // 5. Assemble React output
  const imports = `import React, { useState } from 'react';\n`;
  const stateCode = reactState.join("\n  ");
  const methodsCode = reactMethods.join("\n  ");

  return `${imports}
export default function ${className}() {
  ${stateCode}
  
  ${methodsCode}
  
  return (
    ${jsx}
  );
}
`;
}
