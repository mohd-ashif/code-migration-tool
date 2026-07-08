import { Router } from "express";
import { handleGetGraph } from "../controllers/graph.controller";

const router = Router();

router.get("/", handleGetGraph);

export default router;
