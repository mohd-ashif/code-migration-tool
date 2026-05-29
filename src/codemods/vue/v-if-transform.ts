export function transformVueVIf(source: string): string {
  return source.replace(/v-if="([^"]+)"/g, "{ $1 }" );
}
