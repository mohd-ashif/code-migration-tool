import * as ts from "typescript";
import { transformStateSetters } from "./state-transformer";

export function generateComposable(
  hookCode: string,
  states: Array<{ name: string; setter: string }>
): string {
  // 1. Transform React state setters and value readings using AST transformer
  const code = transformStateSetters(hookCode, states);

  // 2. Perform AST transformations to convert React imports and core hooks
  const sourceFile = ts.createSourceFile("temp.ts", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  const transformer = (context: ts.TransformationContext) => {
    return (rootNode: ts.Node) => {
      const visit = (node: ts.Node): ts.Node => {
        // Strip imports from 'react'
        if (ts.isImportDeclaration(node)) {
          const specifier = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, "");
          if (specifier === "react") {
            return ts.factory.createEmptyStatement();
          }
        }

        // Convert Hook calls to Vue equivalents
        if (ts.isCallExpression(node)) {
          const calleeText = node.expression.getText(sourceFile);

          if (calleeText === "useState" || calleeText === "useRef") {
            return ts.factory.createCallExpression(
              ts.factory.createIdentifier("ref"),
              node.typeArguments,
              node.arguments
            );
          }

          if (calleeText === "useMemo") {
            const firstArg = node.arguments[0];
            return ts.factory.createCallExpression(
              ts.factory.createIdentifier("computed"),
              undefined,
              firstArg ? [firstArg] : []
            );
          }

          if (calleeText === "useCallback") {
            const firstArg = node.arguments[0];
            if (firstArg) {
              return ts.visitNode(firstArg, visit);
            }
          }

          if (calleeText === "useEffect") {
            const callback = node.arguments[0];
            const deps = node.arguments[1];
            if (callback) {
              if (deps && ts.isArrayLiteralExpression(deps) && deps.elements.length > 0) {
                const watchSource = deps.elements.length === 1 ? deps.elements[0] : deps;
                return ts.factory.createCallExpression(
                  ts.factory.createIdentifier("watch"),
                  undefined,
                  [watchSource, callback]
                );
              }
              return ts.factory.createCallExpression(
                ts.factory.createIdentifier("watchEffect"),
                undefined,
                [callback]
              );
            }
          }
        }

        return ts.visitEachChild(node, visit, context);
      };
      return ts.visitNode(rootNode, visit);
    };
  };

  const result = ts.transform(sourceFile, [transformer]);
  const printer = ts.createPrinter();
  let output = printer.printFile(result.transformed[0] as ts.SourceFile);
  
  // Clean up any double semicolons from deleted imports
  output = output.replace(/;\s*;/g, ";");
  
  return output.trim();
}
