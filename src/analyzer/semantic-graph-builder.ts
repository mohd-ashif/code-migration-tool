import { Project, SourceFile, SyntaxKind, ClassDeclaration, FunctionDeclaration, InterfaceDeclaration, EnumDeclaration, ImportDeclaration, ExportDeclaration, VariableDeclaration, ModuleResolutionKind } from "ts-morph";
import * as path from "path";
import * as fs from "fs";
import { SemanticGraph } from "./semantic-graph";
import { ISemanticGraph, SemanticNode, SymbolType, FrameworkType } from "./types";

export class SemanticGraphBuilder {
  /**
   * Builds a SemanticGraph of the codebase starting at rootPath.
   * Automatically parses tsconfig.json if available.
   */
  public static build(rootPath: string): ISemanticGraph {
    const absoluteRoot = path.resolve(rootPath);
    const tsConfigPath = path.join(absoluteRoot, "tsconfig.json");

    let project: Project;
    if (fs.existsSync(tsConfigPath)) {
      project = new Project({
        tsConfigFilePath: tsConfigPath,
        skipFileDependencyResolution: false,
      });
    } else {
      project = new Project({
        compilerOptions: {
          allowJs: true,
          experimentalDecorators: true,
          jsx: 1, // JxEmit.Preserve
          target: 99, // ESNext
          moduleResolution: ModuleResolutionKind.NodeJs,
        },
      });
      project.addSourceFilesAtPaths([
        path.join(absoluteRoot, "**/*.ts"),
        path.join(absoluteRoot, "**/*.tsx"),
        path.join(absoluteRoot, "**/*.js"),
        path.join(absoluteRoot, "**/*.jsx"),
        `!**/node_modules/**`,
        `!**/dist/**`,
        `!**/.next/**`,
      ]);
    }

    const graph = new SemanticGraph();
    const sourceFiles = project.getSourceFiles();

    // Map declarations to their containing nodes to easily add edges later
    const declarationToNodeMap = new Map<string, string>(); // astNodeUniqueKey -> nodeId

    // Helper: generate unique AST declaration key
    const getDeclarationKey = (filePath: string, startPos: number): string => {
      return `${filePath}:${startPos}`;
    };

    // Phase 1: Scan all files to register nodes (Vertices)
    for (const sourceFile of sourceFiles) {
      const filePath = sourceFile.getFilePath();
      const relativeFilePath = path.relative(absoluteRoot, filePath).replace(/\\/g, "/");
      const framework = this.detectFramework(sourceFile);

      // 1. Process Classes
      for (const cls of sourceFile.getClasses()) {
        const name = cls.getName() || "AnonymousClass";
        const isComponent = this.isClassComponent(cls);
        const symbolType: SymbolType = isComponent ? "component" : "class";
        const id = `${filePath}:${name}:${symbolType}`;

        graph.addNode({
          id,
          absolutePath: filePath,
          relativePath: relativeFilePath,
          symbolName: name,
          symbolType,
          framework,
          dependencies: [],
          dependents: [],
          sourceFile: sourceFile.getFullText(),
        });
        declarationToNodeMap.set(getDeclarationKey(filePath, cls.getStart()), id);
      }

      // 2. Process Interfaces
      for (const intf of sourceFile.getInterfaces()) {
        const name = intf.getName();
        const id = `${filePath}:${name}:interface`;

        graph.addNode({
          id,
          absolutePath: filePath,
          relativePath: relativeFilePath,
          symbolName: name,
          symbolType: "interface",
          framework,
          dependencies: [],
          dependents: [],
          sourceFile: sourceFile.getFullText(),
        });
        declarationToNodeMap.set(getDeclarationKey(filePath, intf.getStart()), id);
      }

      // 3. Process Enums
      for (const en of sourceFile.getEnums()) {
        const name = en.getName();
        const id = `${filePath}:${name}:enum`;

        graph.addNode({
          id,
          absolutePath: filePath,
          relativePath: relativeFilePath,
          symbolName: name,
          symbolType: "enum",
          framework,
          dependencies: [],
          dependents: [],
          sourceFile: sourceFile.getFullText(),
        });
        declarationToNodeMap.set(getDeclarationKey(filePath, en.getStart()), id);
      }

      // 4. Process Function Declarations
      for (const fn of sourceFile.getFunctions()) {
        const name = fn.getName();
        if (!name) continue;

        const isHook = this.isHookName(name);
        const isComponent = this.isFunctionComponent(fn);
        const symbolType: SymbolType = isComponent ? "component" : isHook ? "hook" : "function";
        const id = `${filePath}:${name}:${symbolType}`;

        graph.addNode({
          id,
          absolutePath: filePath,
          relativePath: relativeFilePath,
          symbolName: name,
          symbolType,
          framework,
          dependencies: [],
          dependents: [],
          sourceFile: sourceFile.getFullText(),
        });
        declarationToNodeMap.set(getDeclarationKey(filePath, fn.getStart()), id);
      }

      // 5. Process Arrow/Variable Functions
      for (const varDecl of sourceFile.getVariableDeclarations()) {
        const name = varDecl.getName();
        const init = varDecl.getInitializer();
        if (!init) continue;

        const isFunc = init.getKind() === SyntaxKind.ArrowFunction || init.getKind() === SyntaxKind.FunctionExpression;
        if (isFunc) {
          const isHook = this.isHookName(name);
          const isComponent = this.isFunctionComponent(init);
          const symbolType: SymbolType = isComponent ? "component" : isHook ? "hook" : "function";
          const id = `${filePath}:${name}:${symbolType}`;

          graph.addNode({
            id,
            absolutePath: filePath,
            relativePath: relativeFilePath,
            symbolName: name,
            symbolType,
            framework,
            dependencies: [],
            dependents: [],
            sourceFile: sourceFile.getFullText(),
          });
          declarationToNodeMap.set(getDeclarationKey(filePath, varDecl.getStart()), id);
        }
      }

      // 6. Process Import Declarations
      for (const imp of sourceFile.getImportDeclarations()) {
        const specifier = imp.getModuleSpecifierValue();
        const id = `${filePath}:${specifier}:import`;

        graph.addNode({
          id,
          absolutePath: filePath,
          relativePath: relativeFilePath,
          symbolName: specifier,
          symbolType: "import",
          framework,
          dependencies: [],
          dependents: [],
          sourceFile: sourceFile.getFullText(),
        });
        declarationToNodeMap.set(getDeclarationKey(filePath, imp.getStart()), id);
      }

      // 7. Process Export Declarations
      for (const exp of sourceFile.getExportDeclarations()) {
        const specifier = exp.getModuleSpecifierValue() || "local";
        const id = `${filePath}:${specifier}:export`;

        graph.addNode({
          id,
          absolutePath: filePath,
          relativePath: relativeFilePath,
          symbolName: specifier,
          symbolType: "export",
          framework,
          dependencies: [],
          dependents: [],
          sourceFile: sourceFile.getFullText(),
        });
        declarationToNodeMap.set(getDeclarationKey(filePath, exp.getStart()), id);
      }
    }

    // Phase 2: Traverse declarations and link Semantic dependency edges
    for (const sourceFile of sourceFiles) {
      const filePath = sourceFile.getFilePath();

      // Helper function to resolve symbol references inside a declaration block
      const linkDependencies = (declNodeId: string, searchNode: any) => {
        const identifiers = searchNode.getDescendantsOfKind(SyntaxKind.Identifier);
        for (const ident of identifiers) {
          try {
            const defNodes = ident.getDefinitionNodes();
            for (const defNode of defNodes) {
              const declFile = defNode.getSourceFile();
              const targetFilePath = declFile.getFilePath();

              // Link edge if it is a local declaration represented in the graph
              const targetKey = getDeclarationKey(targetFilePath, defNode.getStart());
              const targetNodeId = declarationToNodeMap.get(targetKey);
              if (targetNodeId && targetNodeId !== declNodeId) {
                graph.addEdge(declNodeId, targetNodeId);
              }
            }
          } catch (e) {
            // Ignore if language service is busy or resolves invalid node
          }
        }
      };

      // 1. Process Class dependencies
      for (const cls of sourceFile.getClasses()) {
        const name = cls.getName();
        if (!name) continue;
        const symbolType = this.isClassComponent(cls) ? "component" : "class";
        const nodeId = `${filePath}:${name}:${symbolType}`;
        linkDependencies(nodeId, cls);
      }

      // 2. Process Interface dependencies
      for (const intf of sourceFile.getInterfaces()) {
        const name = intf.getName();
        const nodeId = `${filePath}:${name}:interface`;
        linkDependencies(nodeId, intf);
      }

      // 3. Process Enum dependencies
      for (const en of sourceFile.getEnums()) {
        const name = en.getName();
        const nodeId = `${filePath}:${name}:enum`;
        linkDependencies(nodeId, en);
      }

      // 4. Process Function dependencies
      for (const fn of sourceFile.getFunctions()) {
        const name = fn.getName();
        if (!name) continue;
        const isHook = this.isHookName(name);
        const isComponent = this.isFunctionComponent(fn);
        const symbolType = isComponent ? "component" : isHook ? "hook" : "function";
        const nodeId = `${filePath}:${name}:${symbolType}`;
        linkDependencies(nodeId, fn);
      }

      // 5. Process Arrow/Variable Function dependencies
      for (const varDecl of sourceFile.getVariableDeclarations()) {
        const name = varDecl.getName();
        const init = varDecl.getInitializer();
        if (!init) continue;

        const isFunc = init.getKind() === SyntaxKind.ArrowFunction || init.getKind() === SyntaxKind.FunctionExpression;
        if (isFunc) {
          const isHook = this.isHookName(name);
          const isComponent = this.isFunctionComponent(init);
          const symbolType = isComponent ? "component" : isHook ? "hook" : "function";
          const nodeId = `${filePath}:${name}:${symbolType}`;
          linkDependencies(nodeId, varDecl);
        }
      }

      // 6. Link imports to their original exports in target files
      for (const imp of sourceFile.getImportDeclarations()) {
        const specifier = imp.getModuleSpecifierValue();
        const importNodeId = `${filePath}:${specifier}:import`;

        const importElements: any[] = [];
        const defaultImport = imp.getDefaultImport();
        if (defaultImport) importElements.push(defaultImport);

        const namespaceImport = imp.getNamespaceImport();
        if (namespaceImport) importElements.push(namespaceImport);

        imp.getNamedImports().forEach((ni: any) => {
          const nameNode = ni.getNameNode();
          if (nameNode) importElements.push(nameNode);
        });

        for (const elem of importElements) {
          try {
            const defNodes = elem.getDefinitionNodes();
            for (const defNode of defNodes) {
              const declFile = defNode.getSourceFile();
              const targetFilePath = declFile.getFilePath();

              const targetKey = getDeclarationKey(targetFilePath, defNode.getStart());
              const targetNodeId = declarationToNodeMap.get(targetKey);
              if (targetNodeId && targetNodeId !== importNodeId) {
                graph.addEdge(importNodeId, targetNodeId);
              }
            }
          } catch (e) {
            // Ignore
          }
        }
      }
    }

    return graph;
  }

  /**
   * Framework classification detector based on file structure & imports.
   */
  private static detectFramework(sourceFile: SourceFile): FrameworkType {
    const imports = sourceFile.getImportDeclarations();
    for (const imp of imports) {
      const specifier = imp.getModuleSpecifierValue();
      if (specifier.includes("react")) return "react";
      if (specifier.includes("@angular")) return "angular";
      if (specifier.includes("vue")) return "vue";
      if (specifier.includes("svelte")) return "svelte";
      if (specifier.includes("next")) return "next";
      if (specifier.includes("nuxt")) return "nuxt";
    }

    const classes = sourceFile.getClasses();
    for (const cls of classes) {
      if (cls.getDecorator("Component")) return "angular";
      if (cls.getDecorator("Injectable")) return "angular";
      if (cls.getDecorator("NgModule")) return "angular";
    }

    const filePath = sourceFile.getFilePath();
    if (filePath.endsWith(".tsx") || filePath.endsWith(".jsx")) {
      return "react";
    }

    return "unknown";
  }

  /**
   * Checks if function starts with React hook naming pattern.
   */
  private static isHookName(name: string): boolean {
    return name.startsWith("use") && name.length > 3 && name[3] === name[3].toUpperCase();
  }

  /**
   * Heuristic to determine if a class is an Angular or React Component.
   */
  private static isClassComponent(cls: ClassDeclaration): boolean {
    if (cls.getDecorator("Component")) return true;

    const baseClass = cls.getBaseClass();
    if (baseClass) {
      const baseName = baseClass.getName();
      if (baseName && (baseName.includes("Component") || baseName.includes("React.Component"))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Heuristic to check if a function returns JSX/TSX layout markup.
   */
  private static isFunctionComponent(node: any): boolean {
    if (typeof node.getDescendantsOfKind !== "function") return false;
    const jsxElements = node.getDescendantsOfKind(SyntaxKind.JsxElement);
    const jsxSelfClosing = node.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement);
    const jsxFragments = node.getDescendantsOfKind(SyntaxKind.JsxFragment);
    return jsxElements.length > 0 || jsxSelfClosing.length > 0 || jsxFragments.length > 0;
  }
}
