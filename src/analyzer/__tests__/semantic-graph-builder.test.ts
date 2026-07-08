// @ts-nocheck
import * as fs from "fs";
import * as path from "path";
import { SemanticGraphBuilder } from "../semantic-graph-builder";

describe("SemanticGraphBuilder", () => {
  const testWorkspaceDir = path.resolve(__dirname, "temp-test-workspace");

  beforeAll(() => {
    // Setup temporary mock codebase files
    if (!fs.existsSync(testWorkspaceDir)) {
      fs.mkdirSync(testWorkspaceDir, { recursive: true });
    }

    // 1. Angular component and service
    const angularComponentContent = `
      import { Component, OnInit } from '@angular/core';
      import { LoggerService } from './logger.service';

      @Component({
        selector: 'app-hero',
        template: '<h1>Hero works</h1>'
      })
      export class HeroComponent implements OnInit {
        constructor(private logger: LoggerService) {}
        ngOnInit() {
          this.logger.log('Hero init');
        }
      }
    `;
    const loggerServiceContent = `
      import { Injectable } from '@angular/core';
      @Injectable()
      export class LoggerService {
        log(msg: string) {
          console.log(msg);
        }
      }
    `;

    // 2. React component and custom hook
    const reactComponentContent = `
      import React from 'react';
      import { useCounter } from './useCounter';

      export default function CounterDisplay() {
        const { count, increment } = useCounter();
        return (
          <div>
            <span>{count}</span>
            <button onClick={increment}>Add</button>
          </div>
        );
      }
    `;
    const useCounterHookContent = `
      import { useState } from 'react';
      export function useCounter() {
        const [count, setCount] = useState(0);
        const increment = () => setCount(count + 1);
        return { count, increment };
      }
    `;

    // 3. Types interface / enum
    const typesContent = `
      export interface User {
        id: string;
        name: string;
      }
      export enum UserRole {
        ADMIN = 'admin',
        MEMBER = 'member'
      }
    `;

    // 4. Export declaration file
    const exportDeclContent = `
      export * from './types';
    `;

    // Write mock project files
    fs.writeFileSync(path.join(testWorkspaceDir, "hero.component.ts"), angularComponentContent);
    fs.writeFileSync(path.join(testWorkspaceDir, "logger.service.ts"), loggerServiceContent);
    fs.writeFileSync(path.join(testWorkspaceDir, "CounterDisplay.tsx"), reactComponentContent);
    fs.writeFileSync(path.join(testWorkspaceDir, "useCounter.ts"), useCounterHookContent);
    fs.writeFileSync(path.join(testWorkspaceDir, "types.ts"), typesContent);
    fs.writeFileSync(path.join(testWorkspaceDir, "main-export.ts"), exportDeclContent);
  });

  afterAll(() => {
    // Clean up mock codebase files
    if (fs.existsSync(testWorkspaceDir)) {
      fs.rmSync(testWorkspaceDir, { recursive: true, force: true });
    }
  });

  it("should successfully build a semantic graph with correct nodes and framework properties", () => {
    const graph = SemanticGraphBuilder.build(testWorkspaceDir);
    const nodes = graph.getNodes();

    expect(nodes.length).toBeGreaterThan(0);

    // 1. Verify Angular Component Class detection
    const heroNode = nodes.find((n) => n.symbolName === "HeroComponent");
    expect(heroNode).toBeDefined();
    expect(heroNode?.symbolType).toBe("component");
    expect(heroNode?.framework).toBe("angular");

    // 2. Verify Angular Service Class detection
    const loggerNode = nodes.find((n) => n.symbolName === "LoggerService");
    expect(loggerNode).toBeDefined();
    expect(loggerNode?.symbolType).toBe("class");
    expect(loggerNode?.framework).toBe("angular");

    // 3. Verify React Function Component detection
    const counterDisplayNode = nodes.find((n) => n.symbolName === "CounterDisplay");
    expect(counterDisplayNode).toBeDefined();
    expect(counterDisplayNode?.symbolType).toBe("component");
    expect(counterDisplayNode?.framework).toBe("react");

    // 4. Verify React Hook detection
    const useCounterNode = nodes.find((n) => n.symbolName === "useCounter");
    expect(useCounterNode).toBeDefined();
    expect(useCounterNode?.symbolType).toBe("hook");
    expect(useCounterNode?.framework).toBe("react");

    // 5. Verify Interface and Enum detection
    const userNode = nodes.find((n) => n.symbolName === "User");
    expect(userNode).toBeDefined();
    expect(userNode?.symbolType).toBe("interface");

    const roleNode = nodes.find((n) => n.symbolName === "UserRole");
    expect(roleNode).toBeDefined();
    expect(roleNode?.symbolType).toBe("enum");
  });

  it("should build accurate import/export nodes and dependency linkage", () => {
    const graph = SemanticGraphBuilder.build(testWorkspaceDir);
    
    // Find import node for logger service in hero component file
    const loggerImportNodes = graph.findImport("./logger.service");
    expect(loggerImportNodes.length).toBe(1);
    const loggerImportNode = loggerImportNodes[0];

    // Verify import depends on LoggerService export
    const dependencies = graph.getDependencies(loggerImportNode.id);
    const loggerServiceNode = dependencies.find((n) => n.symbolName === "LoggerService");
    expect(loggerServiceNode).toBeDefined();

    // Verify CounterDisplay calls/depends on useCounter hook
    const counterDisplayNode = graph.getNodes().find((n) => n.symbolName === "CounterDisplay");
    expect(counterDisplayNode).toBeDefined();

    const displayDeps = graph.getDependencies(counterDisplayNode!.id);
    const hasHookDependency = displayDeps.some((n) => n.symbolName === "useCounter");
    expect(hasHookDependency).toBe(true);

    // Verify reverse dependency lookup (dependents)
    const useCounterNode = graph.getNodes().find((n) => n.symbolName === "useCounter");
    expect(useCounterNode).toBeDefined();
    
    const hookDependents = graph.getDependents(useCounterNode!.id);
    const hasDisplayDependent = hookDependents.some((n) => n.symbolName === "CounterDisplay" || n.symbolType === "import");
    expect(hasDisplayDependent).toBe(true);
  });

  it("should support query APIs like getComponent, getSymbol, findExport", () => {
    const graph = SemanticGraphBuilder.build(testWorkspaceDir);

    // Test getSymbol
    const symbols = graph.getSymbol("HeroComponent");
    expect(symbols.length).toBe(1);
    expect(symbols[0].symbolType).toBe("component");

    // Test getComponent
    const componentNode = graph.getComponent(symbols[0].id);
    expect(componentNode).toBeDefined();
    expect(componentNode?.symbolName).toBe("HeroComponent");

    // Test findExport
    const exportNode = graph.findExport("./types");
    expect(exportNode).toBeDefined();
  });
});
