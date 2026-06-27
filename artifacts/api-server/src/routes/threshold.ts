import { Router, type IRouter } from "express";
import { db, thresholdRunsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { runThresholdOptimization } from "../lib/threshold-optimizer.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// POST /threshold/analyze
router.post("/threshold/analyze", async (req, res): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const windowSize = body["windowSize"] ? Number(body["windowSize"]) : 100;
    const folds = body["folds"] ? Number(body["folds"]) : 5;

    const result = await runThresholdOptimization(windowSize, folds);

    const firstKey = Object.keys(result.perThreshold)[0];
    const firstThreshold = firstKey ? result.perThreshold[firstKey] : undefined;

    const [saved] = await db.insert(thresholdRunsTable).values({
      tradesAnalyzed: result.tradesAnalyzed,
      durationMs: result.durationMs,
      windowSize,
      folds,
      currentZoneScore: String(result.perThreshold["zoneStrength"]?.current ?? 50),
      currentLiquidity: String(50),
      currentAmd: String(50),
      currentConfirmation: String(50),
      currentTqi: String(result.perThreshold["tqi"]?.current ?? 65),
      proposedZoneScore: String(result.perThreshold["zoneStrength"]?.proposed ?? 50),
      proposedLiquidity: String(50),
      proposedAmd: String(50),
      proposedConfirmation: String(50),
      proposedTqi: String(result.perThreshold["tqi"]?.proposed ?? 65),
      baselineWinRate: String(result.summary.currentWinRate),
      proposedWinRate: String(result.summary.proposedWinRate),
      baselineProfitFactor: String(result.summary.currentPF),
      proposedProfitFactor: String(result.summary.proposedPF),
      baselineExpectedValue: String(result.summary.currentEV),
      proposedExpectedValue: String(result.summary.proposedEV),
      tradeCountDelta: result.summary.totalTradeCountDelta,
      wfPassRate: String(result.wfPassRate),
      wfConsistent: result.wfConsistent,
      perThresholdAnalysis: result.perThreshold as unknown as Record<string, unknown>,
      wfFolds: result.wfFolds as unknown as Record<string, unknown>[],
    }).returning();

    res.json({
      id: saved!.id,
      runAt: saved!.runAt.toISOString(),
      ...result,
    });
  } catch (err) {
    logger.error({ err }, "POST /threshold/analyze failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /threshold/history
router.get("/threshold/history", async (req, res): Promise<void> => {
  try {
    const limit = Math.min(parseInt(String(req.query["limit"] ?? "20"), 10), 100);
    const rows = await db
      .select()
      .from(thresholdRunsTable)
      .orderBy(desc(thresholdRunsTable.runAt))
      .limit(limit);

    res.json({
      runs: rows.map((r) => ({
        id: r.id,
        runAt: r.runAt.toISOString(),
        tradesAnalyzed: r.tradesAnalyzed,
        durationMs: r.durationMs,
        baselineWinRate: r.baselineWinRate != null ? parseFloat(r.baselineWinRate) : null,
        proposedWinRate: r.proposedWinRate != null ? parseFloat(r.proposedWinRate) : null,
        baselineProfitFactor: r.baselineProfitFactor != null ? parseFloat(r.baselineProfitFactor) : null,
        proposedProfitFactor: r.proposedProfitFactor != null ? parseFloat(r.proposedProfitFactor) : null,
        wfPassRate: r.wfPassRate != null ? parseFloat(r.wfPassRate) : null,
        wfConsistent: r.wfConsistent,
        tradeCountDelta: r.tradeCountDelta,
      })),
    });
  } catch (err) {
    logger.error({ err }, "GET /threshold/history failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /threshold/latest
router.get("/threshold/latest", async (_req, res): Promise<void> => {
  try {
    const [row] = await db
      .select()
      .from(thresholdRunsTable)
      .orderBy(desc(thresholdRunsTable.runAt))
      .limit(1);

    if (!row) {
      res.json({ hasResult: false, message: "No threshold analysis run yet." });
      return;
    }

    res.json({
      hasResult: true,
      id: row.id,
      runAt: row.runAt.toISOString(),
      tradesAnalyzed: row.tradesAnalyzed,
      durationMs: row.durationMs,
      currentZoneScore: parseFloat(row.currentZoneScore),
      currentTqi: parseFloat(row.currentTqi),
      proposedZoneScore: row.proposedZoneScore != null ? parseFloat(row.proposedZoneScore) : null,
      proposedTqi: row.proposedTqi != null ? parseFloat(row.proposedTqi) : null,
      baselineWinRate: row.baselineWinRate != null ? parseFloat(row.baselineWinRate) : null,
      proposedWinRate: row.proposedWinRate != null ? parseFloat(row.proposedWinRate) : null,
      baselineProfitFactor: row.baselineProfitFactor != null ? parseFloat(row.baselineProfitFactor) : null,
      proposedProfitFactor: row.proposedProfitFactor != null ? parseFloat(row.proposedProfitFactor) : null,
      baselineExpectedValue: row.baselineExpectedValue != null ? parseFloat(row.baselineExpectedValue) : null,
      proposedExpectedValue: row.proposedExpectedValue != null ? parseFloat(row.proposedExpectedValue) : null,
      tradeCountDelta: row.tradeCountDelta,
      wfPassRate: row.wfPassRate != null ? parseFloat(row.wfPassRate) : null,
      wfConsistent: row.wfConsistent,
      perThresholdAnalysis: row.perThresholdAnalysis,
      wfFolds: row.wfFolds,
    });
  } catch (err) {
    logger.error({ err }, "GET /threshold/latest failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
