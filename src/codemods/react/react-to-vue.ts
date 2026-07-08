import * as ts from "typescript";

export function transformReactToVue(sourceCode: string, filePath: string): { content: string; path: string } {
  const sourceFile = ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true);
  
  let jsxContent = "";
  const vueRefs: string[] = [];
  const vueMethods: string[] = [];
  const hookVariables: string[] = [];

  // Traverse AST to harvest react declarations and JSX structure
  function visit(node: ts.Node) {
    // 1. Identify useState hooks
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isCallExpression(node.initializer)) {
      const init = node.initializer;
      if (ts.isIdentifier(init.expression) && init.expression.text === "useState") {
        const binding = node.name;
        if (ts.isArrayBindingPattern(binding) && binding.elements.length >= 1) {
          const stateVar = binding.elements[0];
          if (ts.isBindingElement(stateVar) && ts.isIdentifier(stateVar.name)) {
            const stateName = stateVar.name.text;
            const initVal = init.arguments.length > 0 ? init.arguments[0].getText(sourceFile) : "null";
            vueRefs.push(`const ${stateName} = ref(${initVal});`);
            hookVariables.push(stateName);
          }
        }
      }
    }

    // 2. Identify handlers and helper arrow functions
    if (ts.isVariableDeclaration(node) && node.initializer && 
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      if (ts.isIdentifier(node.name)) {
        const methodName = node.name.text;
        let methodBody = node.initializer.getText(sourceFile);
        
        // Rewrite state setters to Vue ref .value operations
        hookVariables.forEach(stateName => {
          const setterName = `set${stateName.charAt(0).toUpperCase()}${stateName.slice(1)}`;
          const setterRegex = new RegExp(`${setterName}\\(\\s*([^)]+?)\\s*\\)`, 'g');
          methodBody = methodBody.replace(setterRegex, `${stateName}.value = $1`);
        });

        vueMethods.push(`const ${methodName} = ${methodBody};`);
      }
    }

    // 3. Find Return Statement containing JSX markup
    if (ts.isReturnStatement(node) && node.expression) {
      const expr = node.expression;
      if (ts.isParenthesizedExpression(expr) && expr.expression && 
          (ts.isJsxElement(expr.expression) || ts.isJsxFragment(expr.expression) || ts.isJsxSelfClosingElement(expr.expression))) {
        jsxContent = expr.expression.getText(sourceFile);
      } else if (ts.isJsxElement(expr) || ts.isJsxFragment(expr) || ts.isJsxSelfClosingElement(expr)) {
        jsxContent = expr.getText(sourceFile);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  // If no JSX content was isolated, return original content renamed
  if (!jsxContent) {
    const newPath = filePath.replace(/\.[a-zA-Z]+$/, ".vue");
    return { content: sourceCode, path: newPath };
  }

  // 4. Translate React JSX attributes/brackets to Vue equivalents
  let vueTemplate = jsxContent;

  // Convert className -> class
  vueTemplate = vueTemplate.replace(/className=/g, "class=");

  // Convert react event triggers to Vue event directives: e.g. onClick={increment} -> @click="increment"
  vueTemplate = vueTemplate.replace(/on(\w+)=\{\s*([^}]+?)\s*\}/g, (match, event, handler) => {
    return `@${event.toLowerCase()}="${handler}"`;
  });

  // Convert variable mustache interpolation: e.g. {count} -> {{ count }}
  vueTemplate = vueTemplate.replace(/\{([^}]+?)\}/g, "{{ $1 }}");

  // 5. Build final Vue Single File Component layout
  const vueSFC = `<template>
  ${vueTemplate}
</template>

<script setup>
import { ref } from 'vue';

${vueRefs.join("\n")}

${vueMethods.join("\n\n")}
</script>
`;

  const newPath = filePath.replace(/\.[a-zA-Z]+$/, ".vue");
  return { content: vueSFC, path: newPath };
}
