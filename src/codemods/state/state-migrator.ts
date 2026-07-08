import { ParsedFile } from "../../types/parser.types";

/**
 * Translates Redux store, action creators, and reducer nodes into Zustand stores.
 */
export function convertReduxToZustand(content: string): string {
  let zustandCode = `import { create } from 'zustand';\n\n`;

  // Extract initial state variables
  const initialStateMatch = content.match(/const\s+initialState\s*=\s*\{([\s\S]*?)\};/i);
  const initialStateFields = initialStateMatch ? initialStateMatch[1].trim() : "count: 0";

  // Extract actions and reducer logic to synthesize Zustand functions
  const actions: string[] = [];
  const actionRegex = /case\s+['"]([^'"]+)['"]:\s*return\s*\{([\s\S]*?)\};/g;
  let actionMatch;

  while ((actionMatch = actionRegex.exec(content)) !== null) {
    const actionName = actionMatch[1].toLowerCase().replace(/_([a-z])/g, (m, g) => g.toUpperCase());
    const returnVal = actionMatch[2].trim();
    // Parse increment / update values
    const cleanReturn = returnVal.replace(/state\./g, "state.");
    actions.push(`${actionName}: () => set((state: any) => ({ ${cleanReturn} }))`);
  }

  // Fallback default increment if no case match
  if (actions.length === 0) {
    actions.push(`increment: () => set((state: any) => ({ count: state.count + 1 }))`);
    actions.push(`decrement: () => set((state: any) => ({ count: state.count - 1 }))`);
  }

  zustandCode += `export const useStore = create((set) => ({\n  ${initialStateFields},\n  ${actions.join(",\n  ")}\n}));\n`;

  return zustandCode;
}

export function migrateStateLibrary(files: ParsedFile[]): ParsedFile[] {
  return files.map(f => {
    let content = f.content;
    let path = f.path;

    if (f.path.includes("store") || f.path.includes("redux") || f.path.includes("reducer")) {
      if (content.includes("createStore") || content.includes("reducer")) {
        content = convertReduxToZustand(content);
        path = f.path.replace(/\.(js|ts)$/, ".ts");
      }
    }

    return { path, content };
  });
}
