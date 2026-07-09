import { migrateReactCodeToSolid } from "../react-to-solid/index";
import { migrateReactCodeToQwik } from "../react-to-qwik/index";
import { migrateAngularCodeToNext } from "../angular-to-next/index";

describe("New Framework Compiler Engines", () => {

  // 1. React -> SolidJS Compiler
  describe("React to SolidJS", () => {
    it("should transform state, effects, and JSX control flows to SolidJS equivalent", () => {
      const reactCode = `
        import React, { useState, useEffect } from 'react';
        export default function Counter() {
          const [count, setCount] = useState(0);
          useEffect(() => {
            console.log("Count changed to:", count);
          }, [count]);

          return (
            <div className="container">
              <p>Current Count: {count}</p>
              <button onClick={() => setCount(count + 1)}>Increment</button>
              {count > 5 && <span>High count!</span>}
            </div>
          );
        }
      `;

      const solidCode = migrateReactCodeToSolid(reactCode, "Counter.tsx");

      expect(solidCode).toContain('import { createSignal, createEffect } from "solid-js";');
      expect(solidCode).toContain("const [count, setCount] = createSignal(0);");
      expect(solidCode).toContain("createEffect(() => {");
      expect(solidCode).toContain("class=\"container\"");
      expect(solidCode).toContain("Current Count: {count()}");
      // Converts logical AND to Show component
      expect(solidCode).toContain("<Show when={count() > 5}>");
    });
  });

  // 2. React -> Qwik Compiler
  describe("React to Qwik", () => {
    it("should transform component structures and states to Qwik signal structures", () => {
      const reactCode = `
        import React, { useState } from 'react';
        export default function Header({ title }) {
          const [open, setOpen] = useState(false);
          return (
            <header className="header">
              <h1>{title}</h1>
              <button onClick={() => setOpen(!open)}>Toggle</button>
            </header>
          );
        }
      `;

      const qwikCode = migrateReactCodeToQwik(reactCode, "Header.tsx");

      expect(qwikCode).toContain('import { component$, useSignal } from "@builder.io/qwik";');
      expect(qwikCode).toContain("export const Header = component$(({ title }) => {");
      expect(qwikCode).toContain("const open = useSignal(false);");
      expect(qwikCode).toContain("class=\"header\"");
      expect(qwikCode).toContain("open.value = !open.value");
      expect(qwikCode).toContain("onClick$={");
    });
  });

  // 3. Angular -> NextJS (React) Compiler
  describe("Angular to NextJS", () => {
    it("should transform Angular Component decorators, templates, and bindings to React JSX", () => {
      const tsCode = `
        import { Component } from '@angular/core';
        @Component({
          selector: 'app-list',
          templateUrl: './list.component.html'
        })
        export class ListComponent {
          title: string = 'My List';
          items: string[] = ['Apple', 'Banana'];
          
          addItem(name: string) {
            this.items.push(name);
          }
        }
      `;

      const htmlCode = `
        <div class="list-wrapper">
          <h2>{{ title }}</h2>
          <ul>
            <li *ngFor="let item of items">{{ item }}</li>
          </ul>
          <button (click)="addItem('Orange')">Add Orange</button>
        </div>
      `;

      const nextCode = migrateAngularCodeToNext(tsCode, htmlCode, "list.component.ts");

      expect(nextCode).toContain('import React, { useState } from "react";');
      expect(nextCode).toContain("export default function ListComponent()");
      expect(nextCode).toContain("const [title, setTitle] = useState<string>('My List');");
      expect(nextCode).toContain("const [items, setItems] = useState<string[]>(['Apple', 'Banana']);");
      // check ngFor compiled to React map
      expect(nextCode).toContain("items?.map((item) =>");
      // check event binding compiled to onClick
      expect(nextCode).toContain("onClick={");
    });
  });
});
