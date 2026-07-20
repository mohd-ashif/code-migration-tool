import { Router } from "express";
import { handleGetGraph } from "../controllers/graph.controller";
import { requireFeature } from "../middleware/billing.middleware";

const router = Router();

router.get("/", requireFeature("dependency_graph"), handleGetGraph);

export default router;
