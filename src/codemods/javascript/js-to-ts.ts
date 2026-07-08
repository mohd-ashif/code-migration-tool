export function transformJSToTS(source: string, filePath: string): { content: string; path: string } {
  const isJSX = filePath.endsWith(".jsx") || /<\s*[A-Za-z][^>]*>/.test(source);
  if (isJSX) {
    return transformJSXToTSX(source, filePath);
  }

  const path = filePath.endsWith(".js") ? filePath.replace(/\.js$/, ".ts") : filePath;
  return { content: source, path };
}

export function transformJSXToTSX(source: string, filePath: string): { content: string; path: string } {
  let content = source;
  
  // Convert standard React function components to use typed parameters where needed
  content = content.replace(/const\s+([A-Za-z_$][\w$]*)\s*=\s*\(\s*props\s*\)\s*=>\s*/g, "const $1 = (props: any) => ");
  content = content.replace(/export\s+default\s+function\s+([A-Za-z_$][\w$]*)\s*\(\s*props\s*\)/g, "export default function $1(props: any)");
  content = content.replace(/function\s+([A-Za-z_$][\w$]*)\s*\(\s*props\s*\)/g, "function $1(props: any)");

  const path = filePath.replace(/\.jsx?$/, ".tsx");
  return { content, path };
}

export function transformTSToJS(source: string, filePath: string): { content: string; path: string } {
  let content = source;
  // Strip TypeScript type annotations and definitions
  content = content.replace(/import\s+type\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?/g, "");
  content = content.replace(/interface\s+[A-Za-z_$][\w$]*\s*\{[\s\S]*?\}/g, "");
  content = content.replace(/type\s+[A-Za-z_$][\w$]*\s*=\s*[\s\S]*?;/g, "");
  content = content.replace(/:\s*(?:string|number|boolean|any|void|JSX\.Element|unknown|never|object|React\.ReactNode|React\.FC)\b/g, "");
  
  const path = filePath.endsWith(".tsx") ? filePath.replace(/\.tsx$/, ".jsx") : filePath.replace(/\.ts$/, ".js");
  return { content, path };
}
