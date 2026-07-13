import * as ts from "typescript";
import { ParsedFile } from "../../types/parser.types";

/**
 * Transforms React component code to Qwik using AST-based compiler.
 */
export function migrateReactCodeToQwik(sourceCode: string, filePath: string): string {
  const sourceFile = ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true);

  const stateVars = new Map<string, string>(); // getter -> setter

  // 1. Scan for React state variables and their setters: const [count, setCount] = useState(0)
  function scanStates(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isCallExpression(node.initializer)) {
      const call = node.initializer;
      const name = call.expression.getText(sourceFile);
      if (name === "useState" && ts.isArrayBindingPattern(node.name) && node.name.elements.length >= 1) {
        const getter = node.name.elements[0];
        const setter = node.name.elements[1];
        if (
          ts.isBindingElement(getter) && ts.isIdentifier(getter.name) &&
          setter && ts.isBindingElement(setter) && ts.isIdentifier(setter.name)
        ) {
          stateVars.set(getter.name.text, setter.name.text);
        }
      }
    }
    ts.forEachChild(node, scanStates);
  }
  scanStates(sourceFile);

  // 2. Transformer
  function transformer<T extends ts.Node>(context: ts.TransformationContext) {
    return (rootNode: T) => {
      function visit(node: ts.Node): ts.Node {
        // A. Convert imports
        if (ts.isImportDeclaration(node)) {
          const specifier = (node.moduleSpecifier as ts.StringLiteral).text;
          if (specifier === "react") {
            const clauses = ["component$"];
            node.importClause?.namedBindings?.forEachChild(named => {
              const name = named.getText(sourceFile);
              if (name === "useState") clauses.push("useSignal");
              else if (name === "useEffect") clauses.push("useVisibleTask$");
              else if (name === "useStore" || name === "useContext") clauses.push("useStore");
            });

            return ts.factory.createImportDeclaration(
              undefined,
              ts.factory.createImportClause(
                false,
                undefined,
                ts.factory.createNamedImports(
                  clauses.map(c => ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier(c)))
                )
              ),
              ts.factory.createStringLiteral("@builder.io/qwik")
            );
          }
        }

        // B. Convert React functional component declarations: export default function Header() {} -> export const Header = component$(() => {})
        if (ts.isFunctionDeclaration(node) && node.name && /^[A-Z]/.test(node.name.text)) {
          const name = node.name.text;
          const params = node.parameters;
          const body = node.body ? (visit(node.body) as ts.Block) : ts.factory.createBlock([]);

          const isDefaultExport = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) &&
                                  node.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword);

          const arrowFunc = ts.factory.createArrowFunction(
            undefined,
            undefined,
            params,
            undefined,
            ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
            body
          );

          const qwikComponentCall = ts.factory.createCallExpression(
            ts.factory.createIdentifier("component$"),
            undefined,
            [arrowFunc]
          );

          const varDecl = ts.factory.createVariableDeclaration(
            ts.factory.createIdentifier(name),
            undefined,
            undefined,
            qwikComponentCall
          );

          const modifiers = [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)];
          const varStatement = ts.factory.createVariableStatement(
            modifiers,
            ts.factory.createVariableDeclarationList([varDecl], ts.NodeFlags.Const)
          );

          if (isDefaultExport) {
            // Keep named export but also append export default at end
            return varStatement;
          }
          return varStatement;
        }

        // C. Convert useState declaration to useSignal: const [count, setCount] = useState(0) -> const count = useSignal(0)
        if (ts.isVariableStatement(node)) {
          const declarations = node.declarationList.declarations;
          if (declarations.length === 1 && declarations[0].initializer && ts.isCallExpression(declarations[0].initializer)) {
            const init = declarations[0].initializer;
            const name = init.expression.getText(sourceFile);
            if (name === "useState" && ts.isArrayBindingPattern(declarations[0].name)) {
              const getter = declarations[0].name.elements[0];
              if (ts.isBindingElement(getter) && ts.isIdentifier(getter.name)) {
                return ts.factory.createVariableStatement(
                  node.modifiers,
                  ts.factory.createVariableDeclarationList([
                    ts.factory.createVariableDeclaration(
                      getter.name,
                      undefined,
                      undefined,
                      ts.factory.createCallExpression(
                        ts.factory.createIdentifier("useSignal"),
                        init.typeArguments,
                        init.arguments
                      )
                    )
                  ], ts.NodeFlags.Const)
                );
              }
            }
          }
        }

        // D. Convert state variables getter references to count.value
        if (ts.isIdentifier(node) && stateVars.has(node.text)) {
          // Verify it's not a variable declaration LHS
          let isLhsOrDecl = false;
          let parent = node.parent;
          if (parent) {
            if (ts.isVariableDeclaration(parent) && parent.name === node) {
              isLhsOrDecl = true;
            } else if (ts.isBindingElement(parent) && parent.name === node) {
              isLhsOrDecl = true;
            } else if (ts.isPropertyAccessExpression(parent) && parent.expression === node && parent.name.text === "value") {
              // already has .value
              isLhsOrDecl = true;
            }
          }

          if (!isLhsOrDecl) {
            return ts.factory.createPropertyAccessExpression(
              node,
              ts.factory.createIdentifier("value")
            );
          }
        }

        // E. Convert state setter calls to assignments: setCount(count + 1) -> count.value = count.value + 1
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
          const setterName = node.expression.text;
          // Find matching state var
          let stateVar: string | undefined;
          for (const [getter, setter] of stateVars.entries()) {
            if (setter === setterName) {
              stateVar = getter;
              break;
            }
          }

          if (stateVar && node.arguments.length > 0) {
            const arg = visit(node.arguments[0]) as ts.Expression;
            // E.g. count.value = arg
            return ts.factory.createBinaryExpression(
              ts.factory.createPropertyAccessExpression(
                ts.factory.createIdentifier(stateVar),
                ts.factory.createIdentifier("value")
              ),
              ts.factory.createToken(ts.SyntaxKind.EqualsToken),
              arg
            );
          }
        }

        // F. Convert useEffect to useVisibleTask$
        if (ts.isCallExpression(node)) {
          const name = node.expression.getText(sourceFile);
          if (name === "useEffect") {
            const callback = visit(node.arguments[0]) as ts.Expression;
            return ts.factory.createCallExpression(
              ts.factory.createIdentifier("useVisibleTask$"),
              undefined,
              [callback]
            );
          }
        }

        // G. JSX Attributes: onClick -> onClick$, class/className -> class
        if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
          const attrName = node.name.text;
          if (attrName.startsWith("on") && attrName.length > 2 && /^[A-Z]/.test(attrName[2])) {
            // onClick -> onClick$
            return ts.factory.createJsxAttribute(
              ts.factory.createIdentifier(`${attrName}$`),
              node.initializer ? (visit(node.initializer) as ts.JsxAttributeValue) : undefined
            );
          }
          if (attrName === "className") {
            return ts.factory.createJsxAttribute(
              ts.factory.createIdentifier("class"),
              node.initializer ? (visit(node.initializer) as ts.JsxAttributeValue) : undefined
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
 * Project-wide orchestrator for React to Qwik migration.
 */
export function migrateReactProjectToQwik(files: ParsedFile[]): ParsedFile[] {
  return files.map(file => {
    if (file.path.endsWith(".tsx") || file.path.endsWith(".jsx")) {
      const code = migrateReactCodeToQwik(file.content, file.path);
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
          pkg.dependencies["@builder.io/qwik"] = "^1.5.0";
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
