import * as ts from "typescript";
import { getSvelteEventDirective } from "./event-transformer";
import { transformInlineStyle } from "./style-transformer";
import { StyledComponent } from "./semantic-analyzer";

export function transformJSXToSvelteTemplate(
  jsxNode: ts.Expression | undefined,
  sourceFile: ts.SourceFile,
  styledComponents: StyledComponent[] = []
): string {
  if (!jsxNode) return "";

  const scMap = new Map<string, string>();
  styledComponents.forEach((s) => scMap.set(s.name, s.tag));

  function compileNode(node: ts.Node): string {
    // 1. JSX Text Node
    if (ts.isJsxText(node)) {
      return node.getText(sourceFile);
    }

    // 2. JSX Element
    if (ts.isJsxElement(node)) {
      const opening = node.openingElement;
      let tagName = opening.tagName.getText(sourceFile);
      let isStyled = false;

      // Handle React Suspense mapping to Svelte {#await} block
      if (tagName === "Suspense") {
        const fallbackAttr = opening.attributes.properties.find(
          (p) => ts.isJsxAttribute(p) && p.name.text === "fallback"
        );
        let fallbackHtml = "";
        if (fallbackAttr && ts.isJsxAttribute(fallbackAttr) && fallbackAttr.initializer) {
          if (ts.isJsxExpression(fallbackAttr.initializer) && fallbackAttr.initializer.expression) {
            fallbackHtml = compileNode(fallbackAttr.initializer.expression);
          } else {
            fallbackHtml = fallbackAttr.initializer.getText(sourceFile);
          }
        }
        const childrenHtml = node.children.map(compileNode).join("");
        return `{#await Promise.resolve()}${fallbackHtml}{:then}${childrenHtml}{/await}`;
      }

      // Handle ErrorBoundary mapping to direct children render
      if (tagName === "ErrorBoundary") {
        return node.children.map(compileNode).join("");
      }

      if (scMap.has(tagName)) {
        tagName = scMap.get(tagName)!;
        isStyled = true;
      }

      // Handle Context.Provider
      if (tagName.endsWith(".Provider")) {
        return node.children.map(compileNode).join("");
      }

      // Compile attributes
      const attrsStr = compileAttributes(
        opening.attributes,
        tagName,
        isStyled ? opening.tagName.getText(sourceFile) : undefined
      );

      // Compile children
      const childrenStr = node.children.map(compileNode).join("");

      return `<${tagName}${attrsStr}>${childrenStr}</${tagName}>`;
    }

    // 3. JSX Self Closing Element
    if (ts.isJsxSelfClosingElement(node)) {
      let tagName = node.tagName.getText(sourceFile);
      let isStyled = false;

      if (scMap.has(tagName)) {
        tagName = scMap.get(tagName)!;
        isStyled = true;
      }

      const attrsStr = compileAttributes(
        node.attributes,
        tagName,
        isStyled ? node.tagName.getText(sourceFile) : undefined
      );
      return `<${tagName}${attrsStr} />`;
    }

    // 4. JSX Fragment
    if (ts.isJsxFragment(node)) {
      return node.children.map(compileNode).join("");
    }

    // 5. JSX Expression
    if (ts.isJsxExpression(node)) {
      if (!node.expression) return "";
      const expr = node.expression;

      // Handle React Portals: createPortal(children, container) -> <div use:portal={container}>children</div>
      if (ts.isCallExpression(expr)) {
        const calleeText = expr.expression.getText(sourceFile);
        if (calleeText === "createPortal" || calleeText.endsWith(".createPortal")) {
          const childrenArg = expr.arguments[0];
          const containerArg = expr.arguments[1];
          if (childrenArg && containerArg) {
            const childrenHtml = compileNode(childrenArg);
            const containerHtml = containerArg.getText(sourceFile);
            return `<div use:portal={${containerHtml}}>${childrenHtml}</div>`;
          }
        }
      }

      // Handle Logical &&: {condition && <JSX />}
      if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
        const cond = expr.left.getText(sourceFile);
        const rightHtml = compileNode(expr.right);
        return `{#if ${cond}}${rightHtml}{/if}`;
      }

      // Handle Ternary: {condition ? <JSX1 /> : <JSX2 />}
      if (ts.isConditionalExpression(expr)) {
        const cond = expr.condition.getText(sourceFile);
        const whenTrueHtml = compileNode(expr.whenTrue);
        const whenFalseHtml = compileNode(expr.whenFalse);
        return `{#if ${cond}}${whenTrueHtml}{:else}${whenFalseHtml}{/if}`;
      }

      // Handle Map/Loop: {items.map(item => <JSX />)}
      if (ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression)) {
        const propAccess = expr.expression;
        if (propAccess.name.text === "map" && expr.arguments.length > 0) {
          const listExpr = propAccess.expression.getText(sourceFile);
          const callback = expr.arguments[0];

          if (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) {
            const params = callback.parameters;
            const itemVar = params[0] ? params[0].name.getText(sourceFile) : "item";
            const indexVar = params[1] ? params[1].name.getText(sourceFile) : undefined;
            const loopVar = indexVar ? `${itemVar}, ${indexVar}` : itemVar;

            let bodyNode: ts.Node = callback.body;
            if (ts.isParenthesizedExpression(bodyNode)) {
              bodyNode = bodyNode.expression;
            }

            let loopBody = "";
            let keyStr = "";

            if (ts.isBlock(bodyNode)) {
              const returnStmt = bodyNode.statements.find(ts.isReturnStatement);
              if (returnStmt && returnStmt.expression) {
                loopBody = compileNode(returnStmt.expression);
                keyStr = extractKeyFromNode(returnStmt.expression);
              }
            } else {
              loopBody = compileNode(bodyNode);
              keyStr = extractKeyFromNode(bodyNode);
            }

            // Remove key attribute from inside the child if keyStr is found
            if (keyStr) {
              loopBody = loopBody.replace(/key=\{\s*[^}]+\s*\}/g, "").replace(/key="[^"]+"/g, "");
            }

            const keySuffix = keyStr ? ` (${keyStr})` : "";
            return `{#each ${listExpr} as ${loopVar}${keySuffix}}${loopBody}{/each}`;
          }
        }
      }

      // Default Svelte Expression binding: {count}
      const exprText = expr.getText(sourceFile);
      if (exprText === "props.children" || exprText === "children") {
        return "<slot />";
      }

      return `{${exprText}}`;
    }

    // Fallback
    return node.getText(sourceFile);
  }

  function compileAttributes(
    attributes: ts.JsxAttributes,
    tagName: string,
    styledClassName?: string
  ): string {
    const list: string[] = [];
    let hasValue = false;
    let valueExpr = "";
    let hasOnChange = false;
    let hasClass = false;

    // Check for controlled input pattern value={} onChange={}
    attributes.properties.forEach((prop) => {
      if (ts.isJsxAttribute(prop) && prop.name) {
        const name = prop.name.text;
        if (name === "value" && prop.initializer && ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
          hasValue = true;
          valueExpr = prop.initializer.expression.getText(sourceFile);
        }
        if (name === "onChange") {
          hasOnChange = true;
        }
      }
    });

    const isControlledInput = (tagName === "input" || tagName === "textarea" || tagName === "select") && hasValue && hasOnChange;

    if (isControlledInput) {
      list.push(`bind:value={${valueExpr}}`);
    }

    attributes.properties.forEach((prop) => {
      if (ts.isJsxAttribute(prop)) {
        const name = prop.name.text;

        // Skip value and onChange for controlled inputs since we bound them
        if (isControlledInput && (name === "value" || name === "onChange")) {
          return;
        }

        // 1. className -> class
        if (name === "className") {
          hasClass = true;
          if (prop.initializer) {
            let classVal = "";
            if (ts.isStringLiteral(prop.initializer)) {
              classVal = prop.initializer.text;
              if (styledClassName) {
                classVal = `${styledClassName} ${classVal}`;
              }
              list.push(`class="${classVal}"`);
            } else if (ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
              const exprText = prop.initializer.expression.getText(sourceFile);
              if (styledClassName) {
                list.push(`class={\`${styledClassName} \${${exprText}}\`}`);
              } else {
                list.push(`class={${exprText}}`);
              }
            }
          }
          return;
        }

        // 2. Inline Styles
        if (name === "style" && prop.initializer && ts.isJsxExpression(prop.initializer)) {
          const styleText = prop.initializer.getText(sourceFile);
          list.push(transformInlineStyle(styleText));
          return;
        }

        // 3. Events: onClick, etc.
        if (name.startsWith("on") && name[2] === name[2]?.toUpperCase()) {
          const directive = getSvelteEventDirective(name);
          if (prop.initializer) {
            if (ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
              list.push(`${directive}={${prop.initializer.expression.getText(sourceFile)}}`);
            }
          } else {
            list.push(directive);
          }
          return;
        }

        // 4. Ref binding: ref={inputRef} -> bind:this={inputRef}
        if (name === "ref" && prop.initializer && ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
          list.push(`bind:this={${prop.initializer.expression.getText(sourceFile)}}`);
          return;
        }

        // 5. Default attributes
        if (prop.initializer) {
          if (ts.isStringLiteral(prop.initializer)) {
            list.push(`${name}="${prop.initializer.text}"`);
          } else if (ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
            const innerExpr = prop.initializer.expression.getText(sourceFile);
            if (innerExpr === "true") {
              list.push(name);
            } else if (innerExpr === "false") {
              list.push(`${name}={false}`);
            } else {
              list.push(`${name}={${innerExpr}}`);
            }
          }
        } else {
          list.push(name);
        }
      } else if (ts.isJsxSpreadAttribute(prop)) {
        list.push(`{...${prop.expression.getText(sourceFile)}}`);
      }
    });

    // If styled component and no className was explicitly provided
    if (styledClassName && !hasClass) {
      list.push(`class="${styledClassName}"`);
    }

    return list.length > 0 ? " " + list.join(" ") : "";
  }

  function extractKeyFromNode(node: ts.Node): string {
    let keyStr = "";
    const extract = (n: ts.Node) => {
      if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
        const attrs = ts.isJsxElement(n) ? n.openingElement.attributes : n.attributes;
        attrs.properties.forEach((prop) => {
          if (ts.isJsxAttribute(prop) && prop.name.text === "key" && prop.initializer) {
            if (ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
              keyStr = prop.initializer.expression.getText(sourceFile);
            } else if (ts.isStringLiteral(prop.initializer)) {
              keyStr = `"${prop.initializer.text}"`;
            }
          }
        });
      }
    };

    extract(node);
    return keyStr;
  }

  return compileNode(jsxNode).trim();
}
