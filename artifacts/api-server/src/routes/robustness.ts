import { Router } from "express";
import { db } from "../db.js";
import { robustnessResultsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import {
  runRobustnessPipeline,
  getRobustnessPipelineStatus,
  getLatestRobustnessResult,
} from "@workspace/market-analysis";
import type { RobustnessPipelineResult } from "@workspace/market-analysis";

const router = Router();

/** GET /api/robustness/status */
router.get("/api/robustness/status", (_req, res) => {
  res.json(getRobustnessPipelineStatus());
});

/** GET /api/robustness/results — list historical results */
router.get("/api/robustness/results", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(robustnessResultsTable)
      .orderBy(desc(robustnessResultsTable.runAt))
      .limit(20);
    res.json({ results: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/** GET /api/robustness/results/latest — in-memory latest result */
router.get("/api/robustness/results/latest", (_req, res) => {
  const latest = getLatestRobustnessResult();
  if (!latest) {
    return res.status(404).json({ error: "No robustness result available — run the pipeline first" });
  }
  res.json(latest);
});

/** POST /api/robustness/run — start a new robustness pipeline run */
router.post("/api/robustness/run", async (req, res) => {
  const status = getRobustnessPipelineStatus();
  if (status.status === "running") {
    return res.status(409).json({ error: "Pipeline is already running", status });
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

  // Run async — respond immediately
  res.json({ message: "Robustness pipeline started", status: getRobustnessPipelineStatus() });

  // Fire and forget — saves to DB when done
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
        console.error("[robustness] DB insert failed:", dbErr);
      }
    })
    .catch((err: unknown) => {
      console.error("[robustness] Pipeline error:", err);
    });
});

export default router;
