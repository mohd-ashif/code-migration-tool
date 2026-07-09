import * as ts from "typescript";

export function transformStateSetters(code: string, states: Array<{ name: string; setter: string }>): string {
  if (!code.trim()) return code;

  // Create temporary source file
  const sourceFile = ts.createSourceFile("temp.ts", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  // Map setter names to their state variable names
  const setterToState = new Map<string, string>();
  states.forEach((s) => setterToState.set(s.setter, s.name));

  const transformer = (context: ts.TransformationContext) => {
    return (rootNode: ts.Node) => {
      const visit = (node: ts.Node): ts.Node => {
        // If we find a call expression like: setCount(...) or this.setState(...)
        if (ts.isCallExpression(node)) {
          const calleeText = node.expression.getText(sourceFile);

          // Hook setters: e.g. setCount(...)
          if (setterToState.has(calleeText)) {
            const stateName = setterToState.get(calleeText)!;
            const arg = node.arguments[0];
            if (arg) {
              // Arrow functions / update callbacks: setCount(c => c + 1)
              if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
                const params = arg.parameters;
                if (params.length > 0 && ts.isIdentifier(params[0].name)) {
                  const paramName = params[0].name.text;
                  const bodyNode = arg.body;
                  let bodyText = bodyNode.getText(sourceFile);

                  if (ts.isBlock(bodyNode)) {
                    const returnStmt = bodyNode.statements.find(ts.isReturnStatement);
                    if (returnStmt && returnStmt.expression) {
                      bodyText = returnStmt.expression.getText(sourceFile);
                    }
                  }

                  const replacedBody = replaceIdentifierText(bodyText, paramName, stateName);
                  return ts.factory.createIdentifier(`${stateName} = ${replacedBody}`);
                }
              }
              // Normal values: setCount(count + 1)
              return ts.factory.createIdentifier(`${stateName} = ${arg.getText(sourceFile)}`);
            }
          }

          // Class components: this.setState(...) or setState(...)
          if (calleeText === "this.setState" || calleeText === "setState") {
            const arg = node.arguments[0];
            if (arg && ts.isObjectLiteralExpression(arg)) {
              const assignments: string[] = [];
              arg.properties.forEach((prop) => {
                if (prop.name) {
                  const propName = prop.name.getText(sourceFile);
                  let propVal = "";
                  if (ts.isPropertyAssignment(prop)) {
                    propVal = prop.initializer.getText(sourceFile);
                  } else if (ts.isShorthandPropertyAssignment(prop)) {
                    propVal = propName;
                  }
                  // Rewrite this.state.propName -> propName
                  const cleanVal = propVal.replace(/this\.state\./g, "");
                  assignments.push(`${propName} = ${cleanVal}`);
                }
              });
              return ts.factory.createIdentifier(assignments.join("; "));
            }
          }
        }

        // Class component state reads: this.state.count -> count
        if (ts.isPropertyAccessExpression(node)) {
          const text = node.getText(sourceFile);
          if (text.startsWith("this.state.")) {
            const propName = node.name.text;
            return ts.factory.createIdentifier(propName);
          }
        }

        return ts.visitEachChild(node, visit, context);
      };
      return ts.visitNode(rootNode, visit);
    };
  };

  const result = ts.transform(sourceFile, [transformer]);
  const printer = ts.createPrinter();
  const transformedSourceFile = result.transformed[0] as ts.SourceFile;
  const output = printer.printFile(transformedSourceFile);

  return output.trim();
}

function replaceIdentifierText(code: string, oldId: string, newId: string): string {
  const sf = ts.createSourceFile("temp2.ts", code, ts.ScriptTarget.Latest, true);
  const transformer = (context: ts.TransformationContext) => {
    return (rootNode: ts.Node) => {
      const visit = (node: ts.Node): ts.Node => {
        if (ts.isIdentifier(node) && node.text === oldId) {
          return ts.factory.createIdentifier(newId);
        }
        return ts.visitEachChild(node, visit, context);
      };
      return ts.visitNode(rootNode, visit);
    };
  };
  const result = ts.transform(sf, [transformer]);
  const printer = ts.createPrinter();
  return printer.printFile(result.transformed[0] as ts.SourceFile).trim();
}
