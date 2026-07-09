import * as ts from "typescript";
import { ParsedFile } from "../../types/parser.types";

/**
 * Transforms React component code to SolidJS using AST-based compiler.
 */
export function migrateReactCodeToSolid(sourceCode: string, filePath: string): string {
  const sourceFile = ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true);
  
  // Track extracted states to convert their variables to function getters in Solid: count -> count()
  const stateVars = new Set<string>();
  const stateSetters = new Set<string>();

  // Find all React useState variable names in the AST
  function findStateVariables(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isCallExpression(node.initializer)) {
      const call = node.initializer;
      const hookName = call.expression.getText(sourceFile);
      if (hookName === "useState" && ts.isArrayBindingPattern(node.name) && node.name.elements.length >= 1) {
        const getter = node.name.elements[0];
        const setter = node.name.elements[1];
        if (ts.isBindingElement(getter) && ts.isIdentifier(getter.name)) {
          stateVars.add(getter.name.text);
        }
        if (setter && ts.isBindingElement(setter) && ts.isIdentifier(setter.name)) {
          stateSetters.add(setter.name.text);
        }
      }
    }
    ts.forEachChild(node, findStateVariables);
  }
  findStateVariables(sourceFile);

  // AST transformer to perform translations
  function transformer<T extends ts.Node>(context: ts.TransformationContext) {
    return (rootNode: T) => {
      function visit(node: ts.Node): ts.Node {
        // 1. Convert Imports
        if (ts.isImportDeclaration(node)) {
          const specifier = (node.moduleSpecifier as ts.StringLiteral).text;
          if (specifier === "react") {
            const clauses: string[] = [];
            node.importClause?.namedBindings?.forEachChild(named => {
              const name = named.getText(sourceFile);
              if (name === "useState") clauses.push("createSignal");
              else if (name === "useEffect") clauses.push("createEffect");
              else if (name === "useMemo") clauses.push("createMemo");
              else if (name === "useRef") clauses.push("createSignal"); // Solid uses simple vars or signals for refs
              else if (name !== "useCallback") clauses.push(name);
            });
            
            if (clauses.length === 0) return ts.factory.createEmptyStatement();

            return ts.factory.createImportDeclaration(
              undefined,
              ts.factory.createImportClause(
                false,
                undefined,
                ts.factory.createNamedImports(
                  clauses.map(c => ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier(c)))
                )
              ),
              ts.factory.createStringLiteral("solid-js")
            );
          }
        }

        // 2. Map Hooks Calls (useState -> createSignal, useEffect -> createEffect, etc.)
        if (ts.isCallExpression(node)) {
          const name = node.expression.getText(sourceFile);
          if (name === "useState") {
            return ts.factory.createCallExpression(
              ts.factory.createIdentifier("createSignal"),
              node.typeArguments,
              node.arguments
            );
          }
          if (name === "useEffect") {
            // Solid createEffect doesn't use dependency arrays
            const args = node.arguments.slice(0, 1);
            return ts.factory.createCallExpression(
              ts.factory.createIdentifier("createEffect"),
              undefined,
              args
            );
          }
          if (name === "useMemo") {
            const args = node.arguments.slice(0, 1);
            return ts.factory.createCallExpression(
              ts.factory.createIdentifier("createMemo"),
              undefined,
              args
            );
          }
          if (name === "useCallback") {
            // useCallback is redundant in Solid, return callback function directly
            return node.arguments[0];
          }
        }

        // 3. Convert state variable accesses to function calls: count -> count()
        if (ts.isIdentifier(node) && stateVars.has(node.text)) {
          // Check if this identifier is parented by variable declaration or assignment LHS to avoid converting declarator
          let isLhsOrDecl = false;
          let parent = node.parent;
          
          if (parent) {
            if (ts.isVariableDeclaration(parent) && parent.name === node) {
              isLhsOrDecl = true;
            } else if (ts.isBindingElement(parent) && parent.name === node) {
              isLhsOrDecl = true;
            } else if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
              // property access, e.g. count.toString() -> count().toString()
              isLhsOrDecl = false;
            }
          }

          if (!isLhsOrDecl) {
            return ts.factory.createCallExpression(node, undefined, []);
          }
        }

        // 4. Clean up useRef current accesses: myRef.current -> myRef()
        if (ts.isPropertyAccessExpression(node) && node.name.text === "current") {
          const refExpr = visit(node.expression) as ts.Expression;
          return ts.factory.createCallExpression(refExpr, undefined, []);
        }

        // 5. JSX Element Transformations
        if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === "className") {
          return ts.factory.createJsxAttribute(
            ts.factory.createIdentifier("class"),
            node.initializer
          );
        }

        // 6. JSX conditional/iterative maps compilation to Solid components
        if (ts.isJsxExpression(node) && node.expression) {
          const expr = node.expression;

          // A. Map lists: list.map(item => <Element />) -> <For each={list}>{(item) => <Element />}</For>
          if (ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression) && expr.expression.name.text === "map") {
            const list = visit(expr.expression.expression) as ts.Expression;
            const callback = visit(expr.arguments[0]) as ts.Expression;

            return ts.factory.createJsxElement(
              ts.factory.createJsxOpeningElement(
                ts.factory.createIdentifier("For"),
                undefined,
                ts.factory.createJsxAttributes([
                  ts.factory.createJsxAttribute(
                    ts.factory.createIdentifier("each"),
                    ts.factory.createJsxExpression(undefined, list)
                  )
                ])
              ),
              [ts.factory.createJsxExpression(undefined, callback)],
              ts.factory.createJsxClosingElement(ts.factory.createIdentifier("For"))
            );
          }

          // B. Ternary: cond ? A : B -> <Show when={cond} fallback={B}>A</Show>
          if (ts.isConditionalExpression(expr)) {
            const cond = visit(expr.condition) as ts.Expression;
            const whenTrue = visit(expr.whenTrue) as ts.Expression;
            const whenFalse = visit(expr.whenFalse) as ts.Expression;

            return ts.factory.createJsxElement(
              ts.factory.createJsxOpeningElement(
                ts.factory.createIdentifier("Show"),
                undefined,
                ts.factory.createJsxAttributes([
                  ts.factory.createJsxAttribute(
                    ts.factory.createIdentifier("when"),
                    ts.factory.createJsxExpression(undefined, cond)
                  ),
                  ts.factory.createJsxAttribute(
                    ts.factory.createIdentifier("fallback"),
                    ts.factory.createJsxExpression(undefined, whenFalse)
                  )
                ])
              ),
              [
                ts.isJsxElement(whenTrue) || ts.isJsxSelfClosingElement(whenTrue)
                  ? whenTrue
                  : ts.factory.createJsxExpression(undefined, whenTrue)
              ],
              ts.factory.createJsxClosingElement(ts.factory.createIdentifier("Show"))
            );
          }

          // C. Logical AND: cond && A -> <Show when={cond}>A</Show>
          if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
            const cond = visit(expr.left) as ts.Expression;
            const whenTrue = visit(expr.right) as ts.Expression;

            return ts.factory.createJsxElement(
              ts.factory.createJsxOpeningElement(
                ts.factory.createIdentifier("Show"),
                undefined,
                ts.factory.createJsxAttributes([
                  ts.factory.createJsxAttribute(
                    ts.factory.createIdentifier("when"),
                    ts.factory.createJsxExpression(undefined, cond)
                  )
                ])
              ),
              [
                ts.isJsxElement(whenTrue) || ts.isJsxSelfClosingElement(whenTrue)
                  ? whenTrue
                  : ts.factory.createJsxExpression(undefined, whenTrue)
              ],
              ts.factory.createJsxClosingElement(ts.factory.createIdentifier("Show"))
            );
          }
        }

        return ts.visitEachChild(node, visit, context);
      }
      return visit(rootNode);
    };
  }

  const result = ts.transform(sourceFile, [transformer]);
  const printer = ts.createPrinter();
  const transformedCode = printer.printNode(
    ts.EmitHint.SourceFile,
    result.transformed[0] as ts.SourceFile,
    sourceFile
  );

  return transformedCode;
}

/**
 * Project-wide orchestrator for React to SolidJS migration.
 */
export function migrateReactProjectToSolid(files: ParsedFile[]): ParsedFile[] {
  return files.map(file => {
    if (file.path.endsWith(".tsx") || file.path.endsWith(".jsx")) {
      const code = migrateReactCodeToSolid(file.content, file.path);
      return {
        path: file.path,
        content: code,
      };
    }
    if (file.path === "package.json") {
      try {
        const pkg = JSON.parse(file.content);
        if (pkg.dependencies) {
          delete pkg.dependencies["react"];
          delete pkg.dependencies["react-dom"];
          pkg.dependencies["solid-js"] = "^1.8.0";
        }
        return {
          path: file.path,
          content: JSON.stringify(pkg, null, 2),
        };
      } catch {
        return file;
      }
    }
    return file;
  });
}
