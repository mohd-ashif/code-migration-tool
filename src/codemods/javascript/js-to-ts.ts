export function transformJSToTS(source: string, filePath: string): { content: string; path: string } {
  const isJSX = filePath.endsWith(".jsx") || /<\s*[A-Za-z][^>]*>/.test(source);
  if (isJSX) {
    return transformJSXToTSX(source, filePath);
  }

  const content = source.replace(/const\s+([A-Za-z_$][\w$]*)\s*=\s*/g, "const $1: any = ");
  const path = filePath.endsWith(".js") ? filePath.replace(/\.jsx?$/, ".ts") : filePath;
  return { content, path };
}

export function transformJSXToTSX(source: string, filePath: string): { content: string; path: string } {
  let content = source;
  
  content = content.replace(/const\s+([A-Za-z_$][\w$]*)\s*=\s*\(\s*([^)]*?)\s*\)\s*=>\s*/g, (_match, name, params) => {
    const paramText = params ? `${params}: any` : "";
    return `const ${name} = (${paramText}): JSX.Element => `;
  });

  content = content.replace(/export\s+default\s+function\s+([A-Za-z_$][\w$]*)\s*\(\s*([^)]*?)\s*\)/g, (_match, name, params) => {
    const paramText = params ? `${params}: any` : "";
    return `export default function ${name}(${paramText}): JSX.Element`;
  });

  content = content.replace(/function\s+([A-Za-z_$][\w$]*)\s*\(\s*([^)]*?)\s*\)/g, (_match, name, params) => {
    const paramText = params ? `${params}: any` : "";
    return `function ${name}(${paramText}): JSX.Element`;
  });

  const path = filePath.replace(/\.jsx?$/, ".tsx");
  return { content, path };
}
