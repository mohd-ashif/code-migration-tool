import * as ts from "typescript";

export interface RouterTransformationResult {
  code: string;
  routerImports: string[];
}

export function transformRouterNavigation(code: string): RouterTransformationResult {
  const routerImports: string[] = [];
  let transformed = code;

  // 1. Convert useNavigate hook instantiation: const navigate = useNavigate(); -> navigate will be imported directly
  if (transformed.includes("useNavigate")) {
    transformed = transformed.replace(/const\s+(\w+)\s*=\s*useNavigate\(\s*\);?/g, "");
    routerImports.push("navigate");
  }

  // 2. Convert useHistory hook instantiation: const history = useHistory(); -> map to navigate
  if (transformed.includes("useHistory")) {
    transformed = transformed.replace(/const\s+(\w+)\s*=\s*useHistory\(\s*\);?/g, "");
    routerImports.push("navigate");
  }

  // 3. Convert useParams hook instantiation: const params = useParams();
  if (transformed.includes("useParams")) {
    // Svelte-routing components pass params as props to the component.
    // e.g., export let id;
    // We can map const { id } = useParams() -> export let id;
    // For simplicity, let's let useParams map to a stub or Svelte route params.
    transformed = transformed.replace(/const\s+(\w+|\{[\s\S]+?\})\s*=\s*useParams\(\s*\);?/g, (match: string, paramName: string) => {
      if (paramName.startsWith("{")) {
        const props = paramName.slice(1, -1).split(",").map(p => p.trim());
        return props.map(p => `export let ${p};`).join("\n");
      }
      return `export let params = {};`;
    });
  }

  return {
    code: transformed,
    routerImports,
  };
}
