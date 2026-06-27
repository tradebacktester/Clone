import express, { type Express } from "express";
import cors from "cors";
import compression from "compression";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { authenticate } from "./lib/auth.js";
import { startAnalysisScheduler } from "./lib/analyzer.js";
import { startPriceFeed } from "./lib/price-feed.js";
import { startPaperMonitor } from "./lib/paper-engine.js";
import { startSupervisor } from "./lib/supervisor-engine.js";
import { startStrategyHealthMonitor } from "./lib/strategy-health-monitor.js";
import { startReconciliationScheduler } from "./lib/broker-safety.js";
import { runStartupRecovery } from "./lib/recovery-engine.js";
import { db, botStateTable } from "@workspace/db";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(compression());

const allowedOrigin = process.env["ALLOWED_ORIGIN"] ?? "http://localhost:5000";
app.use(cors({
  origin: process.env["NODE_ENV"] === "development" ? true : allowedOrigin,
  credentials: true,
}));

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down" },
  skip: () => process.env["NODE_ENV"] === "test",
});

const heavyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Rate limit exceeded for compute-heavy endpoint" },
  skip: () => process.env["NODE_ENV"] === "test",
});

app.use(globalLimiter);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.post("/api/historical/upload-csv", express.json({ limit: "50mb" }));
app.post("/api/historical/upload-csv", express.urlencoded({ extended: true, limit: "50mb" }));

app.post("/api/robustness/run", heavyLimiter);
app.post("/api/backtest/run", heavyLimiter);
app.post("/api/production-readiness/run", heavyLimiter);
app.post("/api/historical/run", heavyLimiter);

app.use("/api", authenticate, router);

startPriceFeed(30);
startSupervisor(60);
startStrategyHealthMonitor(30);

runStartupRecovery()
  .then(result => {
    logger.info(
      {
        positionsRestored: result.positionsRestored,
        stateRestored: result.stateRestored,
        monitoringResumed: result.monitoringResumed,
        durationMs: result.durationMs,
      },
      "Startup recovery complete",
    );
  })
  .catch(err => logger.warn({ err }, "Startup recovery failed — monitoring will start anyway"))
  .finally(() => {
    startReconciliationScheduler().catch(err =>
      logger.warn({ err }, "Could not start reconciliation scheduler"),
    );
  });

export default app;
