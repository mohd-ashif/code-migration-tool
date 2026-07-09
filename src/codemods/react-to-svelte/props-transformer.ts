import { ReactProp } from "./semantic-analyzer";

export function transformProps(props: ReactProp[]): string[] {
  const result: string[] = [];

  props.forEach((prop) => {
    const typeStr = prop.type && prop.type !== "any" ? `: ${prop.type}` : "";
    if (prop.defaultValue !== undefined) {
      result.push(`export let ${prop.name}${typeStr} = ${prop.defaultValue};`);
    } else {
      result.push(`export let ${prop.name}${typeStr};`);
    }
  });

  return result;
}
