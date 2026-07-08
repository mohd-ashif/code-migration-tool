// @ts-nocheck
import { UnifiedModuleBuilder, UnifiedComponentBuilder } from "../builder";
import { UnifiedIRValidator } from "../validator";
import { UnifiedIRSerializer } from "../serializer";

describe("Unified Migration IR", () => {
  it("should successfully build a valid IR using the fluent builders", () => {
    const component = new UnifiedComponentBuilder("ProductCard")
      .addProp("productId", "string", undefined, true)
      .addProp("name", "string", "'Product'", false)
      .addState("quantity", "number", "1")
      .addMethod("addToCart", [], "void", "console.log('Added to cart');")
      .addLifecycle("mount", "console.log('ProductCard mounted');")
      .addLifecycle("unmount", "console.log('ProductCard destroyed');")
      .addEffect("console.log('Quantity changed');", ["quantity"])
      .setTemplate({
        type: "element",
        name: "div",
        attributes: [{ name: "class", value: "card" }],
        events: [{ name: "click", handler: "addToCart" }],
        children: [
          {
            type: "text",
            name: "",
            attributes: [],
            events: [],
            children: [],
            textContent: "Product: {name}",
          },
        ],
      })
      .addEvent("added", "string")
      .addStyle(".card", { border: "1px solid #ccc", padding: "10px" })
      .addContextUsage("AuthService", "auth")
      .addStoreBinding("CartStore", ["items"], ["addItem"]);

    const moduleIR = new UnifiedModuleBuilder("/src/ProductCard.ts", "src/ProductCard.ts")
      .addImport("./types", [{ name: "Product" }])
      .addExport("ProductCard", "default", true)
      .addComponent(component)
      .addRoute("/product/:id", "ProductCard")
      .build();

    expect(moduleIR).toBeDefined();
    expect(moduleIR.absolutePath).toBe("/src/ProductCard.ts");
    expect(moduleIR.components.length).toBe(1);

    const comp = moduleIR.components[0];
    expect(comp.name).toBe("ProductCard");
    expect(comp.props.length).toBe(2);
    expect(comp.state.length).toBe(1);
    expect(comp.methods.length).toBe(1);
    expect(comp.lifecycles.length).toBe(2);
    expect(comp.effects.length).toBe(1);
    expect(comp.events.length).toBe(1);
    expect(comp.styles.length).toBe(1);
    expect(comp.contextUsages.length).toBe(1);
    expect(comp.storeBindings.length).toBe(1);
  });

  it("should validate and detect structural problems using the validator", () => {
    // 1. Correct IR validation
    const validModule = new UnifiedModuleBuilder("/src/Home.ts", "src/Home.ts")
      .addComponent(new UnifiedComponentBuilder("HomeComponent"))
      .build();

    const validResult = UnifiedIRValidator.validate(validModule);
    expect(validResult.valid).toBe(true);
    expect(validResult.issues.length).toBe(0);

    // 2. Corrupt IR validation (missing component name, missing template root, missing paths)
    const invalidModule = {
      absolutePath: "",
      relativePath: "",
      imports: [],
      exports: [],
      components: [
        {
          name: "",
          props: [{ name: "" }],
          state: [],
          methods: [],
          lifecycles: [],
          effects: [],
          template: null as any,
          events: [],
          styles: [],
          contextUsages: [],
          storeBindings: [],
        },
      ],
      routes: [
        {
          path: "/dashboard",
          component: "Dashboard",
          children: [
            {
              path: "/dashboard", // duplicate path causing circular reference warning
              component: "Dashboard",
            },
          ],
        },
      ],
    };

    const invalidResult = UnifiedIRValidator.validate(invalidModule as any);
    expect(invalidResult.valid).toBe(false);

    const errors = invalidResult.issues.filter((i) => i.type === "error");
    const warnings = invalidResult.issues.filter((i) => i.type === "warning");

    expect(errors.some((e) => e.path === "absolutePath")).toBe(true);
    expect(errors.some((e) => e.path === "relativePath")).toBe(true);
    expect(errors.some((e) => e.path === "components[0].name")).toBe(true);
    expect(errors.some((e) => e.path === "components[0].props[0].name")).toBe(true);
    expect(errors.some((e) => e.path === "components[0].template")).toBe(true);

    expect(warnings.some((w) => w.path === "routes[0].children[0].path")).toBe(true);
  });

  it("should serialize to JSON and deserialize back correctly with parity matching", () => {
    const component = new UnifiedComponentBuilder("ProductCard")
      .addProp("productId", "string", undefined, true)
      .setTemplate({ type: "fragment", name: "", attributes: [], events: [], children: [] });

    const originalIR = new UnifiedModuleBuilder("/src/ProductCard.ts", "src/ProductCard.ts")
      .addComponent(component)
      .build();

    // Serialize
    const jsonStr = UnifiedIRSerializer.serialize(originalIR);
    expect(typeof jsonStr).toBe("string");

    // Deserialize
    const restoredIR = UnifiedIRSerializer.deserialize(jsonStr);
    expect(restoredIR).toBeDefined();
    expect(restoredIR.absolutePath).toBe(originalIR.absolutePath);
    expect(restoredIR.components[0].name).toBe(originalIR.components[0].name);

    // Serialization of corrupt IR should throw error
    const corruptIR = new UnifiedModuleBuilder("", "").build();
    expect(() => UnifiedIRSerializer.serialize(corruptIR)).toThrow();
  });
});
