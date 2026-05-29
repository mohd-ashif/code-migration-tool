export function transformNgModule(source: string): string {
  return source.replace(/@NgModule\([\s\S]*?\)/g, "");
}
