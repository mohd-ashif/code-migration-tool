export function transformReactToNext(source: string): string {
  return source.replace(/export default function/g, "export default function");
}
