export function transformVueVFor(source: string): string {
  return source.replace(/v-for="([^"]+)"/g, "/* v-for transformed */");
}
