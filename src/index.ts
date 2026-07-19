import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import parseRoutes from "./routes/parse.routes";
import migrateRoutes from "./routes/migrate.routes";
import reportRoutes from "./routes/report.routes";
import downloadRoutes from "./routes/download.routes";
import jobsRoutes from "./routes/jobs.routes";
import graphRoutes from "./routes/graph.routes";
import authRoutes from "./routes/auth.routes";
import workspaceRoutes from "./routes/workspace.routes";
import historyRoutes from "./routes/history.routes";
import reportsRoutes from "./routes/reports.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import frameworkRoutes from "./routes/framework.routes";
import "./services/mail.service";
import { authMiddleware } from "./middleware/auth.middleware";
import { rateLimitMiddleware } from "./middleware/ratelimit.middleware";
import { workspaceMiddleware } from "./middleware/workspace.middleware";
import { errorHandler } from "./middleware/error.middleware";
import { connectRedis } from "./lib/redis";
import { initializeDatabase } from "./lib/database";
import { config, validateEnv } from "./config";
import { logger } from "./utils/logger";
// Start background workers
import "./queues/workers/migration.worker";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
app.use(rateLimitMiddleware);
app.use(authMiddleware);
app.use(workspaceMiddleware);

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    message: "Migration tool backend is running.",
    routes: ["/api/parse", "/api/migrate", "/api/report", "/api/download", "/api/jobs", "/api/graph", "/api/auth"],
  });
});

app.use("/api/parse", parseRoutes);
app.use("/api/migrate", migrateRoutes);
app.use("/api/report", reportRoutes);
app.use("/api/download", downloadRoutes);
app.use("/api/jobs", jobsRoutes);
app.use("/api/graph", graphRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/workspace", workspaceRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api", frameworkRoutes);

app.get("/api/sample", (_req, res) => {
  const path = require("path");
  const fs = require("fs");
  const filePath = path.join(__dirname, "..", "sample-project.zip");
  if (fs.existsSync(filePath)) {
    res.download(filePath, "sample-project.zip");
  } else {
    res.status(404).json({ success: false, message: "Sample project file not found." });
  }
});

app.use(errorHandler);

validateEnv();

const port = config.PORT;
app.listen(port, async () => {
  logger.info(`Migration backend running on http://localhost:${port}`);

  if (config.DATABASE_URL) {
    try {
      await initializeDatabase();
    } catch (error) {
      logger.error(`Database initialization failed: ${error}`);
    }
  }

  if (config.REDIS_URL) {
    try {
      await connectRedis();
      logger.info("Connected to Redis");
    } catch (error) {
      logger.error(`Redis connection failed: ${error}`);
    }
  } else {
    logger.info("No REDIS_URL configured; Redis is disabled.");
  }
});

export default app;
