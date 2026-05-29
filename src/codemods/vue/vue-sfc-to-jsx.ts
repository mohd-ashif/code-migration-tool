export function transformVueSFCToJSX(source: string): string {
  return source.replace(/<template>[\s\S]*?<\/template>/, "");
}
