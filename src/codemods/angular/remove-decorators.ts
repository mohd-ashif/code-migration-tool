export function removeDecorators(source: string): string {
  return source.replace(/@[A-Za-z0-9_]+\([\s\S]*?\)/g, "");
}
