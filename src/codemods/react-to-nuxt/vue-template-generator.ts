// Vue template compiler and AST generator
import * as ts from "typescript";
import { StyledComponent } from "./semantic-analyzer";

export interface TemplateContext {
  registerMethod: (name: string, body: string) => void;
  emits: Array<{ name: string; eventName: string }>;
  sourceFile: ts.SourceFile;
  styledComponents: StyledComponent[];
}

export function transformJSXToVueTemplate(
  jsxNode: ts.Expression | undefined,
  context: TemplateContext
): string {
  if (!jsxNode) return "";

  const scMap = new Map<string, string>();
  context.styledComponents.forEach((s) => scMap.set(s.name, s.tag));
  const sourceFile = context.sourceFile;

  function compileNode(node: ts.Node): string {
    // 1. JSX Text
    if (ts.isJsxText(node)) {
      return node.getText(sourceFile);
    }

    // 2. JSX Element
    if (ts.isJsxElement(node)) {
      const opening = node.openingElement;
      let tagName = opening.tagName.getText(sourceFile);
      let isStyled = false;

      // Form submission extraction: onSubmit={e => { e.preventDefault(); handleAdd(); }}
      let onSubmitFormName = "";
      if (tagName === "form") {
        const submitAttr = opening.attributes.properties.find(
          (p) => ts.isJsxAttribute(p) && p.name.getText(sourceFile) === "onSubmit"
        );
        if (submitAttr && ts.isJsxAttribute(submitAttr) && submitAttr.initializer && ts.isJsxExpression(submitAttr.initializer) && submitAttr.initializer.expression) {
          const expr = submitAttr.initializer.expression;
          if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
            const body = expr.body;
            let bodyText = "";
            if (ts.isBlock(body)) {
              bodyText = body.statements
                .map((s) => s.getText(sourceFile))
                .filter((line) => !line.includes("preventDefault"))
                .join("\n");
            } else {
              const text = body.getText(sourceFile);
              if (!text.includes("preventDefault")) {
                bodyText = text;
              }
            }

            onSubmitFormName = "submitForm";
            context.registerMethod(
              onSubmitFormName,
              `const ${onSubmitFormName} = () => {\n  ${bodyText.trim()}\n};`
            );
          }
        }
      }

      // React Suspense -> Vue Suspense
      if (tagName === "Suspense") {
        const fallbackAttr = opening.attributes.properties.find(
          (p) => ts.isJsxAttribute(p) && p.name.getText(sourceFile) === "fallback"
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
        return `<Suspense>
  <template #default>${childrenHtml}</template>
  <template #fallback>${fallbackHtml}</template>
</Suspense>`;
      }

      if (tagName === "ErrorBoundary") {
        return node.children.map(compileNode).join("");
      }

      if (scMap.has(tagName)) {
        tagName = scMap.get(tagName)!;
        isStyled = true;
      }

      if (tagName.endsWith(".Provider")) {
        return node.children.map(compileNode).join("");
      }

      const attrsStr = compileAttributes(
        opening.attributes,
        tagName,
        isStyled ? opening.tagName.getText(sourceFile) : undefined,
        onSubmitFormName
      );

      const childrenStr = node.children.map(compileNode).join("");

      return `<${tagName}${attrsStr}>${childrenStr}</${tagName}>`;
    }

    // 3. JSX Self-Closing Element
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

      // Handle logical &&: {cond && <JSX />}
      if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
        const cond = expr.left.getText(sourceFile);
        const rightHtml = compileNode(expr.right);
        return `<template v-if="${cond}">${rightHtml}</template>`;
      }

      // Handle Ternary: {cond ? <JSX1 /> : <JSX2 />}
      if (ts.isConditionalExpression(expr)) {
        const cond = expr.condition.getText(sourceFile);
        const whenTrueHtml = compileNode(expr.whenTrue);
        const whenFalseHtml = compileNode(expr.whenFalse);
        return `<template v-if="${cond}">${whenTrueHtml}</template><template v-else>${whenFalseHtml}</template>`;
      }

      // Handle Loops: {items.map(item => <JSX />)}
      if (ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression)) {
        const propAccess = expr.expression;
        if (propAccess.name.text === "map" && expr.arguments.length > 0) {
          const listExpr = propAccess.expression.getText(sourceFile);
          const callback = expr.arguments[0];

          if (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) {
            const params = callback.parameters;
            const itemVar = params[0] ? params[0].name.getText(sourceFile) : "item";
            const indexVar = params[1] ? params[1].name.getText(sourceFile) : undefined;
            const loopSignature = indexVar ? `(${itemVar}, ${indexVar})` : itemVar;
            const keyBind = indexVar ? indexVar : "i";

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

            if (keyStr) {
              loopBody = stripKeyAttribute(loopBody);
            }

            const activeKey = keyStr || keyBind;
            return `<template v-for="${loopSignature} in ${listExpr}" :key="${activeKey}">${loopBody}</template>`;
          }
        }
      }

      // Slots
      const exprText = expr.getText(sourceFile);
      if (exprText === "props.children" || exprText === "children") {
        return "<slot />";
      }

      return `{{ ${exprText} }}`;
    }

    return node.getText(sourceFile);
  }

  function compileAttributes(
    attributes: ts.JsxAttributes,
    tagName: string,
    styledClassName?: string,
    extractedOnSubmitName?: string
  ): string {
    const list: string[] = [];
    let hasValue = false;
    let valueExpr = "";
    let hasOnChange = false;
    let hasClass = false;

    // Check for controlled inputs
    attributes.properties.forEach((prop) => {
      if (ts.isJsxAttribute(prop) && prop.name) {
        const name = prop.name.getText(sourceFile);
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
      list.push(`v-model="${valueExpr}"`);
    }

    attributes.properties.forEach((prop) => {
      if (ts.isJsxAttribute(prop)) {
        const name = prop.name.getText(sourceFile);

        // Skip value and onChange for controlled inputs
        if (isControlledInput && (name === "value" || name === "onChange")) {
          return;
        }

        // Form submit override
        if (name === "onSubmit" && extractedOnSubmitName) {
          list.push(`@submit.prevent="${extractedOnSubmitName}"`);
          return;
        }

        // className -> class
        if (name === "className") {
          hasClass = true;
          if (prop.initializer) {
            if (ts.isStringLiteral(prop.initializer)) {
              let classVal = prop.initializer.text;
              if (styledClassName) classVal = `${styledClassName} ${classVal}`;
              list.push(`class="${classVal}"`);
            } else if (ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
              const exprText = prop.initializer.expression.getText(sourceFile);
              if (styledClassName) {
                list.push(`:class="\`${styledClassName} \${${exprText}}\`"`);
              } else {
                list.push(`:class="${exprText}"`);
              }
            }
          }
          return;
        }

        // Style mapping and automatic scoped block extraction
        if (name === "style" && prop.initializer && ts.isJsxExpression(prop.initializer)) {
          const styleText = prop.initializer.getText(sourceFile);
          
          const cleanStyle = styleText.trim();
          let innerContent = cleanStyle;
          if (innerContent.startsWith("{{") && innerContent.endsWith("}}")) {
            innerContent = innerContent.slice(2, -2).trim();
          } else if (innerContent.startsWith("{") && innerContent.endsWith("}")) {
            innerContent = innerContent.slice(1, -1).trim();
          }

          // Check if it is a simple static style object declaration
          const isStatic = !innerContent.includes("?") && !innerContent.includes("${") && !innerContent.includes("(");

          if (isStatic && innerContent.trim() !== "") {
            const elIndex = context.styledComponents.length + 1;
            const className = `inline-style-${elIndex}`;
            
            const declarations = innerContent.split(",");
            const cssRules: string[] = [];
            
            declarations.forEach((decl) => {
              const parts = decl.split(":");
              if (parts.length >= 2) {
                const rawKey = parts[0].trim();
                const rawVal = parts.slice(1).join(":").trim();
                
                let key = "";
                for (let i = 0; i < rawKey.length; i++) {
                  const char = rawKey[i];
                  if (char === "'" || char === '"') continue;
                  if (char === char.toUpperCase() && char !== char.toLowerCase()) {
                    key += "-" + char.toLowerCase();
                  } else {
                    key += char;
                  }
                }
                
                let val = rawVal.replace(/['"]/g, "").trim();
                const isNumeric = !isNaN(Number(val)) && val !== "";
                if (isNumeric) {
                  val += "px";
                }
                cssRules.push(`${key}: ${val};`);
              }
            });

            if (cssRules.length > 0) {
              context.styledComponents.push({
                name: className,
                tag: "",
                css: cssRules.join("\n  ")
              });
              
              list.push(`class="${className}"`);
              return;
            }
          }

          list.push(transformInlineStyle(styleText));
          return;
        }

        // Event handler unwrapping
        if (name.startsWith("on") && name[2] === name[2]?.toUpperCase()) {
          const directive = getVueEventDirective(name);
          if (prop.initializer) {
            if (ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
              const expr = prop.initializer.expression;
              
              // Unwrapping arrow functions: onClick={() => remove(id)} -> @click="remove(id)"
              if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
                const body = expr.body;
                let eventBody = "";
                if (ts.isBlock(body)) {
                  if (body.statements.length === 1 && ts.isExpressionStatement(body.statements[0])) {
                    eventBody = body.statements[0].expression.getText(sourceFile);
                  } else {
                    eventBody = body.statements.map((s) => s.getText(sourceFile)).join("; ");
                  }
                } else {
                  eventBody = body.getText(sourceFile);
                }
                
                // Rewrite any callback props inside the inline event handler to emit
                 context.emits.forEach((e) => {
                   const prefix = e.name + "(";
                   const propsPrefix = "props." + e.name + "(";
                   
                   if (eventBody.startsWith(prefix)) {
                     const argsContent = eventBody.substring(prefix.length, eventBody.length - 1).trim();
                     eventBody = `emit('${e.eventName}'${argsContent ? ', ' + argsContent : ''})`;
                   } else if (eventBody.startsWith(propsPrefix)) {
                     const argsContent = eventBody.substring(propsPrefix.length, eventBody.length - 1).trim();
                     eventBody = `emit('${e.eventName}'${argsContent ? ', ' + argsContent : ''})`;
                   } else if (eventBody === e.name) {
                     eventBody = `emit('${e.eventName}')`;
                   } else if (eventBody === "props." + e.name) {
                     eventBody = `emit('${e.eventName}')`;
                   }
                 });

                list.push(`${directive}="${eventBody}"`);
              } else {
                let eventBody = expr.getText(sourceFile);
                context.emits.forEach((e) => {
                  if (eventBody === e.name) {
                    eventBody = `() => emit('${e.eventName}')`;
                  } else if (eventBody === `props.${e.name}`) {
                    eventBody = `() => emit('${e.eventName}')`;
                  }
                });
                list.push(`${directive}="${eventBody}"`);
              }
            }
          } else {
            list.push(directive);
          }
          return;
        }

        if (name === "ref" && prop.initializer && ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
          list.push(`ref="${prop.initializer.expression.getText(sourceFile)}"`);
          return;
        }

        // Static attributes & dynamic attributes
        if (prop.initializer) {
          if (ts.isStringLiteral(prop.initializer)) {
            list.push(`${name}="${prop.initializer.text}"`);
          } else if (ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
            list.push(`:${name}="${prop.initializer.expression.getText(sourceFile)}"`);
          }
        } else {
          list.push(name);
        }
      } else if (ts.isJsxSpreadAttribute(prop)) {
        list.push(`v-bind="${prop.expression.getText(sourceFile)}"`);
      }
    });

    if (styledClassName && !hasClass) {
      list.push(`class="${styledClassName}"`);
    }

    // Eliminate empty dynamic bindings e.g. <tr :>
    return list.length > 0 ? " " + list.filter((a) => a !== ":" && a !== "" && !a.endsWith('=""') && !a.endsWith(":=")).join(" ") : "";
  }

  function extractKeyFromNode(node: ts.Node): string {
    let keyStr = "";
    const extract = (n: ts.Node) => {
      if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
        const attrs = ts.isJsxElement(n) ? n.openingElement.attributes : n.attributes;
        attrs.properties.forEach((prop) => {
          if (ts.isJsxAttribute(prop) && prop.name.getText(sourceFile) === "key" && prop.initializer) {
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

  const compiled = compileNode(jsxNode).trim();
  const validation = validateVueTemplate(compiled);
  if (!validation.valid) {
    console.warn(`[ReactToNuxt] Generated Vue template validation failed: ${validation.error}`);
  }
  return compiled;
}

export function validateVueTemplate(html: string): { valid: boolean; error?: string } {
  const stack: string[] = [];
  let index = 0;

  while (index < html.length) {
    const char = html[index];
    if (char === "<") {
      const isClose = html[index + 1] === "/";
      const endTag = html.indexOf(">", index);
      if (endTag === -1) {
        return { valid: false, error: "Mismatched tag bracket '<'" };
      }

      const tagContent = html.substring(index + (isClose ? 2 : 1), endTag).trim();
      const tagName = tagContent.split(" ")[0].split("\n")[0];

      if (tagName && !tagName.startsWith("!") && !tagContent.endsWith("/")) {
        if (isClose) {
          const last = stack.pop();
          if (last !== tagName) {
            return { valid: false, error: `Mismatched closing tag: expected </${last}> but got </${tagName}>` };
          }
        } else {
          stack.push(tagName);
        }
      }
      index = endTag + 1;
    } else {
      index++;
    }
  }

  if (stack.length > 0) {
    return { valid: false, error: `Unclosed tags remaining: ${stack.join(", ")}` };
  }

  return { valid: true };
}

export function getVueEventDirective(reactEventName: string): string {
  const event = reactEventName.slice(2).toLowerCase();
  if (event === "submit") {
    return "@submit.prevent";
  }
  return `@${event}`;
}

export function transformInlineStyle(styleText: string): string {
  let content = styleText.trim();
  if (content.startsWith("{{") && content.endsWith("}}")) {
    content = content.slice(2, -2).trim();
  } else if (content.startsWith("{") && content.endsWith("}")) {
    content = content.slice(1, -1).trim();
  }

  const declarations = content.split(",");
  const staticParts: string[] = [];
  const dynamicDirectives: string[] = [];

  declarations.forEach((decl) => {
    const parts = decl.split(":");
    if (parts.length >= 2) {
      const rawKey = parts[0].trim();
      const rawVal = parts.slice(1).join(":").trim();

      // CamelCase to kebab-case
      let key = "";
      for (let i = 0; i < rawKey.length; i++) {
        const char = rawKey[i];
        if (char === "'" || char === '"') continue;
        if (char === char.toUpperCase() && char !== char.toLowerCase()) {
          key += "-" + char.toLowerCase();
        } else {
          key += char;
        }
      }

      const cleanVal = rawVal.trim();
      const startQuote = cleanVal.startsWith("'") || cleanVal.startsWith('"');
      const endQuote = cleanVal.endsWith("'") || cleanVal.endsWith('"');
      let isStaticString = startQuote && endQuote;

      if (isStaticString) {
        if (cleanVal.includes("?") || cleanVal.includes(":") || cleanVal.includes("${")) {
          isStaticString = false;
        }
      }

      let isStaticNumber = false;
      let checkVal = cleanVal;
      const units = ["px", "em", "rem", "%", "vh", "vw", "ms", "s"];
      units.forEach((u) => {
        if (checkVal.endsWith(u)) {
          checkVal = checkVal.substring(0, checkVal.length - u.length);
        }
      });
      const parsedNum = Number(checkVal);
      if (!isNaN(parsedNum) && checkVal.trim() !== "") {
        isStaticNumber = true;
      }

      if (isStaticString) {
        const stringVal = cleanVal.slice(1, -1);
        staticParts.push(`${key}: ${stringVal}`);
      } else if (isStaticNumber) {
        let unitPadded = cleanVal;
        let hasUnit = false;
        units.forEach((u) => {
          if (cleanVal.endsWith(u)) hasUnit = true;
        });
        if (!hasUnit) {
          unitPadded = `${cleanVal}px`;
        }
        staticParts.push(`${key}: ${unitPadded}`);
      } else {
        let unquotedVal = cleanVal;
        if (startQuote && endQuote) {
          unquotedVal = cleanVal.slice(1, -1).trim();
        }
        dynamicDirectives.push(`'${key}': ${unquotedVal}`);
      }
    }
  });

  const resultAttrs: string[] = [];
  if (staticParts.length > 0) {
    resultAttrs.push(`style="${staticParts.join("; ")};"`);
  }
  if (dynamicDirectives.length > 0) {
    resultAttrs.push(`:style="{ ${dynamicDirectives.join(", ")} }"`);
  }

  if (resultAttrs.length > 0) {
    return resultAttrs.join(" ");
  }

  return `:style="${content}"`;
}

export function stripKeyAttribute(html: string): string {
  const targets = [':key="', 'key="', ':key={', 'key={'];
  let currentHtml = html;

  for (const target of targets) {
    let index = currentHtml.indexOf(target);
    while (index !== -1) {
      const closingChar = target.endsWith('"') ? '"' : '}';
      const closeIndex = currentHtml.indexOf(closingChar, index + target.length);
      if (closeIndex !== -1) {
        const before = currentHtml.substring(0, index);
        const after = currentHtml.substring(closeIndex + 1);
        currentHtml = before.trimEnd() + " " + after.trimStart();
      } else {
        break;
      }
      index = currentHtml.indexOf(target);
    }
  }

  return currentHtml;
}
