import { Router } from "express";
import { FrameworkController } from "../controllers/FrameworkController";
import { EngineController } from "../controllers/EngineController";
import { adminMiddleware } from "../middleware/admin.middleware";

const router = Router();
const frameworkController = new FrameworkController();
const engineController = new EngineController();

// ── Frameworks & Capabilities ────────────────────────────────────────────────
router.get("/frameworks", frameworkController.getFrameworks);
router.get("/frameworks/:id", frameworkController.getFrameworkById);
router.get("/migration-matrix", frameworkController.getMigrationMatrix);
router.get("/compiler/health", frameworkController.getCompilerHealth);

// ── Migration Engines & Codemods ──────────────────────────────────────────────
router.get("/engines", engineController.getEngines);
router.patch("/engines/:id", adminMiddleware, engineController.updateEngine);
router.patch("/codemods/:id", adminMiddleware, engineController.updateCodemod);
router.patch("/compiler-settings/:id", adminMiddleware, engineController.updateCompilerSettings);

export default router;
