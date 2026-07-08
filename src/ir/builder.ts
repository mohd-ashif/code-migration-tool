import {
  UnifiedModuleIR,
  UnifiedComponentIR,
  UnifiedTemplateNode,
  LifecycleHookType,
} from "./types";

export class UnifiedComponentBuilder {
  private component: UnifiedComponentIR;

  constructor(name: string) {
    this.component = {
      name,
      props: [],
      state: [],
      methods: [],
      lifecycles: [],
      effects: [],
      template: { type: "fragment", name: "", attributes: [], events: [], children: [] },
      events: [],
      styles: [],
      contextUsages: [],
      storeBindings: [],
    };
  }

  public addProp(name: string, type: string, defaultValue?: string, required?: boolean): this {
    this.component.props.push({ name, type, defaultValue, required });
    return this;
  }

  public addState(name: string, type: string, initialValue?: string): this {
    this.component.state.push({ name, type, initialValue });
    return this;
  }

  public addMethod(
    name: string,
    params: { name: string; type: string }[],
    returnType: string,
    body: string,
    isAsync?: boolean
  ): this {
    this.component.methods.push({ name, params, returnType, body, isAsync });
    return this;
  }

  public addLifecycle(type: LifecycleHookType, body: string): this {
    this.component.lifecycles.push({ type, body });
    return this;
  }

  public addEffect(body: string, dependencies: string[]): this {
    this.component.effects.push({ body, dependencies });
    return this;
  }

  public setTemplate(template: UnifiedTemplateNode): this {
    this.component.template = template;
    return this;
  }

  public addEvent(name: string, payloadType?: string): this {
    this.component.events.push({ name, payloadType });
    return this;
  }

  public addStyle(selector: string, properties: Record<string, string>): this {
    this.component.styles.push({ selector, properties });
    return this;
  }

  public addContextUsage(name: string, alias?: string): this {
    this.component.contextUsages.push({ name, alias });
    return this;
  }

  public addStoreBinding(storeName: string, stateBindings: string[], actionBindings: string[]): this {
    this.component.storeBindings.push({ storeName, stateBindings, actionBindings });
    return this;
  }

  public build(): UnifiedComponentIR {
    return this.component;
  }
}

export class UnifiedModuleBuilder {
  private module: UnifiedModuleIR;

  constructor(absolutePath: string, relativePath: string) {
    this.module = {
      absolutePath,
      relativePath,
      imports: [],
      exports: [],
      components: [],
      routes: [],
    };
  }

  public addImport(
    moduleSpecifier: string,
    symbols: { name: string; alias?: string; isDefault?: boolean }[]
  ): this {
    this.module.imports.push({ moduleSpecifier, importedSymbols: symbols });
    return this;
  }

  public addExport(
    name: string,
    originalName?: string,
    isDefault?: boolean,
    moduleSpecifier?: string
  ): this {
    this.module.exports.push({ name, originalName, isDefault, moduleSpecifier });
    return this;
  }

  public addComponent(component: UnifiedComponentIR | UnifiedComponentBuilder): this {
    const comp = component instanceof UnifiedComponentBuilder ? component.build() : component;
    this.module.components.push(comp);
    return this;
  }

  public addRoute(
    path: string,
    component: string,
    children?: any[],
    guards?: string[],
    redirect?: string
  ): this {
    this.module.routes.push({ path, component, children, guards, redirect });
    return this;
  }

  public build(): UnifiedModuleIR {
    return this.module;
  }
}
