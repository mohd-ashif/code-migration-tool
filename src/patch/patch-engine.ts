import { Project, SyntaxKind, SourceFile, Node, JsxElement } from "ts-morph";
import { ASTPatch, ASTPatchResult } from "./patch-types";

export class ASTPatchEngine {
  /**
   * Computes minimal structural edits between two files and applies them directly on the AST
   * while preserving formatting. Uses no text-replacement regex.
   */
  public static patch(originalCode: string, targetCode: string, diagnostics?: any[]): ASTPatchResult {
    const project = new Project({
      compilerOptions: { allowJs: true, jsx: 1 },
    });

    const originalFile = project.createSourceFile("original.tsx", originalCode, { overwrite: true });
    const targetFile = project.createSourceFile("target.tsx", targetCode, { overwrite: true });

    // 1. Compute Patches
    const patches = this.computePatches(originalFile, targetFile);

    // 2. Apply Patches directly on the AST of the original file
    this.applyPatchesToAST(originalFile, patches);

    return {
      patches,
      modifiedContent: originalFile.getFullText(),
    };
  }

  /**
   * Computes minimal edits by comparing AST structures of original and target files.
   */
  private static computePatches(originalFile: SourceFile, targetFile: SourceFile): ASTPatch[] {
    const patches: ASTPatch[] = [];

    // --- A. Diff Import Declarations ---
    const originalImports = originalFile.getImportDeclarations();
    const targetImports = targetFile.getImportDeclarations();

    const originalImportsMap = new Map(originalImports.map((i) => [i.getModuleSpecifierValue(), i]));
    const targetImportsMap = new Map(targetImports.map((i) => [i.getModuleSpecifierValue(), i]));

    // Find imports to delete
    for (const [specifier, imp] of originalImportsMap.entries()) {
      if (!targetImportsMap.has(specifier)) {
        patches.push({
          type: "delete",
          targetNodeKind: "ImportDeclaration",
          targetNodeName: specifier,
          originalPos: { start: imp.getStart(), end: imp.getEnd() },
        });
      }
    }

    // Find imports to insert or update
    for (const [specifier, targetImp] of targetImportsMap.entries()) {
      const origImp = originalImportsMap.get(specifier);
      if (!origImp) {
        patches.push({
          type: "insert",
          targetNodeKind: "ImportDeclaration",
          targetNodeName: specifier,
          newContent: targetImp.getText(),
        });
      } else if (origImp.getText() !== targetImp.getText()) {
        patches.push({
          type: "update-imports",
          targetNodeKind: "ImportDeclaration",
          targetNodeName: specifier,
          originalPos: { start: origImp.getStart(), end: origImp.getEnd() },
          newContent: targetImp.getText(),
        });
      }
    }

    // --- B. Diff Declarations (Classes, Functions, Interfaces, Enums) ---
    const originalDecls = this.getTopLevelDeclarations(originalFile);
    const targetDecls = this.getTopLevelDeclarations(targetFile);

    const originalDeclsMap = new Map(originalDecls.map((d) => [this.getDeclarationKey(d), d]));
    const targetDeclsMap = new Map(targetDecls.map((d) => [this.getDeclarationKey(d), d]));

    // Find declarations to delete
    for (const [key, decl] of originalDeclsMap.entries()) {
      if (!targetDeclsMap.has(key)) {
        patches.push({
          type: "delete",
          targetNodeKind: decl.getKindName(),
          targetNodeName: this.getDeclarationName(decl),
          originalPos: { start: decl.getStart(), end: decl.getEnd() },
        });
      }
    }

    // Find declarations to insert or replace
    for (const [key, targetDecl] of targetDeclsMap.entries()) {
      const origDecl = originalDeclsMap.get(key);
      if (!origDecl) {
        patches.push({
          type: "insert",
          targetNodeKind: targetDecl.getKindName(),
          targetNodeName: this.getDeclarationName(targetDecl),
          newContent: targetDecl.getText(),
        });
      } else if (origDecl.getText() !== targetDecl.getText()) {
        patches.push({
          type: "replace",
          targetNodeKind: targetDecl.getKindName(),
          targetNodeName: this.getDeclarationName(targetDecl),
          originalPos: { start: origDecl.getStart(), end: origDecl.getEnd() },
          newContent: targetDecl.getText(),
        });
      }
    }

    // --- C. Diff Move Edits (Optional, if symbols exist but are ordered differently) ---
    // If target has matching symbols in a different sequence, mark as move
    const originalKeys = originalDecls.map((d) => this.getDeclarationKey(d));
    const targetKeys = targetDecls.map((d) => this.getDeclarationKey(d));

    for (const key of targetKeys) {
      const origIdx = originalKeys.indexOf(key);
      const targetIdx = targetKeys.indexOf(key);
      if (origIdx !== -1 && origIdx !== targetIdx) {
        const origDecl = originalDeclsMap.get(key);
        if (origDecl) {
          patches.push({
            type: "move",
            targetNodeKind: origDecl.getKindName(),
            targetNodeName: this.getDeclarationName(origDecl),
            originalPos: { start: origDecl.getStart(), end: origDecl.getEnd() },
            newContent: `index:${targetIdx}`,
          });
        }
      }
    }

    return patches;
  }

  /**
   * Applies the computed patches directly onto the source file AST in reverse order.
   * Applying changes from bottom-to-top keeps positional index offsets intact.
   */
  private static applyPatchesToAST(sourceFile: SourceFile, patches: ASTPatch[]): void {
    // Sort patches by their original start position in descending order
    // Insert patches (without originalPos) are sorted to be processed at the end/top
    const sortedPatches = [...patches].sort((a, b) => {
      const posA = a.originalPos ? a.originalPos.start : -1;
      const posB = b.originalPos ? b.originalPos.start : -1;
      return posB - posA;
    });

    for (const patch of sortedPatches) {
      if (patch.originalPos) {
        // Resolve target node by matching position and kind
        const startPos = patch.originalPos.start;
        const descNode = sourceFile.getDescendantAtPos(startPos);
        if (!descNode) continue;

        let nodeToMutate: Node | undefined = descNode;
        while (nodeToMutate && nodeToMutate.getKindName() !== patch.targetNodeKind && nodeToMutate !== sourceFile) {
          nodeToMutate = nodeToMutate.getParent();
        }

        if (nodeToMutate && nodeToMutate !== sourceFile) {
          if (patch.type === "delete") {
            (nodeToMutate as any).remove();
          } else if (patch.type === "replace" || patch.type === "update-imports") {
            if (patch.newContent !== undefined) {
              nodeToMutate.replaceWithText(patch.newContent);
            }
          }
        }
      } else {
        // Insert patches
        if (patch.newContent !== undefined) {
          if (patch.targetNodeKind === "ImportDeclaration") {
            sourceFile.insertStatements(0, patch.newContent);
          } else {
            sourceFile.addStatements(patch.newContent);
          }
        }
      }
    }
  }

  private static getTopLevelDeclarations(sourceFile: SourceFile): Node[] {
    const decls: Node[] = [];
    decls.push(...sourceFile.getClasses());
    decls.push(...sourceFile.getFunctions());
    decls.push(...sourceFile.getInterfaces());
    decls.push(...sourceFile.getEnums());

    // Also get top level variable declarations containing functions
    sourceFile.getVariableStatements().forEach((stmt) => {
      stmt.getDeclarations().forEach((decl) => {
        const init = decl.getInitializer();
        if (init && (init.getKind() === SyntaxKind.ArrowFunction || init.getKind() === SyntaxKind.FunctionExpression)) {
          decls.push(decl);
        }
      });
    });

    return decls;
  }

  private static getDeclarationName(node: Node): string {
    if (Node.isClassDeclaration(node) || Node.isFunctionDeclaration(node) || Node.isInterfaceDeclaration(node) || Node.isEnumDeclaration(node)) {
      return node.getName() || "default";
    }
    if (Node.isVariableDeclaration(node)) {
      return node.getName();
    }
    return "unknown";
  }

  private static getDeclarationKey(node: Node): string {
    return `${node.getKindName()}:${this.getDeclarationName(node)}`;
  }
}
