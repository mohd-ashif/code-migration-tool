import { ReactContextUse } from "./semantic-analyzer";

export function transformContextUsage(contexts: ReactContextUse[]): { declarations: string[]; imports: string[] } {
  const declarations: string[] = [];
  const imports: string[] = [];

  if (contexts.length > 0) {
    imports.push("getContext");
    contexts.forEach((ctx) => {
      // Map MyContext -> 'MyContext'
      const contextKey = ctx.contextName.endsWith("Context") ? ctx.contextName : `${ctx.contextName}`;
      declarations.push(`const ${ctx.variableName} = getContext('${contextKey}');`);
    });
  }

  return { declarations, imports };
}
