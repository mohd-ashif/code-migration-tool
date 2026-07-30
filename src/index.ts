import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import http from "http";
import parseRoutes from "./routes/parse.routes";
import migrateRoutes from "./routes/migrate.routes";
import reportRoutes from "./routes/report.routes";
import downloadRoutes from "./routes/download.routes";
import jobsRoutes from "./routes/jobs.routes";
import graphRoutes from "./routes/graph.routes";
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import workspaceRoutes from "./routes/workspace.routes";
import historyRoutes from "./routes/history.routes";
import reportsRoutes from "./routes/reports.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import frameworkRoutes from "./routes/framework.routes";
import billingRoutes from "./routes/billing.routes";
import paymentRoutes from "./routes/payment.routes";
import invoiceRoutes from "./routes/invoice.routes";
import subscriptionRoutes from "./routes/subscription.routes";
import webhookRoutes from "./routes/webhook.routes";
import uploadRoutes from "./routes/upload.routes";
import "./services/mail.service";
import { authMiddleware } from "./middleware/auth.middleware";
import { rateLimitMiddleware } from "./middleware/ratelimit.middleware";
import { workspaceMiddleware } from "./middleware/workspace.middleware";
import { errorHandler } from "./middleware/error.middleware";
import { connectRedis } from "./lib/redis";
import { initializeDatabase, queryDatabase } from "./lib/database";
import { config, validateEnv } from "./config";
import { logger } from "./utils/logger";
import { wsService } from "./services/ws.service";
import "./queues/workers/migration.worker";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ 
  limit: "50mb",
  verify: (req: any, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(morgan("dev"));
app.use(rateLimitMiddleware);

app.get("/api/check-db", async (req, res) => {
  try {
    const tables = await queryDatabase(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    let plans = [];
    try {
      plans = await queryDatabase(`SELECT * FROM subscription_plans`);
    } catch (e: any) {
      plans = [{ error: e.message }];
    }
    res.json({ tables: tables.map((t: any) => t.table_name), plans });
  } catch (err: any) {
    res.json({ error: err.message });
  }
});

app.use(authMiddleware);
app.use(workspaceMiddleware);

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    message: "Migration tool backend is running.",
    routes: ["/api/parse", "/api/migrate", "/api/upload", "/api/report", "/api/download", "/api/jobs", "/api/graph", "/api/auth", "/api/billing", "/api/payments", "/api/invoices", "/api/subscription"],
  });
});

import migrationsRoutes from "./routes/migrations.routes";
import adminRoutes from "./routes/admin.routes";

app.use("/api/parse", parseRoutes);
app.use("/api/migrate", migrateRoutes);
app.use("/api/migrations", migrationsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/report", reportRoutes);
app.use("/api/download", downloadRoutes);
app.use("/api/jobs", jobsRoutes);
app.use("/api/graph", graphRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/workspace", workspaceRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api", frameworkRoutes);

const swaggerHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@3/swagger-ui.css" >
  <style>
    html { box-sizing: border-box; overflow: -y-scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin:0; background: #fafafa; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@3/swagger-ui-bundle.js"> </script>
  <script src="https://unpkg.com/swagger-ui-dist@3/swagger-ui-standalone-preset.js"> </script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: "/api/swagger.json",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout"
      });
      window.ui = ui;
    };
  </script>
</body>
</html>
`;

app.get("/api/swagger.json", (_req, res) => {
  res.json(require("./swagger.json"));
});

app.get("/api/docs", (_req, res) => {
  res.send(swaggerHtml);
});

app.use(errorHandler);

validateEnv();

const port = config.PORT;
const server = http.createServer(app);

// Attach Native WebSocket Service for real-time migration updates
wsService.attach(server);

server.listen(port, async () => {
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
