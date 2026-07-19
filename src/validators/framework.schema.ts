import Joi from "joi";
import { FrameworkStatus, OptimizationLevel } from "../types/framework.types";

const statusValues: FrameworkStatus[] = ["active", "inactive", "maintenance", "experimental", "deprecated"];
const optimizationValues: OptimizationLevel[] = ["ultra", "high", "medium", "low"];

// ── PATCH /api/engines/:id ────────────────────────────────────────────────────
export const patchEngineSchema = Joi.object({
  status: Joi.string()
    .valid(...statusValues)
    .optional()
    .messages({ "any.only": `status must be one of: ${statusValues.join(", ")}` }),

  optimizationLevel: Joi.string()
    .valid(...optimizationValues)
    .optional()
    .messages({ "any.only": `optimizationLevel must be one of: ${optimizationValues.join(", ")}` }),

  compilerVersion: Joi.string()
    .pattern(/^\d+\.\d+\.\d+$/)
    .optional()
    .messages({ "string.pattern.base": "compilerVersion must be semver (e.g. 1.2.3)" }),

  astVersion: Joi.string()
    .pattern(/^\d+\.\d+\.\d+$/)
    .optional()
    .messages({ "string.pattern.base": "astVersion must be semver (e.g. 1.2.3)" }),

  supported: Joi.boolean().optional(),
}).min(1).messages({
  "object.min": "At least one field is required for patch",
});

// ── PATCH /api/codemods/:id ───────────────────────────────────────────────────
export const patchCodemodSchema = Joi.object({
  enabled: Joi.boolean().optional(),
  priority: Joi.number().integer().min(1).max(10).optional(),
}).min(1).messages({
  "object.min": "At least one field is required for patch",
});

// ── PATCH /api/compiler-settings/:id ─────────────────────────────────────────
export const patchCompilerSettingsSchema = Joi.object({
  parallelProcessing:   Joi.boolean().optional(),
  optimization:         Joi.boolean().optional(),
  treeShaking:          Joi.boolean().optional(),
  sourceMaps:           Joi.boolean().optional(),
  strictMode:           Joi.boolean().optional(),
  experimentalFeatures: Joi.boolean().optional(),
  maxFileSize:  Joi.number().integer().min(1).max(10240).optional(),  // 1KB–10MB
  timeout:      Joi.number().integer().min(5).max(300).optional(),    // 5–300 seconds
  memoryLimit:  Joi.number().integer().min(64).max(4096).optional(),  // 64–4096 MB
}).min(1).messages({
  "object.min": "At least one field is required for patch",
});
