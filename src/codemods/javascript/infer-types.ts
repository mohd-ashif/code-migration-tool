export function inferTypes(source: string): string {
  return source.replace(/(let|const)\s+(\w+)\s*=\s*([0-9]+)/g, "$1 $2: number = $3");
}
