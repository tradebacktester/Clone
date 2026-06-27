import { Router } from "express";
import {
  startPipeline,
  getPipelineStatus,
  getLatestResult,
  loadLatestResultFromDisk,
} from "@workspace/market-analysis";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { logger } from "../lib/logger.js";

const router = Router();

const REPORT_MD = join(process.cwd(), "PRODUCTION_READINESS_REPORT.md");

router.post("/production-readiness/run", async (_req, res): Promise<void> => {
  try {
    await startPipeline();
    res.status(202).json({ message: "Production readiness pipeline started", status: "running" });
  } catch (err) {
    if (err instanceof Error && err.message.includes("already running")) {
      res.status(409).json({ error: "Pipeline is already running" });
      return;
    }
    logger.error({ err }, "production-readiness run error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/production-readiness/status", (_req, res): void => {
  res.json(getPipelineStatus());
});

router.get("/production-readiness/latest", async (_req, res): Promise<void> => {
  let result = getLatestResult();
  if (!result) {
    result = await loadLatestResultFromDisk();
  }
  if (!result) {
    res.status(404).json({ error: "No pipeline results available. Run the pipeline first." });
    return;
  }
  res.json(result);
});

router.get("/production-readiness/report", async (_req, res): Promise<void> => {
  if (!existsSync(REPORT_MD)) {
    res.status(404).json({ error: "No report available. Run the pipeline first." });
    return;
  }
  try {
    const content = await readFile(REPORT_MD, "utf-8");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(content);
  } catch (err) {
    logger.error({ err }, "production-readiness report read error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
