import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { startAnalysisScheduler } from "./lib/analyzer.js";
import { startPriceFeed } from "./lib/price-feed.js";
import { startPaperMonitor } from "./lib/paper-engine.js";
import { startSupervisor } from "./lib/supervisor-engine.js";
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
startAnalysisScheduler(10);
startSupervisor(60);

db.select()
  .from(botStateTable)
  .limit(1)
  .then(([state]) => {
    if (state?.running && state.mode === "paper") {
      logger.info("Resuming paper trade monitor (bot was running in paper mode)");
      startPaperMonitor(30);
    }
  })
  .catch(err => logger.warn({ err }, "Could not check bot state on startup"));

export default app;
