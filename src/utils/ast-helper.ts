import * as ts from "typescript";

/**
 * Uses TypeScript compiler AST traversal to detect if the file uses any browser-only APIs
 * or standard React hooks that mandate a "use client" directive in Next.js App Router.
 */
export function checkRequiresClientDirective(sourceCode: string, filePath: string): boolean {
  const sourceFile = ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true);
  let requiresClient = false;
  
  function visit(node: ts.Node) {
    if (requiresClient) return;
    
    if (ts.isIdentifier(node)) {
      const name = node.text;
      // React hooks check (matches name starting with 'use' followed by uppercase letter)
      if (name.startsWith("use") && name !== "use" && name[3] && name[3] === name[3].toUpperCase()) {
        requiresClient = true;
        return;
      }
      // Browser environment APIs check
      if (["window", "document", "localStorage", "sessionStorage", "navigator"].includes(name)) {
        requiresClient = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  }
  
  visit(sourceFile);
  return requiresClient;
}

/**
 * Uses the TypeScript Compiler Transform API to cleanly remove react-router-dom imports,
 * replace useNavigate with Next.js useRouter, and inject clean imports.
 */
export function transformReactRouterImportsAndHooks(sourceCode: string, filePath: string): string {
  const sourceFile = ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true);
  
  let hasLink = false;
  let hasNavigate = false;
  let hasParams = false;
  let hasLocation = false;
  let hasReactRouterImport = false;

  // First pass: Analyze imports and navigate/location usage
  function analyze(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = (node.moduleSpecifier as ts.StringLiteral).text;
      if (moduleSpecifier === "react-router-dom") {
        hasReactRouterImport = true;
        const namedBindings = node.importClause?.namedBindings;
        if (namedBindings && ts.isNamedImports(namedBindings)) {
          namedBindings.elements.forEach(el => {
            const name = el.name.text;
            if (name === "Link") hasLink = true;
            if (name === "useNavigate") hasNavigate = true;
            if (name === "useParams") hasParams = true;
            if (name === "useLocation") hasLocation = true;
          });
        }
      }
    }
    ts.forEachChild(node, analyze);
  }
  
  analyze(sourceFile);

  if (!hasReactRouterImport) {
    return sourceCode;
  }

  // Second pass: Transformation using compiler transformation API
  const transformer = (context: ts.TransformationContext) => {
    return (rootNode: ts.SourceFile) => {
      const factory = context.factory;
      
      function visit(node: ts.Node): ts.Node | undefined {
        if (ts.isImportDeclaration(node)) {
          const moduleSpecifier = (node.moduleSpecifier as ts.StringLiteral).text;
          if (moduleSpecifier === "react-router-dom") {
            // Remove the react-router-dom import statement node
            return undefined;
          }
        }
        
        // Replace useNavigate hooks: const navigate = useNavigate() -> const router = useRouter()
        if (ts.isVariableDeclaration(node) && node.initializer && ts.isCallExpression(node.initializer)) {
          const init = node.initializer;
          if (ts.isIdentifier(init.expression) && init.expression.text === "useNavigate") {
            let varName = node.name;
            // Usually navigate or similar variable name
            return factory.updateVariableDeclaration(
              node,
              varName,
              node.exclamationToken,
              node.type,
              factory.createCallExpression(factory.createIdentifier("useRouter"), undefined, undefined)
            );
          }
        }

        // Replace navigate("...") calls to router.push("...")
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "navigate") {
          return factory.createCallExpression(
            factory.createPropertyAccessExpression(
              factory.createIdentifier("router"),
              factory.createIdentifier("push")
            ),
            undefined,
            node.arguments
          );
        }

        return ts.visitEachChild(node, visit, context);
      }

      const transformedFile = ts.visitNode(rootNode, visit) as ts.SourceFile;

      // Construct and prepend new Next.js replacement imports
      const additionalImports: ts.Statement[] = [];
      if (hasLink) {
        additionalImports.push(
          factory.createImportDeclaration(
            undefined,
            factory.createImportClause(
              false,
              factory.createIdentifier("Link"),
              undefined
            ),
            factory.createStringLiteral("next/link"),
            undefined
          )
        );
      }

      const nextNavImports: ts.ImportSpecifier[] = [];
      if (hasNavigate) {
        nextNavImports.push(factory.createImportSpecifier(false, undefined, factory.createIdentifier("useRouter")));
      }
      if (hasParams) {
        nextNavImports.push(factory.createImportSpecifier(false, undefined, factory.createIdentifier("useParams")));
      }
      if (hasLocation) {
        nextNavImports.push(factory.createImportSpecifier(false, undefined, factory.createIdentifier("usePathname")));
      }

      if (nextNavImports.length > 0) {
        additionalImports.push(
          factory.createImportDeclaration(
            undefined,
            factory.createImportClause(
              false,
              undefined,
              factory.createNamedImports(nextNavImports)
            ),
            factory.createStringLiteral("next/navigation"),
            undefined
          )
        );
      }

      return factory.updateSourceFile(
        transformedFile,
        [...additionalImports, ...transformedFile.statements]
      );
    };
  };

  const result = ts.transform(sourceFile, [transformer]);
  const printer = ts.createPrinter();
  let transformedSource = printer.printFile(result.transformed[0] as ts.SourceFile);

  // If useLocation was replaced with usePathname, insert compatibility fallback object
  if (hasLocation) {
    transformedSource = transformedSource.replace(
      /const\s+(\w+)\s*=\s*usePathname\(\)/g,
      "const $1 = { pathname: usePathname() }"
    );
  }

  // Rewrite React Router Link parameters in markup
  transformedSource = transformedSource.replace(/<Link\s+([^>]*?)to=/g, "<Link $1href=");

  return transformedSource;
}
