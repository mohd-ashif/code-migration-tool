import { migrateReactCodeToNuxt, migrateReactProjectToNuxt } from "../index";
import { generateConfigs } from "../config-generator";
import { generatePackageJson } from "../package-generator";

describe("React to Nuxt 3 AST Migration Engine", () => {

  // 1. Basic Components
  describe("Basic Components", () => {
    it("should migrate a simple JSX function component", () => {
      const code = `
        import React from 'react';
        export default function Header() {
          return <h1>Welcome to the Migration Tool</h1>;
        }
      `;
      const res = migrateReactCodeToNuxt(code, "Header.tsx");
      expect(res).toContain("<script setup lang=\"ts\">");
      expect(res).toContain("<h1>Welcome to the Migration Tool</h1>");
      expect(res).not.toContain("import React");
    });

    it("should migrate arrow components", () => {
      const code = `
        import React from 'react';
        const Title = () => <h2>Sub title</h2>;
        export default Title;
      `;
      const res = migrateReactCodeToNuxt(code, "Title.tsx");
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
      const res = migrateReactCodeToNuxt(code, "List.tsx");
      expect(res).toContain("const props = defineProps<{");
      expect(res).toContain("<template v-for=\"(item, i) in items\" :key=\"i\">");
    });

    it("should migrate class components to Vue setup syntax", () => {
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
      const res = migrateReactCodeToNuxt(code, "ButtonCounter.tsx");
      expect(res).toContain("const count = ref(0);");
      expect(res).toContain("count.value = count.value + 1");
      expect(res).toContain("@click=\"increment\"");
    });
  });

  // 2. Component Properties (Props)
  describe("Props Transformer", () => {
    it("should transform destructured functional parameters to Vue defineProps", () => {
      const code = `
        export default function Card({ title, active = false, count = 10 }: CardProps) {
          return <div className="card"><h3>{title}</h3></div>;
        }
      `;
      const res = migrateReactCodeToNuxt(code, "Card.tsx");
      expect(res).toContain("const props = withDefaults(defineProps<{");
      expect(res).toContain("title?: any;");
      expect(res).toContain("active: false");
      expect(res).toContain("count: 10");
    });
  });

  // 3. React Hooks
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
      const res = migrateReactCodeToNuxt(code, "Clicker.tsx");
      expect(res).toContain("const count = ref(0);");
      expect(res).toContain("count.value = count.value + 1");
      expect(res).toContain("@click=\"handleIncrement\"");
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
      const res = migrateReactCodeToNuxt(code, "Clicker.tsx");
      expect(res).toContain("const count = ref(0);");
      expect(res).toContain("count.value = count.value + 1");
    });

    it("should convert useReducer to reactive local states", () => {
      const code = `
        import React, { useReducer } from 'react';
        const reducer = (state, action) => state + 1;
        export default function ReducerComp() {
          const [state, dispatch] = useReducer(reducer, 0);
          return <button onClick={() => dispatch({type: 'inc'})}>{state}</button>;
        }
      `;
      const res = migrateReactCodeToNuxt(code, "ReducerComp.tsx");
      expect(res).toContain("const state = ref(0);");
    });

    it("should convert useRef to ref bindings", () => {
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
      const res = migrateReactCodeToNuxt(code, "FocusInput.tsx");
      expect(res).toContain("const inputRef = ref(null);");
      expect(res).toContain("inputRef.value.focus()");
      expect(res).toContain("ref=\"inputRef\"");
    });

    it("should convert useMemo to Vue computed properties", () => {
      const code = `
        import React, { useMemo } from 'react';
        export default function MemoComp({ number }) {
          const doubled = useMemo(() => number * 2, [number]);
          return <span>{doubled}</span>;
        }
      `;
      const res = migrateReactCodeToNuxt(code, "MemoComp.tsx");
      expect(res).toContain("const doubled = computed(() => number.value * 2);");
    });

    it("should convert useCallback to standard helper functions", () => {
      const code = `
        import React, { useCallback } from 'react';
        export default function CallbackComp() {
          const greet = useCallback(() => console.log('hello'), []);
          return <button onClick={greet}>Greet</button>;
        }
      `;
      const res = migrateReactCodeToNuxt(code, "CallbackComp.tsx");
      expect(res).toContain("const greet = () => console.log('hello');");
    });
  });

  // 4. Configuration Mappings
  describe("Project Configurations", () => {
    it("should generate proper Nuxt configs", () => {
      const configs = generateConfigs();
      expect(configs.some((c) => c.filename === "nuxt.config.ts")).toBe(true);
      expect(configs.some((c) => c.filename === "tsconfig.json")).toBe(true);
    });

    it("should adapt package.json to Nuxt 3", () => {
      const pkg = `{
        "dependencies": {
          "react": "^18.2.0",
          "react-dom": "^18.2.0"
        }
      }`;
      const updated = generatePackageJson(pkg);
      expect(updated).toContain("nuxt");
      expect(updated).not.toContain("react-dom");
    });

    it("should process a full project workspace through migrateReactProjectToNuxt", () => {
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
      const result = migrateReactProjectToNuxt(files);
      
      const pkg = result.find(f => f.path === "package.json");
      expect(pkg?.content).toContain("nuxt");
      expect(pkg?.content).not.toContain("@vitejs/plugin-react");

      const html = result.find(f => f.path === "index.html");
      expect(html).toBeUndefined(); // index.html is deleted

      const tsconfig = result.find(f => f.path === "tsconfig.json");
      expect(tsconfig?.content).not.toContain("jsx");

      const entry = result.find(f => f.path === "src/main.tsx");
      expect(entry).toBeUndefined(); // main.tsx is deleted

      const app = result.find(f => f.path === "app.vue");
      expect(app?.content).toContain("<h1>App</h1>");
    });
  });

  // 5. Advanced AST Refactorings
  describe("Advanced AST Refactorings", () => {
    it("should translate React callback props to Vue emits", () => {
      const code = `
        import React from 'react';
        interface Props {
          title: string;
          onSave(item: any): void;
          onCancel(): void;
        }
        export default function FormItem({ title, onSave, onCancel }: Props) {
          return (
            <div>
              <h3>{title}</h3>
              <button onClick={() => onSave('test')}>Save</button>
              <button onClick={onCancel}>Cancel</button>
            </div>
          );
        }
      `;
      const res = migrateReactCodeToNuxt(code, "FormItem.tsx");
      expect(res).toContain("const emit = defineEmits<{");
      expect(res).toContain('(e: "save", item: any): void;');
      expect(res).toContain('(e: "cancel", payload: any): void;');
      expect(res).toContain("emit('save', 'test')");
      expect(res).toContain("emit('cancel')");
    });

    it("should extract inline onSubmit arrow handlers into submitForm functions", () => {
      const code = `
        import React from 'react';
        export default function SimpleForm() {
          const handleSave = () => console.log('saved');
          return (
            <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
              <button type="submit">Submit</button>
            </form>
          );
        }
      `;
      const res = migrateReactCodeToNuxt(code, "SimpleForm.tsx");
      expect(res).toContain("@submit.prevent=\"submitForm\"");
      expect(res).toContain("const submitForm = () => {");
      expect(res).toContain("handleSave()");
    });

    it("should automatically resolve numerical inline style units and unwrap events", () => {
      const code = `
        import React from 'react';
        export default function StyledBox() {
          const handleClick = () => {};
          return (
            <div 
              style={{ padding: 20, margin: '10px' }} 
              onClick={() => handleClick()}
            >
              Box
            </div>
          );
        }
      `;
      const res = migrateReactCodeToNuxt(code, "StyledBox.tsx");
      expect(res).toContain('style="padding: 20px; margin: 10px;"');
      expect(res).toContain('@click="handleClick()"');
    });

    it("should migrate custom React hook files to composables/ and use Nuxt auto-imports", () => {
      const files = [
        {
          path: "src/hooks/useToggle.ts",
          content: `
            import { useState } from 'react';
            export function useToggle(init = false) {
              const [val, setVal] = useState(init);
              const toggle = () => setVal(!val);
              return [val, toggle];
            }
          `
        }
      ];
      const result = migrateReactProjectToNuxt(files);
      const hookFile = result.find(f => f.path === "composables/useToggle.ts");
      expect(hookFile).toBeDefined();
      expect(hookFile?.content).toContain("const val = ref(init);");
      expect(hookFile?.content).not.toContain("useState");
      expect(hookFile?.content).not.toContain("import {");
    });

    it("should transform React Query hooks to Nuxt 3 useAsyncData", () => {
      const code = `
        import React from 'react';
        import { useQuery } from 'react-query';
        export default function TodoList() {
          const { data: todos, isLoading } = useQuery(['todos', 1], () => fetchTodos(1));
          return <div>List</div>;
        }
      `;
      const res = migrateReactCodeToNuxt(code, "TodoList.tsx");
      expect(res).toContain("const { data: todos, pending: isLoading } = useAsyncData(`todos-1`, () => fetchTodos(1));");
    });

    it("should automatically convert plain derived state variables into Vue computed properties", () => {
      const code = `
        import React, { useState } from 'react';
        export default function DerivedComp() {
          const [items, setItems] = useState([1, 2, 3]);
          const total = items.reduce((acc, curr) => acc + curr, 0);
          return <span>{total}</span>;
        }
      `;
      const res = migrateReactCodeToNuxt(code, "DerivedComp.tsx");
      expect(res).toContain("const total = computed(() => items.value.reduce(");
    });

    it("should convert README files from React to Nuxt 3", () => {
      const readme = "This is a React project using Vite and Redux with Hooks.";
      const { transformReadmeToNuxt } = require("../readme-generator");
      const res = transformReadmeToNuxt(readme);
      expect(res).toBe("This is a Nuxt 3 project using Nuxt 3 and Pinia with Composables.");
    });

    it("should map specific React packages to Vue/Nuxt equivalents in README", () => {
      const readme = "Uses React Hook Form, Redux Toolkit, and Zustand.";
      const { transformReadmeToNuxt } = require("../readme-generator");
      const res = transformReadmeToNuxt(readme);
      expect(res).toContain("Uses VeeValidate Form Builder, Pinia State Management, and Pinia Stores.");
    });
  });
});
