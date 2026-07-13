import * as ts from "typescript";

export interface ReactImport {
  moduleSpecifier: string;
  defaultImport?: string;
  namedImports?: string[];
  namespaceImport?: string;
}

export interface ReactState {
  name: string;
  setter: string;
  defaultValue: string;
  type?: string;
}

export interface ReactEffect {
  node: ts.CallExpression;
  dependencies: string[];
  body: string;
  type: "useEffect" | "useLayoutEffect" | "useInsertionEffect";
}

export interface ReactMethod {
  name: string;
  node: ts.VariableDeclaration | ts.FunctionDeclaration | ts.MethodDeclaration;
  body: string;
  params: Array<{ name: string; type: string }>;
  returnType: string;
  isAsync?: boolean;
}

export interface ReactContextUse {
  contextName: string;
  variableName: string;
}

export interface ReactProp {
  name: string;
  type: string;
  defaultValue?: string;
  required?: boolean;
}

export interface ReactEmit {
  name: string;
  eventName: string;
  type: string;
}

export interface ReactRef {
  name: string;
  defaultValue: string;
}

export interface ReactMemo {
  name: string;
  body: string;
  dependencies: string[];
}

export interface ReactCallback {
  name: string;
  body: string;
  dependencies: string[];
}

export interface ReactStoreUse {
  storeName: string;
  variableName: string;
  selector?: string;
}

export interface StyledComponent {
  name: string;
  tag: string;
  css: string;
}

export interface AnalysisResult {
  imports: ReactImport[];
  states: ReactState[];
  effects: ReactEffect[];
  methods: ReactMethod[];
  contexts: ReactContextUse[];
  props: ReactProp[];
  emits: ReactEmit[];
  refs: ReactRef[];
  memos: ReactMemo[];
  callbacks: ReactCallback[];
  stores: ReactStoreUse[];
  styledComponents: StyledComponent[];
  jsxNode?: ts.Expression;
  jsxTemplate?: string;
  componentName: string;
  isComponent: boolean;
  extraStatements: string[];
  externalStates: string[];
}

export function analyzeReactComponent(sourceFile: ts.SourceFile): AnalysisResult {
  const result: AnalysisResult = {
    imports: [],
    states: [],
    effects: [],
    methods: [],
    contexts: [],
    props: [],
    emits: [],
    refs: [],
    memos: [],
    callbacks: [],
    stores: [],
    styledComponents: [],
    componentName: "App",
    isComponent: false,
    extraStatements: [],
    externalStates: [],
  };

  // Walk top-level statements
  sourceFile.statements.forEach((statement) => {
    // 1. Imports
    if (ts.isImportDeclaration(statement)) {
      const moduleSpecifier = statement.moduleSpecifier.getText(sourceFile).replace(/['"]/g, "");
      const namedImports: string[] = [];
      let defaultImport: string | undefined;
      let namespaceImport: string | undefined;

      if (statement.importClause) {
        if (statement.importClause.name) {
          defaultImport = statement.importClause.name.text;
        }
        if (statement.importClause.namedBindings) {
          const nb = statement.importClause.namedBindings;
          if (ts.isNamedImports(nb)) {
            nb.elements.forEach((element) => {
              namedImports.push(element.name.text);
            });
          } else if (ts.isNamespaceImport(nb)) {
            namespaceImport = nb.name.text;
          }
        }
      }
      result.imports.push({ moduleSpecifier, defaultImport, namedImports, namespaceImport });
    }

    // 2. Styled Components
    if (ts.isVariableStatement(statement)) {
      statement.declarationList.declarations.forEach((decl) => {
        if (ts.isIdentifier(decl.name) && decl.initializer) {
          const name = decl.name.text;
          const initStr = decl.initializer.getText(sourceFile);
          if (ts.isTaggedTemplateExpression(decl.initializer)) {
            const tagExpr = decl.initializer.tag;
            let tag = "";
            let isStyled = false;
            
            if (ts.isPropertyAccessExpression(tagExpr)) {
              if (tagExpr.expression.getText(sourceFile) === "styled") {
                tag = tagExpr.name.text;
                isStyled = true;
              }
            } else if (ts.isCallExpression(tagExpr)) {
              if (tagExpr.expression.getText(sourceFile) === "styled") {
                tag = tagExpr.arguments[0]?.getText(sourceFile) || "div";
                isStyled = true;
              }
            }

            if (isStyled) {
              const css = decl.initializer.template.getText(sourceFile).replace(/`/g, "").trim();
              result.styledComponents.push({ name, tag, css });
            }
          }
        }
      });
    }

    // 3. Functional components & custom hooks (function declaration)
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      const name = statement.name.text;
      if (isReactComponentName(name) || name.startsWith("use")) {
        result.componentName = name;
        if (isReactComponentName(name)) {
          result.isComponent = true;
        }
        analyzeProps(statement, sourceFile, result);
        analyzeComponentBody(statement, sourceFile, result);
      }
    }

    // 4. Functional components & custom hooks (arrow functions or function expressions)
    if (ts.isVariableStatement(statement)) {
      statement.declarationList.declarations.forEach((decl) => {
        if (ts.isIdentifier(decl.name)) {
          const name = decl.name.text;
          if (
            (isReactComponentName(name) || name.startsWith("use")) &&
            decl.initializer &&
            (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
          ) {
            result.componentName = name;
            if (isReactComponentName(name)) {
              result.isComponent = true;
            }
            analyzeProps(decl.initializer, sourceFile, result);
            analyzeComponentBody(decl.initializer, sourceFile, result);
          }
        }
      });
    }

    // 5. Class Components
    if (ts.isClassDeclaration(statement) && statement.name) {
      const name = statement.name.text;
      if (isReactComponentName(name) && statement.heritageClauses) {
        const isReactClass = statement.heritageClauses.some((clause) => {
          return clause.types.some((t) => {
            const text = t.expression.getText(sourceFile);
            return text.includes("Component") || text.includes("PureComponent");
          });
        });

        if (isReactClass) {
          result.componentName = name;
          result.isComponent = true;
          analyzeClassComponent(statement, sourceFile, result);
        }
      }
    }

    // Capture non-React, non-styled helper statements, types, and interfaces
    let isMainComponent = false;
    let isStyledComponent = false;

    if (ts.isFunctionDeclaration(statement) && statement.name && (isReactComponentName(statement.name.text) || statement.name.text.startsWith("use"))) {
      isMainComponent = true;
    } else if (ts.isClassDeclaration(statement) && statement.name && isReactComponentName(statement.name.text)) {
      isMainComponent = true;
    } else if (ts.isVariableStatement(statement)) {
      statement.declarationList.declarations.forEach((decl) => {
        if (ts.isIdentifier(decl.name)) {
          const name = decl.name.text;
          if ((isReactComponentName(name) || name.startsWith("use")) && decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
            isMainComponent = true;
          }
          if (decl.initializer && ts.isTaggedTemplateExpression(decl.initializer)) {
            const tagExpr = decl.initializer.tag;
            if (ts.isPropertyAccessExpression(tagExpr) && tagExpr.expression.getText(sourceFile) === "styled") {
              isStyledComponent = true;
            } else if (ts.isCallExpression(tagExpr) && tagExpr.expression.getText(sourceFile) === "styled") {
              isStyledComponent = true;
            }
          }
        }
      });
    }

    const isImport = ts.isImportDeclaration(statement);
    const isExportAssignment = ts.isExportAssignment(statement);

    if (!isImport && !isExportAssignment && !isMainComponent && !isStyledComponent) {
      result.extraStatements.push(statement.getText(sourceFile));
    }
  });

  // AST crawler fallback to ensure useState is always captured in custom hooks
  if (result.states.length === 0) {
    const scanNode = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const calleeText = node.expression.getText(sourceFile);
        if (calleeText === "useState" || calleeText.endsWith(".useState")) {
          const parent = node.parent;
          if (parent && ts.isVariableDeclaration(parent) && ts.isArrayBindingPattern(parent.name)) {
            const elements = parent.name.elements;
            if (elements.length >= 1) {
              const stateVar = elements[0];
              const setterVar = elements[1];
              if (ts.isBindingElement(stateVar) && ts.isIdentifier(stateVar.name)) {
                const name = stateVar.name.text;
                const setter =
                  setterVar && ts.isBindingElement(setterVar) && ts.isIdentifier(setterVar.name)
                    ? setterVar.name.text
                    : `set${name.charAt(0).toUpperCase()}${name.slice(1)}`;
                const defaultValue =
                  node.arguments.length > 0 ? node.arguments[0].getText(sourceFile) : "undefined";
                let type = "any";
                if (node.typeArguments && node.typeArguments.length > 0) {
                  type = node.typeArguments[0].getText(sourceFile);
                }

                if (!result.states.some((s) => s.name === name)) {
                  result.states.push({ name, setter, defaultValue, type });
                }
              }
            }
          }
        }
      }
      ts.forEachChild(node, scanNode);
    };
    scanNode(sourceFile);
  }

  return result;
}

function isReactComponentName(name: string): boolean {
  if (!name) return false;
  const firstChar = name[0];
  return firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase();
}

function analyzeProps(
  node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  sourceFile: ts.SourceFile,
  result: AnalysisResult
) {
  if (node.parameters.length === 0) return;
  const firstParam = node.parameters[0];

  // 1. Destructured props
  if (ts.isObjectBindingPattern(firstParam.name)) {
    firstParam.name.elements.forEach((element) => {
      if (ts.isIdentifier(element.name)) {
        const propName = element.name.text;
        const defaultValue = element.initializer ? element.initializer.getText(sourceFile) : undefined;
        let type = "any";

        if (firstParam.type) {
          if (ts.isTypeLiteralNode(firstParam.type)) {
            const member = firstParam.type.members.find(
              (m) => m.name && m.name.getText(sourceFile) === propName
            );
            if (member && ts.isPropertySignature(member) && member.type) {
              type = member.type.getText(sourceFile);
            }
          } else if (ts.isTypeReferenceNode(firstParam.type)) {
            const typeName = firstParam.type.typeName.getText(sourceFile);
            type = findPropTypeFromSource(typeName, propName, sourceFile);
          }
        }
        const isFunctionType = type.includes("=>") || type === "Function" || (type.includes("(") && type.includes(")"));
        const isActionName = (propName.startsWith("on") && propName[2] === propName[2]?.toUpperCase()) ||
                             ["add", "remove", "save", "delete", "edit", "update", "cancel", "submit", "change", "select"].some((verb) => propName.toLowerCase().includes(verb)) ||
                             propName.endsWith("Handler") || propName.endsWith("Callback");
        
        const isCallback = isFunctionType && isActionName;
        if (isCallback) {
          let eventName = propName;
          if (propName.startsWith("on") && propName[2] === propName[2]?.toUpperCase()) {
            eventName = propName.slice(2);
          }
          // CamelCase to kebab-case
          let cleanEventName = "";
          for (let i = 0; i < eventName.length; i++) {
            const char = eventName[i];
            if (char === char.toUpperCase() && char !== char.toLowerCase()) {
              cleanEventName += (i === 0 ? "" : "-") + char.toLowerCase();
            } else {
              cleanEventName += char;
            }
          }

          result.emits.push({
            name: propName,
            eventName: cleanEventName,
            type
          });
        } else {
          result.props.push({
            name: propName,
            type,
            defaultValue,
            required: !element.initializer,
          });
        }
      }
    });
  }

  // 2. Simple identifier
  if (ts.isIdentifier(firstParam.name)) {
    const propsVarName = firstParam.name.text;
    const body = node.body;
    if (body && ts.isBlock(body)) {
      body.statements.forEach((statement) => {
        if (ts.isVariableStatement(statement)) {
          statement.declarationList.declarations.forEach((decl) => {
            if (
              ts.isObjectBindingPattern(decl.name) &&
              decl.initializer &&
              ts.isIdentifier(decl.initializer) &&
              decl.initializer.text === propsVarName
            ) {
              decl.name.elements.forEach((el) => {
                if (ts.isBindingElement(el) && ts.isIdentifier(el.name)) {
                  const propName = el.name.text;
                  
                  let type = "any";
                  if (firstParam.type) {
                    if (ts.isTypeLiteralNode(firstParam.type)) {
                      const member = firstParam.type.members.find(
                        (m) => m.name && m.name.getText(sourceFile) === propName
                      );
                      if (member && ts.isPropertySignature(member) && member.type) {
                        type = member.type.getText(sourceFile);
                      }
                    } else if (ts.isTypeReferenceNode(firstParam.type)) {
                      const typeName = firstParam.type.typeName.getText(sourceFile);
                      type = findPropTypeFromSource(typeName, propName, sourceFile);
                    }
                  }

                  const isFunctionType = type.includes("=>") || type === "Function" || (type.includes("(") && type.includes(")"));
                  const isActionName = (propName.startsWith("on") && propName[2] === propName[2]?.toUpperCase()) ||
                                       ["add", "remove", "save", "delete", "edit", "update", "cancel", "submit", "change", "select"].some((verb) => propName.toLowerCase().includes(verb)) ||
                                       propName.endsWith("Handler") || propName.endsWith("Callback");
                  
                  const isCallback = isFunctionType && isActionName;
                  if (isCallback) {
                    let eventName = propName;
                    if (propName.startsWith("on") && propName[2] === propName[2]?.toUpperCase()) {
                      eventName = propName.slice(2);
                    }
                    // CamelCase to kebab-case
                    let cleanEventName = "";
                    for (let i = 0; i < eventName.length; i++) {
                      const char = eventName[i];
                      if (char === char.toUpperCase() && char !== char.toLowerCase()) {
                        cleanEventName += (i === 0 ? "" : "-") + char.toLowerCase();
                      } else {
                        cleanEventName += char;
                      }
                    }

                    result.emits.push({
                      name: propName,
                      eventName: cleanEventName,
                      type
                    });
                  } else {
                    result.props.push({
                      name: propName,
                      type,
                      defaultValue: el.initializer ? el.initializer.getText(sourceFile) : undefined,
                      required: !el.initializer,
                    });
                  }
                }
              });
            }
          });
        }
      });
    }
  }
}

function analyzeComponentBody(
  node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  sourceFile: ts.SourceFile,
  result: AnalysisResult
) {
  const body = node.body;
  if (!body) return;

  if (ts.isBlock(body)) {
    body.statements.forEach((statement) => {
      if (ts.isVariableStatement(statement)) {
        let isMatched = false;
        statement.declarationList.declarations.forEach((decl) => {
          if (decl.initializer) {
            const init = decl.initializer;

            if (ts.isCallExpression(init)) {
              const hookName = init.expression.getText(sourceFile);

              // useState
              if (hookName === "useState" || hookName.endsWith(".useState")) {
                isMatched = true;
                if (ts.isArrayBindingPattern(decl.name) && decl.name.elements.length >= 1) {
                  const stateVar = decl.name.elements[0];
                  const setterVar = decl.name.elements[1];
                  if (ts.isBindingElement(stateVar) && ts.isIdentifier(stateVar.name)) {
                    const name = stateVar.name.text;
                    const setter =
                      setterVar && ts.isBindingElement(setterVar) && ts.isIdentifier(setterVar.name)
                        ? setterVar.name.text
                        : `set${name.charAt(0).toUpperCase()}${name.slice(1)}`;
                    const defaultValue =
                      init.arguments.length > 0 ? init.arguments[0].getText(sourceFile) : "undefined";
                    let type = "any";
                    if (init.typeArguments && init.typeArguments.length > 0) {
                      type = init.typeArguments[0].getText(sourceFile);
                    }
                    result.states.push({ name, setter, defaultValue, type });
                  }
                }
                return;
              }

              // useReducer
              if (hookName === "useReducer" || hookName.endsWith(".useReducer")) {
                isMatched = true;
                if (ts.isArrayBindingPattern(decl.name) && decl.name.elements.length >= 1) {
                  const stateVar = decl.name.elements[0];
                  const dispatchVar = decl.name.elements[1];
                  if (ts.isBindingElement(stateVar) && ts.isIdentifier(stateVar.name)) {
                    const name = stateVar.name.text;
                    const setter =
                      dispatchVar && ts.isBindingElement(dispatchVar) && ts.isIdentifier(dispatchVar.name)
                        ? dispatchVar.name.text
                        : "dispatch";
                    const defaultValue =
                      init.arguments.length > 1 ? init.arguments[1].getText(sourceFile) : "undefined";
                    result.states.push({ name, setter, defaultValue, type: "any" });
                  }
                }
                return;
              }

              // useRef
              if (hookName === "useRef" || hookName.endsWith(".useRef")) {
                isMatched = true;
                if (ts.isIdentifier(decl.name)) {
                  const name = decl.name.text;
                  const defaultValue =
                    init.arguments.length > 0 ? init.arguments[0].getText(sourceFile) : "null";
                  result.refs.push({ name, defaultValue });
                }
                return;
              }

              // useContext
              if (hookName === "useContext" || hookName.endsWith(".useContext")) {
                isMatched = true;
                if (ts.isIdentifier(decl.name) && init.arguments.length > 0) {
                  result.contexts.push({
                    variableName: decl.name.text,
                    contextName: init.arguments[0].getText(sourceFile),
                  });
                }
                return;
              }

              // useMemo
              if (hookName === "useMemo" || hookName.endsWith(".useMemo")) {
                isMatched = true;
                if (ts.isIdentifier(decl.name) && init.arguments.length > 0) {
                  const callback = init.arguments[0];
                  let dependencies: string[] = [];
                  if (init.arguments.length > 1) {
                    const depsArg = init.arguments[1];
                    if (ts.isArrayLiteralExpression(depsArg)) {
                      dependencies = depsArg.elements.map((el) => el.getText(sourceFile));
                    }
                  }
                  result.memos.push({
                    name: decl.name.text,
                    body: callback.getText(sourceFile),
                    dependencies,
                  });
                }
                return;
              }

              // useCallback
              if (hookName === "useCallback" || hookName.endsWith(".useCallback")) {
                isMatched = true;
                if (ts.isIdentifier(decl.name) && init.arguments.length > 0) {
                  const callback = init.arguments[0];
                  let dependencies: string[] = [];
                  if (init.arguments.length > 1) {
                    const depsArg = init.arguments[1];
                    if (ts.isArrayLiteralExpression(depsArg)) {
                      dependencies = depsArg.elements.map((el) => el.getText(sourceFile));
                    }
                  }
                  result.callbacks.push({
                    name: decl.name.text,
                    body: callback.getText(sourceFile),
                    dependencies,
                  });
                }
                return;
              }

              // useSelector / useStore
              if (hookName === "useSelector" || hookName === "useStore") {
                isMatched = true;
                if (ts.isIdentifier(decl.name)) {
                  const selector = init.arguments[0]?.getText(sourceFile);
                  result.stores.push({
                    storeName: hookName === "useSelector" ? "ReduxStore" : "ZustandStore",
                    variableName: decl.name.text,
                    selector,
                  });
                }
                return;
              }
            }

            // Custom methods defined as helper arrow functions
            if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
              isMatched = true;
              if (ts.isIdentifier(decl.name)) {
                result.methods.push({
                  name: decl.name.text,
                  node: decl,
                  body: `const ${decl.name.text} = ${init.getText(sourceFile)};`,
                  params: init.parameters.map((p) => ({
                    name: p.name.getText(sourceFile),
                    type: p.type ? p.type.getText(sourceFile) : "any",
                  })),
                  returnType: init.type ? init.type.getText(sourceFile) : "any",
                });
              }
            }
          }
        });

        if (!isMatched) {
          result.methods.push({
            name: "",
            node: statement.declarationList.declarations[0],
            body: statement.getText(sourceFile),
            params: [],
            returnType: "any"
          });

          statement.declarationList.declarations.forEach((decl) => {
            if (decl.initializer && ts.isCallExpression(decl.initializer)) {
              const calleeText = decl.initializer.expression.getText(sourceFile);
              if (calleeText.startsWith("use")) {
                if (ts.isObjectBindingPattern(decl.name)) {
                  decl.name.elements.forEach((el) => {
                    if (ts.isIdentifier(el.name)) {
                      result.externalStates!.push(el.name.text);
                    }
                  });
                } else if (ts.isIdentifier(decl.name)) {
                  result.externalStates!.push(decl.name.text);
                }
              }
            }
          });
        }
      }

      // 2. Normal Function declarations inside component body
      if (ts.isFunctionDeclaration(statement) && statement.name) {
        result.methods.push({
          name: statement.name.text,
          node: statement,
          body: statement.getText(sourceFile),
          params: statement.parameters.map((p) => ({
            name: p.name.getText(sourceFile),
            type: p.type ? p.type.getText(sourceFile) : "any",
          })),
          returnType: statement.type ? statement.type.getText(sourceFile) : "any",
        });
      }

      // 3. Expression statements: useEffect, useLayoutEffect, useInsertionEffect
      if (ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression)) {
        const call = statement.expression;
        const hookName = call.expression.getText(sourceFile);
        if (
          hookName === "useEffect" ||
          hookName === "useLayoutEffect" ||
          hookName === "useInsertionEffect"
        ) {
          let dependencies: string[] = [];
          if (call.arguments.length >= 2) {
            const depsArg = call.arguments[1];
            if (ts.isArrayLiteralExpression(depsArg)) {
              dependencies = depsArg.elements.map((el) => el.getText(sourceFile));
            }
          }
          const callback = call.arguments[0];
          result.effects.push({
            node: call,
            dependencies,
            body: callback.getText(sourceFile),
            type: hookName as "useEffect" | "useLayoutEffect" | "useInsertionEffect",
          });
        }
      }

      // 4. Return statements (JSX markup)
      if (ts.isReturnStatement(statement) && statement.expression) {
        const expr = statement.expression;
        let jsxExpr: ts.Expression | undefined;

        if (ts.isParenthesizedExpression(expr) && expr.expression) {
          jsxExpr = expr.expression;
        } else {
          jsxExpr = expr;
        }

        if (jsxExpr) {
          const text = jsxExpr.getText(sourceFile);
          if (
            ts.isJsxElement(jsxExpr) ||
            ts.isJsxFragment(jsxExpr) ||
            ts.isJsxSelfClosingElement(jsxExpr)
          ) {
            result.jsxNode = jsxExpr;
            result.jsxTemplate = text;
          }
        }
      }
    });
  } else {
    // Arrow function direct return: const App = () => <div>Hello</div>
    let jsxExpr: ts.Expression | undefined;
    if (ts.isParenthesizedExpression(body) && body.expression) {
      jsxExpr = body.expression;
    } else {
      jsxExpr = body;
    }

    if (jsxExpr && (ts.isJsxElement(jsxExpr) || ts.isJsxFragment(jsxExpr) || ts.isJsxSelfClosingElement(jsxExpr))) {
      result.jsxNode = jsxExpr;
      result.jsxTemplate = jsxExpr.getText(sourceFile);
    }
  }
}

function analyzeClassComponent(
  node: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
  result: AnalysisResult
) {
  node.members.forEach((member) => {
    // Property declaration
    if (ts.isPropertyDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
      const name = member.name.text;
      if (name === "state" && member.initializer) {
        if (ts.isObjectLiteralExpression(member.initializer)) {
          member.initializer.properties.forEach((prop) => {
            if (prop.name && ts.isIdentifier(prop.name)) {
              result.states.push({
                name: prop.name.text,
                setter: "setState",
                defaultValue: prop.getText(sourceFile).split(":")[1]?.trim() || "null",
              });
            }
          });
        }
      }
    }

    // Constructor
    if (ts.isConstructorDeclaration(member) && member.body) {
      member.body.statements.forEach((statement) => {
        if (
          ts.isExpressionStatement(statement) &&
          ts.isBinaryExpression(statement.expression) &&
          statement.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
        ) {
          const lhs = statement.expression.left;
          const rhs = statement.expression.right;
          if (lhs.getText(sourceFile) === "this.state" && ts.isObjectLiteralExpression(rhs)) {
            rhs.properties.forEach((prop) => {
              if (prop.name && ts.isIdentifier(prop.name)) {
                const initVal = prop.getText(sourceFile).split(":")[1]?.trim() || "null";
                result.states.push({
                  name: prop.name.text,
                  setter: "setState",
                  defaultValue: initVal,
                });
              }
            });
          }
        }
      });
    }

    // Methods
    if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
      const methodName = member.name.text;
      if (methodName === "render" && member.body) {
        member.body.statements.forEach((statement) => {
          if (ts.isReturnStatement(statement) && statement.expression) {
            let jsxExpr: ts.Expression | undefined;
            if (ts.isParenthesizedExpression(statement.expression)) {
              jsxExpr = statement.expression.expression;
            } else {
              jsxExpr = statement.expression;
            }
            if (
              jsxExpr &&
              (ts.isJsxElement(jsxExpr) ||
                ts.isJsxFragment(jsxExpr) ||
                ts.isJsxSelfClosingElement(jsxExpr))
            ) {
              result.jsxNode = jsxExpr;
              result.jsxTemplate = jsxExpr.getText(sourceFile);
            }
          }
        });
      } else {
        result.methods.push({
          name: methodName,
          node: member,
          body: member.getText(sourceFile),
          params: member.parameters.map((p) => ({
            name: p.name.getText(sourceFile),
            type: p.type ? p.type.getText(sourceFile) : "any",
          })),
          returnType: member.type ? member.type.getText(sourceFile) : "any",
        });
      }
    }
  });
}

function findPropTypeFromSource(
  typeName: string,
  propName: string,
  sourceFile: ts.SourceFile
): string {
  let foundType = "any";

  sourceFile.statements.forEach((statement) => {
    if (ts.isInterfaceDeclaration(statement) && statement.name.text === typeName) {
      const member = statement.members.find(
        (m) => m.name && m.name.getText(sourceFile) === propName
      );
      if (member && ts.isPropertySignature(member) && member.type) {
        foundType = member.type.getText(sourceFile);
      }
    }
    if (ts.isTypeAliasDeclaration(statement) && statement.name.text === typeName) {
      if (ts.isTypeLiteralNode(statement.type)) {
        const member = statement.type.members.find(
          (m) => m.name && m.name.getText(sourceFile) === propName
        );
        if (member && ts.isPropertySignature(member) && member.type) {
          foundType = member.type.getText(sourceFile);
        }
      }
    }
  });

  return foundType;
}
