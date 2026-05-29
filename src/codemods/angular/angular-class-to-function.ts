export function transformAngularToReact(source: string): string {
  return source.replace(/@Component\([\s\S]*?\)\s*export class/, "export function");
}
