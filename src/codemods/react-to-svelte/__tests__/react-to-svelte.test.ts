import { migrateReactCodeToSvelte, migrateReactProjectToSvelte } from "../index";
import { generateConfigs } from "../config-generator";
import { generatePackageJson } from "../package-generator";
import { validateProject, runIsolatedMigration } from "../../../services/sandbox.service";

describe("React to Svelte AST Migration Engine", () => {
  
  // 1. Core Component Parsing & Structure
  describe("Basic Components", () => {
    it("should migrate a simple JSX function component", () => {
      const code = `
        import React from 'react';
        export default function Header() {
          return <h1>Welcome to the Migration Tool</h1>;
        }
      `;
      const res = migrateReactCodeToSvelte(code, "Header.tsx");
      expect(res).toContain("<script lang=\"ts\">");
      expect(res).toContain("<h1>Welcome to the Migration Tool</h1>");
      expect(res).not.toContain("import React");
    });

    it("should migrate arrow components", () => {
      const code = `
        import React from 'react';
        const Title = () => <h2>Sub title</h2>;
        export default Title;
      `;
      const res = migrateReactCodeToSvelte(code, "Title.tsx");
      expect(res).toContain("<h2>Sub title</h2>");
    });

    it("should migrate TypeScript generic components", () => {
      const code = `
        import React from 'react';
        interface ListProps<T> {
          items: T[];
        }
        export function List<T>({ items }: ListProps<T>) {
          return <ul>{items.map((item, i) => <li key={i}>{String(item)}</li>)}</ul>;
        }
      `;
      const res = migrateReactCodeToSvelte(code, "List.tsx");
      expect(res).toContain("export let items;");
      expect(res).toContain("{#each items as item, i}");
    });

    it("should migrate class components to Svelte template/scripts", () => {
      const code = `
        import React, { Component } from 'react';
        class ButtonCounter extends Component {
          state = {
            count: 0
          };
          increment = () => {
            this.setState({ count: this.state.count + 1 });
          };
          render() {
            return <button onClick={this.increment}>Clicked {this.state.count} times</button>;
          }
        }
        export default ButtonCounter;
      `;
      const res = migrateReactCodeToSvelte(code, "ButtonCounter.tsx");
      expect(res).toContain("let count = 0;");
      expect(res).toContain("count = count + 1");
      expect(res).toContain("on:click={increment}");
    });
  });

  // 2. Component Properties (Props)
  describe("Props Transformer", () => {
    it("should transform destructured functional parameters to Svelte export let variables", () => {
      const code = `
        export default function Card({ title, active = false, count = 10 }: CardProps) {
          return <div className="card"><h3>{title}</h3></div>;
        }
      `;
      const res = migrateReactCodeToSvelte(code, "Card.tsx");
      expect(res).toContain("export let title;");
      expect(res).toContain("export let active = false;");
      expect(res).toContain("export let count = 10;");
    });

    it("should extract props destructured in the function body", () => {
      const code = `
        export default function Banner(props: BannerProps) {
          const { message, type = 'info' } = props;
          return <div className={type}>{message}</div>;
        }
      `;
      const res = migrateReactCodeToSvelte(code, "Banner.tsx");
      expect(res).toContain("export let message;");
      expect(res).toContain("export let type = 'info';");
    });
  });

  // 3. React Hooks (State, Effects, Refs, Context, Memoization)
  describe("React Hooks", () => {
    it("should translate useState calls and replace setter assignments", () => {
      const code = `
        import React, { useState } from 'react';
        export default function Clicker() {
          const [count, setCount] = useState(0);
          const handleIncrement = () => {
            setCount(count + 1);
          };
          return <button onClick={handleIncrement}>Count: {count}</button>;
        }
      `;
      const res = migrateReactCodeToSvelte(code, "Clicker.tsx");
      expect(res).toContain("let count = 0;");
      expect(res).toContain("count = count + 1");
      expect(res).toContain("on:click={handleIncrement}");
    });

    it("should translate useState functional updates", () => {
      const code = `
        import React, { useState } from 'react';
        export default function Clicker() {
          const [count, setCount] = useState(0);
          const step = () => {
            setCount(prev => prev + 1);
          };
          return <button onClick={step}>{count}</button>;
        }
      `;
      const res = migrateReactCodeToSvelte(code, "Clicker.tsx");
      expect(res).toContain("let count = 0;");
      expect(res).toContain("count = count + 1");
    });

    it("should convert useReducer to writable stores or local stores", () => {
      const code = `
        import React, { useReducer } from 'react';
        const reducer = (state, action) => state + 1;
        export default function ReducerComp() {
          const [state, dispatch] = useReducer(reducer, 0);
          return <button onClick={() => dispatch({type: 'inc'})}>{state}</button>;
        }
      `;
      const res = migrateReactCodeToSvelte(code, "ReducerComp.tsx");
      expect(res).toContain("let state = 0;");
      expect(res).toContain("dispatch({type: 'inc'})");
    });

    it("should convert useRef to bind:this and strip .current references", () => {
      const code = `
        import React, { useRef } from 'react';
        export default function FocusInput() {
          const inputRef = useRef(null);
          const handleFocus = () => {
            inputRef.current.focus();
          };
          return (
            <div>
              <input ref={inputRef} type="text" />
              <button onClick={handleFocus}>Focus</button>
            </div>
          );
        }
      `;
      const res = migrateReactCodeToSvelte(code, "FocusInput.tsx");
      expect(res).toContain("let inputRef = null;");
      expect(res).toContain("bind:this={inputRef}");
      expect(res).toContain("inputRef.focus()");
      expect(res).not.toContain("inputRef.current.focus()");
    });

    it("should convert useMemo to Svelte reactive declarations", () => {
      const code = `
        import React, { useMemo } from 'react';
        export default function MemoComp({ number }) {
          const doubled = useMemo(() => number * 2, [number]);
          return <span>{doubled}</span>;
        }
      `;
      const res = migrateReactCodeToSvelte(code, "MemoComp.tsx");
      expect(res).toContain("doubled = number * 2");
    });

    it("should convert useCallback to standard helper functions", () => {
      const code = `
        import React, { useCallback } from 'react';
        export default function CallbackComp() {
          const greet = useCallback(() => console.log('hello'), []);
          return <button onClick={greet}>Greet</button>;
        }
      `;
      const res = migrateReactCodeToSvelte(code, "CallbackComp.tsx");
      expect(res).toContain("const greet = () => console.log('hello')");
    });

    it("should transform useContext to getContext and strip Context.Provider", () => {
      const code = `
        import React, { useContext, createContext } from 'react';
        const UserContext = createContext();
        export function Profile() {
          const user = useContext(UserContext);
          return <div>{user.name}</div>;
        }
        export function App() {
          return (
            <UserContext.Provider value={{ name: 'Alice' }}>
              <Profile />
            </UserContext.Provider>
          );
        }
      `;
      const resProfile = migrateReactCodeToSvelte(code, "Profile.tsx");
      expect(resProfile).toContain("const user = getContext('UserContext');");
      expect(resProfile).toContain("import { getContext } from \"svelte\";");
      expect(resProfile).not.toContain("UserContext.Provider");
    });
  });

  // 4. Lifecycle Hooks (useEffect)
  describe("Lifecycle Hooks", () => {
    it("should map empty dependency useEffect to onMount", () => {
      const code = `
        import React, { useEffect } from 'react';
        export default function Mounter() {
          useEffect(() => {
            console.log('Component mounted');
          }, []);
          return <div>Mounted</div>;
        }
      `;
      const res = migrateReactCodeToSvelte(code, "Mounter.tsx");
      expect(res).toContain("onMount(() => {");
      expect(res).toContain("console.log('Component mounted');");
      expect(res).toContain("import { onMount } from \"svelte\";");
    });

    it("should map no dependency useEffect to afterUpdate", () => {
      const code = `
        import React, { useEffect } from 'react';
        export default function Updater() {
          useEffect(() => {
            console.log('Component updated');
          });
          return <div>Updated</div>;
        }
      `;
      const res = migrateReactCodeToSvelte(code, "Updater.tsx");
      expect(res).toContain("afterUpdate(() => {");
      expect(res).toContain("import { afterUpdate } from \"svelte\";");
    });

    it("should map active dependency useEffect to reactive blocks with cleanups", () => {
      const code = `
        import React, { useEffect } from 'react';
        export default function DepComp({ id }) {
          useEffect(() => {
            console.log('ID changed: ', id);
            return () => console.log('Cleaned up ID: ', id);
          }, [id]);
          return <div>{id}</div>;
        }
      `;
      const res = migrateReactCodeToSvelte(code, "DepComp.tsx");
      expect(res).toContain("let cleanup_effect_0;");
      expect(res).toContain("id;");
      expect(res).toContain("if (cleanup_effect_0) cleanup_effect_0();");
      expect(res).toContain("import { onDestroy } from \"svelte\";");
    });
  });

  // 5. JSX Transformation Details
  describe("JSX Templates", () => {
    it("should map className to class", () => {
      const code = `
        export default function SimpleClass() {
          return <div className="active-card">Card</div>;
        }
      `;
      const res = migrateReactCodeToSvelte(code, "SimpleClass.tsx");
      expect(res).toContain("class=\"active-card\"");
    });

    it("should support logical && rendering", () => {
      const code = `
        export default function Cond({ visible }) {
          return <div>{visible && <p>Visible Item</p>}</div>;
        }
      `;
      const res = migrateReactCodeToSvelte(code, "Cond.tsx");
      expect(res).toContain("{#if visible}<p>Visible Item</p>{/if}");
    });

    it("should support ternary rendering", () => {
      const code = `
        export default function Ternary({ isLoggedIn }) {
          return <div>{isLoggedIn ? <button>Logout</button> : <button>Login</button>}</div>;
        }
      `;
      const res = migrateReactCodeToSvelte(code, "Ternary.tsx");
      expect(res).toContain("{#if isLoggedIn}<button>Logout</button>{:else}<button>Login</button>{/if}");
    });

    it("should convert Array.map loop rendering with keys", () => {
      const code = `
        export default function Users({ users }) {
          return (
            <ul>
              {users.map(user => (
                <li key={user.id}>{user.name}</li>
              ))}
            </ul>
          );
        }
      `;
      const res = migrateReactCodeToSvelte(code, "Users.tsx");
      expect(res).toContain("{#each users as user (user.id)}");
      expect(res).toContain("<li>{user.name}</li>");
    });

    it("should map input controlled components to Svelte bind:value", () => {
      const code = `
        import React, { useState } from 'react';
        export default function InputVal() {
          const [text, setText] = useState('');
          return <input type="text" value={text} onChange={e => setText(e.target.value)} />;
        }
      `;
      const res = migrateReactCodeToSvelte(code, "InputVal.tsx");
      expect(res).toContain("<input type=\"text\" bind:value={text} />");
    });
  });

  // 6. State Libraries & Routing Mappings
  describe("Routing & State Libraries", () => {
    it("should rewrite useSelector/useDispatch state libraries to Svelte Store bindings", () => {
      const code = `
        import { useSelector, useDispatch } from 'react-redux';
        export default function ReduxComp() {
          const todos = useSelector(state => state.todos.list);
          const dispatch = useDispatch();
          return <div>Items: {todos.length}</div>;
        }
      `;
      const res = migrateReactCodeToSvelte(code, "ReduxComp.tsx");
      expect(res).toContain("import { todosStore } from \"../stores\";");
      expect(res).toContain("$: todos = $todosStore;");
      expect(res).not.toContain("useDispatch");
    });

    it("should rewrite react-router-dom v6 components to svelte-routing", () => {
      const code = `
        import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
        export default function RoutingComp() {
          return (
            <BrowserRouter>
              <Link to="/home">Home</Link>
              <Routes>
                <Route path="/home" element={<Home />} />
              </Routes>
            </BrowserRouter>
          );
        }
      `;
      const res = migrateReactCodeToSvelte(code, "RoutingComp.tsx");
      expect(res).toContain("import { Router, Link, Route } from \"svelte-routing\";");
      expect(res).toContain("<Route path=\"/home\" component={Home} />");
    });
  });

  // 7. Styling Transformations
  describe("Styles Mapping", () => {
    it("should convert React inline style objects to string attributes", () => {
      const code = `
        export default function InlineStyle() {
          return <div style={{ color: 'blue', fontSize: '16px' }}>Styled Text</div>;
        }
      `;
      const res = migrateReactCodeToSvelte(code, "InlineStyle.tsx");
      expect(res).toContain("style=\"color: blue; font-size: 16px;\"");
    });

    it("should extract styled-components styles to native Svelte style tags", () => {
      const code = `
        import styled from 'styled-components';
        const Button = styled.button\`
          background: red;
          color: white;
          &:hover {
            background: blue;
          }
        \`;
        export default function StyledComp() {
          return <Button>Click styled</Button>;
        }
      `;
      const res = migrateReactCodeToSvelte(code, "StyledComp.tsx");
      expect(res).toContain("<button class=\"Button\">");
      expect(res).toContain("<style>");
      expect(res).toContain(".Button {");
      expect(res).toContain("background: red;");
      expect(res).toContain(".Button:hover");
    });
  });

  // 8. Configuration File Boilerplates
  describe("Project Configurations", () => {
    it("should generate proper configs", () => {
      const configs = generateConfigs();
      expect(configs.some((c) => c.filename === "vite.config.ts")).toBe(true);
      expect(configs.some((c) => c.filename === "svelte.config.js")).toBe(true);
      expect(configs.some((c) => c.filename === "tsconfig.json")).toBe(true);
    });

    it("should adapt package.json dependency formats", () => {
      const pkg = `{
        "dependencies": {
          "react": "^18.2.0",
          "react-dom": "^18.2.0"
        }
      }`;
      const updated = generatePackageJson(pkg);
      expect(updated).toContain("svelte");
      expect(updated).not.toContain("react-dom");
    });

    it("should process a full project workspace through migrateReactProjectToSvelte", () => {
      const files = [
        {
          path: "package.json",
          content: '{"dependencies": {"react": "^18.2.0", "@vitejs/plugin-react": "^3.0.0"}}',
        },
        {
          path: "index.html",
          content: '<html><body><div id="root"></div><script src="/src/main.tsx"></script></body></html>',
        },
        {
          path: "tsconfig.json",
          content: '{"compilerOptions": {"jsx": "react-jsx"}}',
        },
        {
          path: "src/main.tsx",
          content: 'import React from "react"; import ReactDOM from "react-dom/client"; ReactDOM.createRoot(document.getElementById("root")).render(<App />);',
        },
        {
          path: "src/App.tsx",
          content: 'export default function App() { return <h1>App</h1>; }',
        }
      ];
      const result = migrateReactProjectToSvelte(files);
      
      const pkg = result.find(f => f.path === "package.json");
      expect(pkg?.content).toContain("svelte");
      expect(pkg?.content).not.toContain("@vitejs/plugin-react");

      const html = result.find(f => f.path === "index.html");
      expect(html?.content).toContain('id="app"');
      expect(html?.content).toContain('src/main.ts');

      const tsconfig = result.find(f => f.path === "tsconfig.json");
      expect(tsconfig?.content).not.toContain("jsx");

      const entry = result.find(f => f.path === "src/main.ts");
      expect(entry?.content).toContain("import App from \"./App.svelte\";");
      expect(entry?.content).toContain("target: document.getElementById(\"app\")!");

      const app = result.find(f => f.path === "src/App.svelte");
      expect(app?.content).toContain("<h1>App</h1>");
    });
  });

  // 9. Advanced React Features
  describe("Advanced Features", () => {
    it("should transform React Suspense to Svelte await blocks", () => {
      const code = `
        import React, { Suspense } from 'react';
        export default function App() {
          return (
            <Suspense fallback={<div>Loading...</div>}>
              <ProfileTimeline />
            </Suspense>
          );
        }
      `;
      const res = migrateReactCodeToSvelte(code, "App.tsx");
      expect(res).toContain("{#await Promise.resolve()}<div>Loading...</div>{:then}<ProfileTimeline />{/await}");
    });

    it("should bypass ErrorBoundary wrapper and render children", () => {
      const code = `
        import React from 'react';
        import ErrorBoundary from './ErrorBoundary';
        export default function App() {
          return (
            <ErrorBoundary>
              <MainContent />
            </ErrorBoundary>
          );
        }
      `;
      const res = migrateReactCodeToSvelte(code, "App.tsx");
      expect(res).toContain("<MainContent />");
      expect(res).not.toContain("<ErrorBoundary>");
    });

    it("should compile React createPortal to Svelte actions", () => {
      const code = `
        import React from 'react';
        import { createPortal } from 'react-dom';
        export default function Modal({ isOpen, container }) {
          if (!isOpen) return null;
          return createPortal(
            <div className="modal">Content</div>,
            container
          );
        }
      `;
      const res = migrateReactCodeToSvelte(code, "Modal.tsx");
      expect(res).toContain("<div use:portal={container}>");
      expect(res).toContain("function portal(node: HTMLElement, target: HTMLElement | null)");
    });
  });

  // 10. Sandbox Verification
  describe("Docker Sandbox Validation", () => {
    it("should run validation checks and successfully output verification results", async () => {
      const files = [
        {
          path: "src/App.svelte",
          content: "<script>let count = 0;</script><h1>{count}</h1>"
        }
      ];
      const result = await validateProject(files, "test-sandbox-job");
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("should handle runIsolatedMigration gracefully", async () => {
      const zipBuffer = Buffer.from("dummy-zip");
      const result = await runIsolatedMigration(zipBuffer, "test-mig-job");
      expect(result).toBeDefined();
      expect(result.success).toBe(false); // Docker is not available in host sandbox
    });
  });
});
