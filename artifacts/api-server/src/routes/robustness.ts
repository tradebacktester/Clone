import { Router } from "express";
import { db, robustnessResultsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import {
  runRobustnessPipeline,
  getRobustnessPipelineStatus,
  getLatestRobustnessResult,
  generateRobustnessReportMarkdown,
} from "@workspace/market-analysis";
import type { RobustnessPipelineResult } from "@workspace/market-analysis";
import { writeFile } from "fs/promises";
import { resolve } from "path";
import { logger } from "../lib/logger.js";

const router = Router();

router.get("/robustness/status", (_req, res) => {
  res.json(getRobustnessPipelineStatus());
});

router.get("/robustness/results", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(robustnessResultsTable)
      .orderBy(desc(robustnessResultsTable.runAt))
      .limit(20);
    res.json({ results: rows, total: rows.length });
  } catch (err) {
    logger.error({ err }, "robustness results error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/robustness/results/latest", (_req, res) => {
  const latest = getLatestRobustnessResult();
  if (!latest) {
    res.status(404).json({ error: "No robustness result available — run the pipeline first" });
    return;
  }
  res.json(latest);
});

router.post("/robustness/run", async (req, res) => {
  const status = getRobustnessPipelineStatus();
  if (status.status === "running") {
    res.status(409).json({ error: "Pipeline is already running", status });
    return;
  }

  const {
    pair = "ALL",
    numSimTrades = 400,
    baseWinRate,
    baseRR,
    riskPerTrade,
    skipWalkForward = false,
  } = req.body as {
    pair?: string;
    numSimTrades?: number;
    baseWinRate?: number;
    baseRR?: number;
    riskPerTrade?: number;
    skipWalkForward?: boolean;
  };

  res.json({ message: "Robustness pipeline started", status: getRobustnessPipelineStatus() });

  runRobustnessPipeline({ pair, numSimTrades, baseWinRate, baseRR, riskPerTrade, skipWalkForward })
    .then(async (result: RobustnessPipelineResult) => {
      try {
        await db.insert(robustnessResultsTable).values({
          pair,
          status: "complete",
          overallScore: String(result.score.overall),
          stabilityScore: String(result.score.breakdown.stability),
          generalizationScore: String(result.score.breakdown.generalization),
          riskResilienceScore: String(result.score.breakdown.riskResilience),
          executionResilienceScore: String(result.score.breakdown.executionResilience),
          dataQualityScore: String(result.score.breakdown.dataQuality),
          parameterSensitivity: result.sensitivity as any,
          marketStressResults: result.marketStress as any,
          executionStressResults: result.executionStress as any,
          riskStressResults: result.riskStress as any,
          walkForwardSummary: result.walkForward as any,
          oosSummary: result.oos as any,
          confidenceStability: result.confidenceStability as any,
          findings: result.findings as any,
          recommendations: result.recommendations as any,
          durationMs: result.durationMs,
        });
      } catch (dbErr) {
        logger.error({ err: dbErr }, "robustness DB insert failed");
      }
    })
    .catch((err: unknown) => {
      logger.error({ err }, "robustness pipeline error");
    });
});

router.post("/robustness/report", async (_req, res) => {
  const latest = getLatestRobustnessResult();
  if (!latest) {
    res.status(404).json({ error: "No robustness result available — run the pipeline first" });
    return;
  }

  try {
    const content = generateRobustnessReportMarkdown(latest);
    const reportPath = resolve(process.cwd(), "ROBUSTNESS_REPORT.md");
    await writeFile(reportPath, content, "utf-8");

    res.json({
      path: reportPath,
      content,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "robustness report generation error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
