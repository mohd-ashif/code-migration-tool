import * as ts from "typescript";
import { ParsedFile } from "../../types/parser.types";

/**
 * Parses Angular Component TypeScript classes and HTML templates to build Next.js / React TSX components.
 */
export function migrateAngularCodeToNext(
  tsCode: string,
  htmlCode: string,
  filePath: string
): string {
  const sourceFile = ts.createSourceFile(filePath, tsCode, ts.ScriptTarget.Latest, true);

  let componentName = "AngularComponent";
  const classProperties: Array<{ name: string; type: string; initializer?: string }> = [];
  const classMethods: Array<{ name: string; body: string; params: string[] }> = [];

  // Parse Angular TS Class AST
  function visitClass(node: ts.Node) {
    if (ts.isClassDeclaration(node) && node.name) {
      componentName = node.name.text;

      node.members.forEach((member) => {
        // Properties mapping to React states or variables
        if (ts.isPropertyDeclaration(member) && member.name) {
          const name = member.name.getText(sourceFile);
          const type = member.type ? member.type.getText(sourceFile) : "any";
          const initializer = member.initializer ? member.initializer.getText(sourceFile) : undefined;
          classProperties.push({ name, type, initializer });
        }

        // Methods mapping to React component helpers
        if (ts.isMethodDeclaration(member) && member.name && member.body) {
          const name = member.name.getText(sourceFile);
          const params = member.parameters.map((p) => p.getText(sourceFile));
          
          // Strip "this." inside body for React local variables
          let bodyText = member.body.getText(sourceFile);
          
          classMethods.push({
            name,
            params,
            body: bodyText,
          });
        }
      });
    }
    ts.forEachChild(node, visitClass);
  }
  
  visitClass(sourceFile);

  // Translate Angular HTML templates to JSX syntax
  let jsxTemplate = htmlCode;

  // 1. Double curly interpolation: {{ value }} -> { value }
  jsxTemplate = jsxTemplate.replace(/\{\{\s*(.*?)\s*\}\}/g, "{$1}");

  // 2. Event bindings: (click)="handler()" -> onClick={handler}
  jsxTemplate = jsxTemplate.replace(/\(click\)\s*=\s*["'](.*?)\s*\(?\)?["']/g, "onClick={$1}");
  jsxTemplate = jsxTemplate.replace(/\(input\)\s*=\s*["'](.*?)\(["']/g, "onInput={$1}");
  jsxTemplate = jsxTemplate.replace(/\(submit\)\s*=\s*["'](.*?)\s*\(?\)?["']/g, "onSubmit={$1}");

  // 3. Property bindings: [src]="image" -> src={image}
  jsxTemplate = jsxTemplate.replace(/\[(.*?)]\s*=\s*["'](.*?)["']/g, "$1={$2}");

  // 4. Two way binding: [(ngModel)]="username" -> value={username} onChange={(e) => setUsername(e.target.value)}
  const ngModelRegex = /\[\(ngModel\)]\s*=\s*["'](.*?)["']/g;
  let match;
  while ((match = ngModelRegex.exec(jsxTemplate)) !== null) {
    const field = match[1];
    const setterName = `set${field.charAt(0).toUpperCase()}${field.slice(1)}`;
    jsxTemplate = jsxTemplate.replace(
      match[0],
      `value={${field}} onChange={(e) => ${setterName}(e.target.value)}`
    );
  }

  // 5. Directives: *ngIf="condition"
  // E.g. <div *ngIf="show">Hello</div> -> {show && (<div>Hello</div>)}
  const ngIfRegex = /<([a-zA-Z0-9\-]+)([^>]*?)\*ngIf\s*=\s*["'](.*?)["']([^>]*?)>([\s\S]*?)<\/\1>/g;
  jsxTemplate = jsxTemplate.replace(ngIfRegex, (_, tag, attrsBefore, cond, attrsAfter, children) => {
    const cleanAttrs = (attrsBefore + attrsAfter).trim();
    const attrsStr = cleanAttrs ? ` ${cleanAttrs}` : "";
    return `{${cond} && (<${tag}${attrsStr}>${children}</${tag}>)}`;
  });

  // 6. Directives: *ngFor="let item of items"
  // E.g. <li *ngFor="let item of list">{{item}}</li> -> {list.map((item) => (<li key={item.id}>{item}</li>))}
  const ngForRegex = /<([a-zA-Z0-9\-]+)([^>]*?)\*ngFor\s*=\s*["']let\s+(.*?)\s+of\s+(.*?)["']([^>]*?)>([\s\S]*?)<\/\1>/g;
  jsxTemplate = jsxTemplate.replace(ngForRegex, (_, tag, attrsBefore, variable, list, attrsAfter, children) => {
    const cleanAttrs = (attrsBefore + attrsAfter).trim();
    const attrsStr = cleanAttrs ? ` ${cleanAttrs}` : "";
    return `{${list}?.map((${variable}) => (<${tag}${attrsStr} key={${variable}.id || ${variable}}>${children}</${tag}>))}`;
  });

  // 7. General template cleanup class -> className
  jsxTemplate = jsxTemplate.replace(/class=/g, "className=");

  // Assemble Next.js page Component
  const reactImports = 'import React, { useState } from "react";\n';
  
  // React State Declarations for all Angular properties
  const states = classProperties.map((p) => {
    const setterName = `set${p.name.charAt(0).toUpperCase()}${p.name.slice(1)}`;
    const defaultVal = p.initializer || "undefined";
    return `  const [${p.name}, ${setterName}] = useState<${p.type}>(${defaultVal});`;
  }).join("\n");

  // React local method declarations (handling Angular 'this' access conversion)
  const methods = classMethods.map((m) => {
    // Replace "this.prop = val" -> "setProp(val)"
    let body = m.body.slice(1, -1); // Strip outer braces
    classProperties.forEach((p) => {
      const setterName = `set${p.name.charAt(0).toUpperCase()}${p.name.slice(1)}`;
      
      // Replace assignment: this.prop = val -> setProp(val)
      const assignmentRegex = new RegExp(`this\\.${p.name}\\s*=\\s*(.*?);`, "g");
      body = body.replace(assignmentRegex, `${setterName}($1);`);

      // Replace reading: this.prop -> prop
      const readRegex = new RegExp(`this\\.${p.name}`, "g");
      body = body.replace(readRegex, p.name);
    });

    // Replace other methods invocation
    classMethods.forEach((other) => {
      const callRegex = new RegExp(`this\\.${other.name}\\(`, "g");
      body = body.replace(callRegex, `${other.name}(`);
    });

    return `  const ${m.name} = (${m.params.join(", ")}) => {${body}};`;
  }).join("\n\n");

  const componentCode = `${reactImports}
export default function ${componentName}() {
${states}

${methods}

  return (
    <>
      ${jsxTemplate.trim().split("\n").join("\n      ")}
    </>
  );
}
`;

  return componentCode;
}

/**
 * Project-wide orchestrator for Angular to Next.js Page migrations.
 */
export function migrateAngularProjectToNext(files: ParsedFile[]): ParsedFile[] {
  const result: ParsedFile[] = [];
  const componentMap = new Map<string, { ts?: string; html?: string }>();

  // Group files by path prefix
  files.forEach((file) => {
    const tsMatch = file.path.match(/(.*)\.component\.ts$/);
    const htmlMatch = file.path.match(/(.*)\.component\.html$/);

    if (tsMatch) {
      const base = tsMatch[1];
      const data = componentMap.get(base) || {};
      data.ts = file.content;
      componentMap.set(base, data);
    } else if (htmlMatch) {
      const base = htmlMatch[1];
      const data = componentMap.get(base) || {};
      data.html = file.content;
      componentMap.set(base, data);
    } else {
      result.push(file);
    }
  });

  // Compile grouped Angular components to Next.js pages/components
  componentMap.forEach((data, base) => {
    if (data.ts && data.html) {
      const filename = path.basename(base);
      const componentName = filename.charAt(0).toUpperCase() + filename.slice(1);
      const migratedCode = migrateAngularCodeToNext(data.ts, data.html, `${filename}.ts`);
      
      result.push({
        path: `components/${componentName}.tsx`,
        content: migratedCode,
      });
    } else {
      if (data.ts) result.push({ path: `${base}.component.ts`, content: data.ts });
      if (data.html) result.push({ path: `${base}.component.html`, content: data.html });
    }
  });

  // package.json conversion
  const pkgFile = files.find(f => f.path === "package.json");
  if (pkgFile) {
    try {
      const pkg = JSON.parse(pkgFile.content);
      if (pkg.dependencies) {
        delete pkg.dependencies["@angular/core"];
        delete pkg.dependencies["@angular/common"];
        pkg.dependencies["next"] = "^14.0.0";
        pkg.dependencies["react"] = "^18.2.0";
        pkg.dependencies["react-dom"] = "^18.2.0";
      }
      const pkgIdx = result.findIndex(r => r.path === "package.json");
      if (pkgIdx !== -1) {
        result[pkgIdx] = { path: "package.json", content: JSON.stringify(pkg, null, 2) };
      }
    } catch {}
  }

  return result;
}
