import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

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
