export function transformLifecycleHooks(source: string): string {
  return source.replace(/OnInit|OnDestroy|AfterViewInit/g, "");
}
