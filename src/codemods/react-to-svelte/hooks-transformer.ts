import * as ts from "typescript";

export function transformRefs(code: string, refs: Array<{ name: string }>): string {
  if (!code.trim() || refs.length === 0) return code;

  const sourceFile = ts.createSourceFile("temp.ts", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const refNames = new Set(refs.map((r) => r.name));

  const transformer = (context: ts.TransformationContext) => {
    return (rootNode: ts.Node) => {
      const visit = (node: ts.Node): ts.Node => {
        if (ts.isPropertyAccessExpression(node)) {
          const obj = node.expression;
          const prop = node.name;
          if (ts.isIdentifier(obj) && refNames.has(obj.text) && prop.text === "current") {
            return ts.factory.createIdentifier(obj.text);
          }
        }
        return ts.visitEachChild(node, visit, context);
      };
      return ts.visitNode(rootNode, visit);
    };
  };

  const result = ts.transform(sourceFile, [transformer]);
  const printer = ts.createPrinter();
  return printer.printFile(result.transformed[0] as ts.SourceFile).trim();
}

export function transformCustomHooks(code: string): string {
  // Retained for generic custom hook mapping utility.
  return code;
}
