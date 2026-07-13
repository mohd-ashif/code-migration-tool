import * as ts from "typescript";

export function transformStateSetters(
  code: string,
  states: Array<{ name: string; setter: string }>,
  emits: Array<{ name: string; eventName: string }> = []
): string {
  if (!code.trim()) return code;

  const sourceFile = ts.createSourceFile("temp.ts", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  // Map setter names to their state variable names
  const setterToState = new Map<string, string>();
  states.forEach((s) => setterToState.set(s.setter, s.name));
  const stateNames = new Set(states.map((s) => s.name));

  let hasLocalStorageInit = false;
  let localStorageKey = "expenses";
  let localStorageVar = "items";

  const transformer = (context: ts.TransformationContext) => {
    return (rootNode: ts.Node) => {
      const visit = (node: ts.Node): ts.Node => {
        // 0.1. Convert React Query useQuery / useSWR -> Nuxt 3 useAsyncData
        if (ts.isVariableDeclaration(node) && node.initializer) {
          let isSpecialHook = false;
          if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) {
            isSpecialHook = true;
          }
          if (ts.isCallExpression(node.initializer)) {
            const calleeText = node.initializer.expression.getText(sourceFile);
            if (calleeText === "useState" || calleeText.endsWith(".useState") || calleeText === "useQuery" || calleeText === "useSWR") {
              isSpecialHook = true;
            }
          }

          if (!isSpecialHook) {
            // Check if initializer references any state variables in stateNames
            let referencesState = false;
            const checkRef = (n: ts.Node) => {
              if (ts.isIdentifier(n) && stateNames.has(n.text)) {
                referencesState = true;
              }
              ts.forEachChild(n, checkRef);
            };
            checkRef(node.initializer);

            if (referencesState) {
              let isHook = false;
              if (ts.isCallExpression(node.initializer)) {
                const callee = node.initializer.expression.getText(sourceFile);
                if (
                  callee === "useMemo" ||
                  callee === "useCallback" ||
                  callee === "useRef" ||
                  callee === "computed"
                ) {
                  isHook = true;
                }
              }

              if (!isHook && ts.isIdentifier(node.name)) {
                const varName = node.name.text;
                const visitedInit = ts.visitNode(node.initializer, visit) as ts.Expression;
                return ts.factory.createVariableDeclaration(
                  ts.factory.createIdentifier(varName),
                  node.exclamationToken,
                  node.type,
                  ts.factory.createCallExpression(
                    ts.factory.createIdentifier("computed"),
                    undefined,
                    [
                      ts.factory.createArrowFunction(
                        undefined,
                        undefined,
                        [],
                        undefined,
                        undefined,
                        visitedInit
                      )
                    ]
                  )
                );
              }
            }
          }
        }

        if (ts.isVariableDeclaration(node) && node.initializer && ts.isCallExpression(node.initializer)) {
          const calleeText = node.initializer.expression.getText(sourceFile);
          
          if ((calleeText === "useState" || calleeText.endsWith(".useState")) && ts.isArrayBindingPattern(node.name)) {
            const elements = node.name.elements;
            if (elements.length >= 1) {
              const stateVar = elements[0];
              if (ts.isBindingElement(stateVar) && ts.isIdentifier(stateVar.name)) {
                const name = stateVar.name.text;
                
                let initArg = node.initializer.arguments[0];
                let isLocalStorageInit = false;

                if (initArg) {
                  const initText = initArg.getText(sourceFile);
                  if (initText.indexOf("localStorage.getItem") !== -1) {
                    isLocalStorageInit = true;
                    hasLocalStorageInit = true;
                    localStorageVar = name;
                    
                    const getIdx = initText.indexOf("getItem(");
                    if (getIdx !== -1) {
                      const startQuote = initText.indexOf("'", getIdx + 8);
                      const doubleQuote = initText.indexOf('"', getIdx + 8);
                      const quoteChar = (startQuote !== -1 && (doubleQuote === -1 || startQuote < doubleQuote)) ? "'" : '"';
                      const keyStart = initText.indexOf(quoteChar, getIdx + 8);
                      if (keyStart !== -1) {
                        const keyEnd = initText.indexOf(quoteChar, keyStart + 1);
                        if (keyEnd !== -1) {
                          localStorageKey = initText.substring(keyStart + 1, keyEnd);
                        }
                      }
                    }
                  }

                  if (ts.isArrowFunction(initArg) || ts.isFunctionExpression(initArg)) {
                    const body = initArg.body;
                    if (ts.isBlock(body)) {
                      const returnStmt = body.statements.find(ts.isReturnStatement);
                      if (returnStmt && returnStmt.expression) {
                        initArg = returnStmt.expression;
                      }
                    } else {
                      initArg = body;
                    }
                  }
                }

                let visitedInit = initArg ? (ts.visitNode(initArg, visit) as ts.Expression) : undefined;
                if (isLocalStorageInit) {
                  visitedInit = ts.factory.createArrayLiteralExpression();
                }

                let typeArgs: ts.NodeArray<ts.TypeNode> | undefined = node.initializer.typeArguments;
                if (node.type && ts.isTupleTypeNode(node.type) && node.type.elements.length >= 1) {
                  typeArgs = ts.factory.createNodeArray([node.type.elements[0]]);
                }

                return ts.factory.createVariableDeclaration(
                  ts.factory.createIdentifier(name),
                  node.exclamationToken,
                  undefined,
                  ts.factory.createCallExpression(
                    ts.factory.createIdentifier("ref"),
                    typeArgs,
                    visitedInit ? [visitedInit] : []
                  )
                );
              }
            }
          }

          if (calleeText === "useQuery" || calleeText === "useSWR") {
            if (ts.isObjectBindingPattern(node.name)) {
              const newElements = node.name.elements.map((el) => {
                if (ts.isIdentifier(el.name)) {
                  const propName = el.propertyName ? el.propertyName.getText(sourceFile) : el.name.text;
                  const varName = el.name.text;
                  
                  if (propName === "isLoading" || propName === "isPending") {
                    return ts.factory.createBindingElement(
                      undefined,
                      ts.factory.createIdentifier("pending"),
                      ts.factory.createIdentifier(varName)
                    );
                  }
                  if (propName === "refetch") {
                    return ts.factory.createBindingElement(
                      undefined,
                      ts.factory.createIdentifier("refresh"),
                      ts.factory.createIdentifier(varName)
                    );
                  }
                }
                return el;
              });

              const newName = ts.factory.createObjectBindingPattern(newElements);
              const newInitializer = ts.visitNode(node.initializer, visit) as ts.Expression;
              return ts.factory.createVariableDeclaration(
                newName,
                node.exclamationToken,
                node.type,
                newInitializer
              );
            }
          }
        }

        if (ts.isCallExpression(node)) {
          const calleeText = node.expression.getText(sourceFile);

          if (calleeText === "localStorage.getItem" || calleeText === "window.localStorage.getItem") {
            const visitedNode = ts.visitEachChild(node, visit, context) as ts.CallExpression;
            return ts.factory.createConditionalExpression(
              ts.factory.createPropertyAccessExpression(
                ts.factory.createPropertyAccessExpression(
                  ts.factory.createIdentifier("import"),
                  ts.factory.createIdentifier("meta")
                ),
                ts.factory.createIdentifier("client")
              ),
              ts.factory.createToken(ts.SyntaxKind.QuestionToken),
              visitedNode,
              ts.factory.createToken(ts.SyntaxKind.ColonToken),
              ts.factory.createNull()
            );
          }

          if (calleeText === "useQuery" || calleeText === "useSWR") {
            const keyArg = node.arguments[0];
            const fetcherArg = node.arguments[1];
            
            let keyText = "query-key";
            let isExprKey = false;

            if (keyArg) {
              if (ts.isArrayLiteralExpression(keyArg)) {
                const parts = keyArg.elements.map((el) => {
                  if (ts.isStringLiteral(el)) return el.text;
                  return `\${${el.getText(sourceFile)}}`;
                });
                keyText = `\`${parts.join("-")}\``;
                isExprKey = true;
              } else {
                keyText = keyArg.getText(sourceFile);
                if (keyText.startsWith("`")) isExprKey = true;
              }
            }

            let fetcherText = "() => Promise.resolve()";
            if (fetcherArg) {
              if (ts.isArrowFunction(fetcherArg) || ts.isFunctionExpression(fetcherArg)) {
                fetcherText = fetcherArg.getText(sourceFile);
              } else {
                fetcherText = `() => ${fetcherArg.getText(sourceFile)}()`;
              }
            }

            return ts.factory.createCallExpression(
              ts.factory.createIdentifier("useAsyncData"),
              undefined,
              [
                isExprKey
                  ? ts.factory.createIdentifier(keyText)
                  : ts.factory.createStringLiteral(keyText.split("'").join("").split('"').join("")),
                ts.factory.createIdentifier(fetcherText)
              ]
            );
          }
        }

        // 0. Convert callback prop calls: props.onSave(item) or onSave(item) -> emit("save", item)
        if (ts.isCallExpression(node)) {
          let callbackName = "";
          if (ts.isPropertyAccessExpression(node.expression)) {
            const obj = node.expression.expression.getText(sourceFile);
            if (obj === "props") {
              callbackName = node.expression.name.text;
            }
          } else if (ts.isIdentifier(node.expression)) {
            callbackName = node.expression.text;
          }

          const matchEmit = emits.find((e) => e.name === callbackName);
          if (matchEmit) {
            const args = node.arguments.map((arg) => ts.visitNode(arg, visit) as ts.Expression);
            return ts.factory.createCallExpression(
              ts.factory.createIdentifier("emit"),
              undefined,
              [ts.factory.createStringLiteral(matchEmit.eventName), ...args]
            );
          }
        }

        // A. Convert state setter call: setCount(count + 1) -> count.value = count.value + 1
        if (ts.isCallExpression(node)) {
          const calleeText = node.expression.getText(sourceFile);

          if (setterToState.has(calleeText)) {
            const stateName = setterToState.get(calleeText)!;
            const arg = node.arguments[0];
            if (arg) {
              // Arrow update: setCount(c => c + 1)
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

                  const replacedBody = replaceIdentifierText(bodyText, paramName, `${stateName}.value`);
                  return ts.factory.createIdentifier(`${stateName}.value = ${replacedBody}`);
                }
              }

              // Normal direct update: setCount(count + 1)
              const argText = arg.getText(sourceFile);
              return ts.factory.createIdentifier(`${stateName}.value = ${argText}`);
            }
          }

          // Class components this.setState(...) or setState(...)
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
                  const cleanVal = propVal.replace(/this\.state\./g, "");
                  assignments.push(`${propName}.value = ${cleanVal}`);
                }
              });
              return ts.factory.createIdentifier(assignments.join("; "));
            }
          }
        }

        // B. Class component reads: this.state.count -> count.value
        if (ts.isPropertyAccessExpression(node)) {
          const text = node.getText(sourceFile);
          if (text.startsWith("this.state.")) {
            const propName = node.name.text;
            return ts.factory.createPropertyAccessExpression(
              ts.factory.createIdentifier(propName),
              ts.factory.createIdentifier("value")
            );
          }
        }

        // C. Standard state reads: count -> count.value
        if (ts.isIdentifier(node) && stateNames.has(node.text)) {
          let isLhsOrDecl = false;
          const parent = node.parent;
          
          let inDeps = false;
          let curr = node;
          while (curr.parent) {
            const parentNode = curr.parent;
            if (ts.isCallExpression(parentNode)) {
              const name = parentNode.expression.getText(sourceFile);
              if (
                name === "useEffect" ||
                name === "useMemo" ||
                name === "useCallback" ||
                name.endsWith(".useEffect") ||
                name.endsWith(".useMemo") ||
                name.endsWith(".useCallback")
              ) {
                if (parentNode.arguments.length >= 2 && parentNode.arguments[1] === curr) {
                  inDeps = true;
                }
              }
            }
            curr = parentNode;
          }
          if (inDeps) {
            isLhsOrDecl = true;
          }

          if (parent) {
            // If it is the property name of a property access (e.g. obj.items)
            if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
              isLhsOrDecl = true;
            }
            // If it's a variable declaration name, e.g. const count = ...
            else if (ts.isVariableDeclaration(parent) && parent.name === node) {
              isLhsOrDecl = true;
            }
            // Binding pattern element
            else if (ts.isBindingElement(parent) && parent.name === node) {
              isLhsOrDecl = true;
            }
            // Property assignment name
            else if (ts.isPropertyAssignment(parent) && parent.name === node) {
              isLhsOrDecl = true;
            }
            // Shorthand property assignment
            else if (ts.isShorthandPropertyAssignment(parent)) {
              isLhsOrDecl = true;
            }
            // Import specifier
            else if (ts.isImportSpecifier(parent)) {
              isLhsOrDecl = true;
            }
            // Already has .value property access
            else if (
              ts.isPropertyAccessExpression(parent) &&
              parent.expression === node &&
              parent.name.text === "value"
            ) {
              isLhsOrDecl = true;
            }
            // If it's a parameter of a function/arrow function, e.g. (count) => ...
            else if (ts.isParameter(parent) && parent.name === node) {
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

        return ts.visitEachChild(node, visit, context);
      };
      return ts.visitNode(rootNode, visit);
    };
  };

  const result = ts.transform(sourceFile, [transformer]);
  const printer = ts.createPrinter();
  let output = printer.printFile(result.transformed[0] as ts.SourceFile).trim();

  if (hasLocalStorageInit) {
    output += `\n\nonMounted(() => {\n  ${localStorageVar}.value = JSON.parse(localStorage.getItem('${localStorageKey}') || '[]');\n});`;
  }

  return output;
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
