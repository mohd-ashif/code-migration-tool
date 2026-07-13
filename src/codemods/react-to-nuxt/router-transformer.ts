import * as ts from "typescript";

export interface RouterTransformationResult {
  code: string;
  routerImports: string[];
}

export function transformRouterNavigation(code: string): RouterTransformationResult {
  const routerImports: string[] = [];
  let transformed = code;

  // 1. Convert useNavigate hook instantiation: const navigate = useNavigate(); -> const router = useRouter();
  if (transformed.includes("useNavigate")) {
    transformed = transformed.replace(/const\s+(\w+)\s*=\s*useNavigate\(\s*\);?/g, "const $1 = useRouter();");
    // Translate navigate("/path") -> navigateTo("/path")
    transformed = transformed.replace(/(\w+)\(([^)]+)\)/g, (match, fn, arg) => {
      if (fn === "navigate") {
        return `navigateTo(${arg})`;
      }
      return match;
    });
  }

  // 2. Convert useHistory hook instantiation: const history = useHistory(); -> maps to navigateTo()
  if (transformed.includes("useHistory")) {
    transformed = transformed.replace(/const\s+(\w+)\s*=\s*useHistory\(\s*\);?/g, "");
    transformed = transformed.replace(/(\w+)\.push\(([^)]+)\)/g, "navigateTo($2)");
  }

  // 3. Convert useParams hook instantiation: const params = useParams(); -> const params = useRoute().params;
  if (transformed.includes("useParams")) {
    transformed = transformed.replace(/const\s+(\w+|\{[\s\S]+?\})\s*=\s*useParams\(\s*\);?/g, (match, paramName) => {
      return `const ${paramName} = useRoute().params;`;
    });
  }

  return {
    code: transformed,
    routerImports,
  };
}

export interface ExtractedRoute {
  path: string;
  componentName: string;
}

export function extractRoutesFromCode(code: string): ExtractedRoute[] {
  const routes: ExtractedRoute[] = [];
  const sf = ts.createSourceFile("temp.ts", code, ts.ScriptTarget.Latest, true);

  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxElement(node)) {
      const tagName = ts.isJsxElement(node) ? node.openingElement.tagName.getText(sf) : node.tagName.getText(sf);
      if (tagName === "Route") {
        const attributes = ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes;
        let path = "";
        let componentName = "";

        attributes.properties.forEach((prop) => {
          if (ts.isJsxAttribute(prop) && prop.name) {
            const name = prop.name.getText(sf);
            if (name === "path" && prop.initializer) {
              path = prop.initializer.getText(sf).replace(/['"]/g, "");
            }
            if ((name === "element" || name === "component") && prop.initializer) {
              const initText = prop.initializer.getText(sf);
              // Regex-free element name cleanup: e.g. {<Home />} -> Home
              let clean = initText;
              clean = clean.replace("{", "").replace("}", "");
              clean = clean.replace("<", "").replace(">", "");
              clean = clean.replace("/", "").trim();
              
              // If there are props in element, e.g. Home props, split by spaces
              const parts = clean.split(" ");
              componentName = parts[0] || "";
            }
          }
        });

        if (path) {
          routes.push({ path, componentName });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return routes;
}

export function mapReactRouteToNuxtPagePath(reactPath: string): string {
  let path = reactPath;
  if (path.startsWith("/")) path = path.slice(1);
  if (path === "") return "pages/index.vue";

  const parts = path.split("/");
  const mappedParts = parts.map((part) => {
    if (part.startsWith(":") || (part.startsWith("{") && part.endsWith("}"))) {
      let paramName = part;
      paramName = paramName.replace(":", "");
      paramName = paramName.replace("{", "");
      paramName = paramName.replace("}", "");
      return `[${paramName}]`;
    }
    return part;
  });

  return `pages/${mappedParts.join("/")}.vue`;
}
