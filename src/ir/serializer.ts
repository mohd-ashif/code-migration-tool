import { UnifiedModuleIR } from "./types";
import { UnifiedIRValidator } from "./validator";

export class UnifiedIRSerializer {
  /**
   * Serializes a UnifiedModuleIR object into a JSON string.
   * Throws an error if the IR structure fails validation checks.
   */
  public static serialize(ir: UnifiedModuleIR, pretty: boolean = true): string {
    const validation = UnifiedIRValidator.validate(ir);
    if (!validation.valid) {
      const errors = validation.issues
        .filter((i) => i.type === "error")
        .map((i) => `${i.path}: ${i.message}`)
        .join(", ");
      throw new Error(`Cannot serialize invalid IR structure. Errors: [${errors}]`);
    }

    return JSON.stringify(ir, null, pretty ? 2 : 0);
  }

  /**
   * Deserializes a JSON string back into a UnifiedModuleIR object.
   * Throws an error if the JSON string is malformed or violates the IR schema.
   */
  public static deserialize(jsonStr: string): UnifiedModuleIR {
    const parsed = JSON.parse(jsonStr) as UnifiedModuleIR;

    const validation = UnifiedIRValidator.validate(parsed);
    if (!validation.valid) {
      const errors = validation.issues
        .filter((i) => i.type === "error")
        .map((i) => `${i.path}: ${i.message}`)
        .join(", ");
      throw new Error(`Deserialized object does not match valid IR schema. Errors: [${errors}]`);
    }

    return parsed;
  }
}
