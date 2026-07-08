export interface UnifiedImportSymbol {
  name: string;
  alias?: string;
  isDefault?: boolean;
}

export interface UnifiedImport {
  moduleSpecifier: string;
  importedSymbols: UnifiedImportSymbol[];
}

export interface UnifiedExport {
  name: string;
  originalName?: string;
  isDefault?: boolean;
  moduleSpecifier?: string; // If re-exported from another module
}

export interface UnifiedProp {
  name: string;
  type: string;
  defaultValue?: string;
  required?: boolean;
}

export interface UnifiedState {
  name: string;
  type: string;
  initialValue?: string;
}

export interface UnifiedMethodParam {
  name: string;
  type: string;
}

export interface UnifiedMethod {
  name: string;
  params: UnifiedMethodParam[];
  returnType: string;
  body: string;
  isAsync?: boolean;
}

export type LifecycleHookType = "mount" | "unmount" | "update" | "init";

export interface UnifiedLifecycleHook {
  type: LifecycleHookType;
  body: string;
}

export interface UnifiedEffect {
  body: string;
  dependencies: string[]; // List of state or prop names
}

export type TemplateNodeType = "element" | "component" | "text" | "expression" | "fragment";

export interface TemplateNodeAttribute {
  name: string;
  value: string;
  isBinding?: boolean;
}

export interface TemplateNodeEvent {
  name: string; // e.g. "click", "change"
  handler: string; // name of handler method
}

export interface UnifiedTemplateNode {
  type: TemplateNodeType;
  name: string; // e.g. "div", "MyButton"
  attributes: TemplateNodeAttribute[];
  events: TemplateNodeEvent[];
  children: UnifiedTemplateNode[];
  conditional?: string; // e.g. "showLoading"
  loop?: {
    items: string; // e.g. "users"
    item: string; // e.g. "user"
    index?: string; // e.g. "i"
  };
  textContent?: string;
  expressionContent?: string;
}

export interface UnifiedEvent {
  name: string;
  payloadType?: string;
}

export interface UnifiedStyleRule {
  selector: string;
  properties: Record<string, string>;
}

export interface UnifiedRoutingConfig {
  path: string;
  component: string;
  children?: UnifiedRoutingConfig[];
  guards?: string[];
  redirect?: string;
}

export interface UnifiedContextUsage {
  name: string; // Context name (React) or Service class name (Angular)
  alias?: string;
}

export interface UnifiedStoreBinding {
  storeName: string;
  stateBindings: string[];
  actionBindings: string[];
}

export interface UnifiedComponentIR {
  name: string;
  props: UnifiedProp[];
  state: UnifiedState[];
  methods: UnifiedMethod[];
  lifecycles: UnifiedLifecycleHook[];
  effects: UnifiedEffect[];
  template: UnifiedTemplateNode;
  events: UnifiedEvent[];
  styles: UnifiedStyleRule[];
  contextUsages: UnifiedContextUsage[];
  storeBindings: UnifiedStoreBinding[];
}

export interface UnifiedModuleIR {
  absolutePath: string;
  relativePath: string;
  imports: UnifiedImport[];
  exports: UnifiedExport[];
  components: UnifiedComponentIR[];
  routes: UnifiedRoutingConfig[];
}
