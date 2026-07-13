export function getVueEventDirective(reactEventName: string): string {
  const event = reactEventName.slice(2).toLowerCase();

  if (event === "submit") {
    return "@submit.prevent";
  }

  return `@${event}`;
}
