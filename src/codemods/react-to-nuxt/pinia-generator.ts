import * as ts from "typescript";

export function transformStoreToPinia(originalCode: string, fileName: string): string {
  const sf = ts.createSourceFile("temp.ts", originalCode, ts.ScriptTarget.Latest, true);
  let sliceName = fileName.replace(/\.[^/.]+$/, "");
  let initialStateText = "{}";
  const actionsList: string[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sf);
      if (callee === "createSlice" && node.arguments.length > 0) {
        const arg = node.arguments[0];
        if (ts.isObjectLiteralExpression(arg)) {
          arg.properties.forEach((prop) => {
            if (prop.name) {
              const propName = prop.name.getText(sf);
              if (propName === "name" && ts.isPropertyAssignment(prop)) {
                sliceName = prop.initializer.getText(sf).replace(/['"]/g, "");
              }
              if (propName === "initialState" && ts.isPropertyAssignment(prop)) {
                initialStateText = prop.initializer.getText(sf);
              }
              if (
                propName === "reducers" &&
                ts.isPropertyAssignment(prop) &&
                ts.isObjectLiteralExpression(prop.initializer)
              ) {
                prop.initializer.properties.forEach((reducerProp) => {
                  if (reducerProp.name) {
                    const reducerName = reducerProp.name.getText(sf);
                    let body = "";
                    if (ts.isPropertyAssignment(reducerProp)) {
                      body = reducerProp.initializer.getText(sf);
                    }
                    actionsList.push(`${reducerName}(state, action) ${body}`);
                  }
                });
              }
            }
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);

  // Transform Redux actions (state, action) to Pinia direct state mutations
  const piniaActions = actionsList.map((act) => {
    let body = act.substring(act.indexOf("{"));
    body = body.replace(/state\./g, "this.");
    body = body.replace(/action\.payload/g, "payload");
    const name = act.substring(0, act.indexOf("("));
    return `${name}(payload: any) ${body}`;
  });

  return `import { defineStore } from 'pinia';

export const use${sliceName.charAt(0).toUpperCase()}${sliceName.slice(1)}Store = defineStore('${sliceName}', {
  state: () => (${initialStateText}),
  actions: {
    ${piniaActions.join(",\n    ")}
  }
});
`;
}
