// ─── Learning Engine Routes ──────────────────────────────────────────────────
// Advisory only — read and trigger the learning pipeline.
// No routes here modify trading behavior or execute trades.

import { Router } from "express";
import { db } from "@workspace/db";
import {
  learningCyclesTable,
  learningFeaturesTable,
  tradeMemoryTable,
  skippedSetupMemoryTable,
  tradeReviewsTable,
} from "@workspace/db";
import { desc, eq, sql, and, gte, lte, count } from "drizzle-orm";
import {
  runLearningPipeline,
  historyStore,
  formatCycleSummary,
  compareCycles,
  buildFeatureSummary,
  LEARNING_ENGINE_VERSION,
} from "@workspace/market-analysis";
import type {
  RawTradeRecord,
  RawSkippedSetup,
  RawManualReview,
} from "@workspace/market-analysis";

const router = Router();

// ─── Helper: Load inputs from DB ─────────────────────────────────────────────

async function loadTradeRecords(
  fromDate?: Date,
  toDate?: Date,
): Promise<RawTradeRecord[]> {
  const conditions = [sql`${tradeMemoryTable.outcome} IS NOT NULL`];
  if (fromDate) conditions.push(gte(tradeMemoryTable.openedAt, fromDate));
  if (toDate) conditions.push(lte(tradeMemoryTable.openedAt, toDate));

  const rows = await db
    .select()
    .from(tradeMemoryTable)
    .where(and(...conditions))
    .orderBy(desc(tradeMemoryTable.openedAt))
    .limit(5000);

  return rows.map(r => ({
    id: r.id,
    pair: r.pair,
    direction: r.direction,
    session: r.session,
    regime: r.regime,
    regimeConfidence: r.regimeConfidence ? Number(r.regimeConfidence) : null,
    zoneScore: r.zoneScore ? Number(r.zoneScore) : null,
    liquidityScore: r.liquidityScore ? Number(r.liquidityScore) : null,
    amdScore: r.amdScore ? Number(r.amdScore) : null,
    confirmationScore: r.confirmationScore ? Number(r.confirmationScore) : null,
    finalScore: r.finalScore ? Number(r.finalScore) : null,
    confidence: r.confidence ? Number(r.confidence) : null,
    zoneType: r.zoneType,
    amdPattern: r.amdPattern,
    riskRewardPlanned: r.riskRewardPlanned ? Number(r.riskRewardPlanned) : null,
    riskRewardActual: r.riskRewardActual ? Number(r.riskRewardActual) : null,
    slippagePips: r.slippagePips ? Number(r.slippagePips) : null,
    outcome: r.outcome,
    pnl: r.pnl ? Number(r.pnl) : null,
    pnlPercent: r.pnlPercent ? Number(r.pnlPercent) : null,
    timeInTradeMins: r.timeInTradeMins,
    openedAt: r.openedAt,
    closedAt: r.closedAt,
  }));
}

async function loadSkippedSetups(fromDate?: Date): Promise<RawSkippedSetup[]> {
  try {
    const conditions = [];
    if (fromDate) conditions.push(gte(skippedSetupMemoryTable.createdAt, fromDate));
    const rows = await db
      .select()
      .from(skippedSetupMemoryTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .limit(2000);
    return rows.map(r => ({
      id: r.id,
      pair: r.pair,
      session: r.session,
      regime: r.regime,
      zoneScore: r.zoneScore ? Number(r.zoneScore) : null,
      liquidityScore: r.liquidityScore ? Number(r.liquidityScore) : null,
      amdScore: r.amdScore ? Number(r.amdScore) : null,
      confirmationScore: r.confirmationScore ? Number(r.confirmationScore) : null,
      rejectingRule: r.rejectingRule,
      rejectionReason: null,
      createdAt: r.createdAt,
    }));
  } catch {
    return [];
  }
}

async function loadManualReviews(): Promise<RawManualReview[]> {
  try {
    const rows = await db.select().from(tradeReviewsTable).limit(1000);
    return rows.map(r => ({
      id: r.id,
      tradeId: r.tradeId,
      rating: r.rating,
      notes: r.notes,
      followedRules: r.followedRules,
      reviewedAt: r.reviewedAt,
    }));
  } catch {
    return [];
  }
}

// ─── Helper: Persist cycle to DB ─────────────────────────────────────────────

async function persistCycle(cycle: Awaited<ReturnType<typeof runLearningPipeline>>["cycle"]): Promise<void> {
  try {
    const m = cycle.metrics;
    const c = cycle.confidence;
    const v = cycle.validation;
    const summary = cycle.features.length > 0 ? buildFeatureSummary(cycle.features) : null;

    await db.insert(learningCyclesTable).values({
      cycleId: cycle.id,
      version: cycle.version,
      cycleNumber: cycle.cycleNumber,
      status: cycle.status,
      triggeredBy: cycle.triggeredBy,
      dataRangeFrom: cycle.dataRangeFrom,
      dataRangeTo: cycle.dataRangeTo,
      sampleSize: cycle.sampleSize,
      validationStatus: cycle.validationStatus,
      completenessScore: v.completenessScore.toString(),
      rejectedRecords: v.rejectedRecords,
      totalTrades: m?.totalTrades ?? null,
      wins: m?.wins ?? null,
      losses: m?.losses ?? null,
      winRate: m?.winRate?.toString() ?? null,
      avgRR: m?.avgRR?.toString() ?? null,
      profitFactor: m?.profitFactor === Infinity ? "9999" : (m?.profitFactor?.toString() ?? null),
      expectancy: m?.expectancy?.toString() ?? null,
      sharpeRatio: m?.sharpeRatio?.toString() ?? null,
      sortinoRatio: m?.sortinoRatio === Infinity ? "9999" : (m?.sortinoRatio?.toString() ?? null),
      maxDrawdownPct: m?.maxDrawdownPct?.toString() ?? null,
      totalPnl: m?.totalPnl?.toString() ?? null,
      overallConfidence: c?.overallConfidence?.toString() ?? null,
      overallTier: c?.overallTier ?? null,
      minSampleReached: c?.minSampleReached ?? false,
      validationPayload: v as unknown as Record<string, unknown>,
      metricsPayload: m as unknown as Record<string, unknown> ?? null,
      confidencePayload: c as unknown as Record<string, unknown> ?? null,
      statisticsPayload: cycle.statisticalAnalysis as unknown as Record<string, unknown> ?? null,
      featureSummary: summary as unknown as Record<string, unknown> ?? null,
      recommendations: cycle.recommendations as unknown[],
      durationMs: cycle.durationMs,
      errorMessage: cycle.errorMessage,
      completedAt: cycle.completedAt,
    }).onConflictDoNothing();

    // Persist features
    if (cycle.features.length > 0) {
      const featureRows = cycle.features.map(f => ({
        cycleId: cycle.id,
        tradeId: f.tradeId,
        pair: f.pair,
        session: f.session,
        trend: f.trend,
        marketRegime: f.marketRegime,
        supplyQuality: f.supplyQuality.toString(),
        demandQuality: f.demandQuality.toString(),
        liquidityScore: f.liquidityScore.toString(),
        amdScore: f.amdScore.toString(),
        confirmationQuality: f.confirmationQuality.toString(),
        tradeDurationMins: f.tradeDurationMins,
        spreadPips: f.spreadPips.toString(),
        volatility: f.volatility,
        rrPlanned: f.rrPlanned.toString(),
        rrActual: f.rrActual.toString(),
        outcome: f.outcome,
        pnl: f.pnl.toString(),
        pnlPercent: f.pnlPercent.toString(),
        setupScore: f.setupScore.toString(),
        confidence: f.confidence.toString(),
        tqi: f.tqi.toString(),
        openedAt: f.openedAt,
      }));
      // Insert in batches of 100
      for (let i = 0; i < featureRows.length; i += 100) {
        await db.insert(learningFeaturesTable).values(featureRows.slice(i, i + 100)).onConflictDoNothing();
      }
    }
  } catch {
    // Persist is best-effort; cycle already in in-process store
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// POST /api/learning-engine/run — trigger a learning cycle
router.post("/learning-engine/run", async (req, res) => {
  try {
    const body = req.body as {
      triggeredBy?: string;
      dataRangeFrom?: string;
      dataRangeTo?: string;
    };

    const triggeredBy = body.triggeredBy === "scheduled" ? "scheduled" : "manual";
    const fromDate = body.dataRangeFrom ? new Date(body.dataRangeFrom) : undefined;
    const toDate = body.dataRangeTo ? new Date(body.dataRangeTo) : undefined;

    const [trades, skipped, reviews] = await Promise.all([
      loadTradeRecords(fromDate, toDate),
      loadSkippedSetups(fromDate),
      loadManualReviews(),
    ]);

    const result = await runLearningPipeline({
      trades,
      skippedSetups: skipped,
      manualReviews: reviews,
      triggeredBy,
      dataRangeFrom: fromDate,
      dataRangeTo: toDate,
    });

    // Persist in background
    persistCycle(result.cycle);

    res.json({
      success: result.cycle.status === "complete",
      cycleId: result.cycle.id,
      cycleNumber: result.cycle.cycleNumber,
      status: result.cycle.status,
      validationStatus: result.cycle.validationStatus,
      sampleSize: result.cycle.sampleSize,
      durationMs: result.durationMs,
      stagesCompleted: result.stagesCompleted,
      stagesFailed: result.stagesFailed,
      overallConfidence: result.cycle.confidence?.overallConfidence ?? null,
      totalTrades: result.cycle.metrics?.totalTrades ?? null,
      winRate: result.cycle.metrics?.winRate ?? null,
      errorMessage: result.cycle.errorMessage,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Pipeline failed" });
  }
});

// GET /api/learning-engine/latest — get latest cycle summary
router.get("/learning-engine/latest", async (req, res) => {
  try {
    // Try in-process store first
    const cycle = historyStore.getLatest();
    if (cycle) {
      return res.json({
        cycle,
        summary: formatCycleSummary(cycle),
      });
    }
    // Fall back to DB
    const rows = await db
      .select()
      .from(learningCyclesTable)
      .where(eq(learningCyclesTable.status, "complete"))
      .orderBy(desc(learningCyclesTable.startedAt))
      .limit(1);
    if (rows.length === 0) return res.json({ cycle: null, summary: null });
    const row = rows[0];
    res.json({
      cycle: row,
      summary: null,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/learning-engine/history — list cycle history
router.get("/learning-engine/history", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    // In-process list first
    const inProcess = historyStore.list(limit);

    // Also load from DB for persistence across restarts
    const dbRows = await db
      .select({
        id: learningCyclesTable.id,
        cycleId: learningCyclesTable.cycleId,
        version: learningCyclesTable.version,
        cycleNumber: learningCyclesTable.cycleNumber,
        status: learningCyclesTable.status,
        triggeredBy: learningCyclesTable.triggeredBy,
        startedAt: learningCyclesTable.startedAt,
        completedAt: learningCyclesTable.completedAt,
        durationMs: learningCyclesTable.durationMs,
        sampleSize: learningCyclesTable.sampleSize,
        validationStatus: learningCyclesTable.validationStatus,
        overallConfidence: learningCyclesTable.overallConfidence,
        totalTrades: learningCyclesTable.totalTrades,
        winRate: learningCyclesTable.winRate,
        errorMessage: learningCyclesTable.errorMessage,
      })
      .from(learningCyclesTable)
      .orderBy(desc(learningCyclesTable.startedAt))
      .limit(limit);

    res.json({ history: dbRows, inProcessCount: inProcess.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/learning-engine/cycle/:cycleId — get full cycle detail
router.get("/learning-engine/cycle/:cycleId", async (req, res) => {
  try {
    const { cycleId } = req.params;

    // Check in-process store first
    const inProcess = historyStore.getById(cycleId);
    if (inProcess) {
      return res.json({
        cycle: inProcess,
        summary: formatCycleSummary(inProcess),
      });
    }

    // Fall back to DB
    const rows = await db
      .select()
      .from(learningCyclesTable)
      .where(eq(learningCyclesTable.cycleId, cycleId))
      .limit(1);
    if (rows.length === 0) return res.status(404).json({ error: "Cycle not found" });
    res.json({ cycle: rows[0], summary: null });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/learning-engine/compare — compare last two cycles
router.get("/learning-engine/compare", async (req, res) => {
  try {
    const all = historyStore.list(2);
    if (all.length === 0) return res.json({ comparison: [], hasPrevious: false });

    const current = historyStore.getById(all[0].id);
    const previous = all.length > 1 ? historyStore.getById(all[1].id) : null;

    if (!current) return res.json({ comparison: [], hasPrevious: false });
    const comparison = compareCycles(current, previous);
    res.json({ comparison, hasPrevious: !!previous });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/learning-engine/metrics/trend — win rate + confidence over last N cycles
router.get("/learning-engine/metrics/trend", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const rows = await db
      .select({
        cycleNumber: learningCyclesTable.cycleNumber,
        winRate: learningCyclesTable.winRate,
        overallConfidence: learningCyclesTable.overallConfidence,
        profitFactor: learningCyclesTable.profitFactor,
        sharpeRatio: learningCyclesTable.sharpeRatio,
        sampleSize: learningCyclesTable.sampleSize,
        startedAt: learningCyclesTable.startedAt,
      })
      .from(learningCyclesTable)
      .where(eq(learningCyclesTable.status, "complete"))
      .orderBy(desc(learningCyclesTable.startedAt))
      .limit(limit);

    res.json({
      trend: rows.reverse().map(r => ({
        cycleNumber: r.cycleNumber,
        winRate: r.winRate ? Number(r.winRate) : null,
        confidence: r.overallConfidence ? Number(r.overallConfidence) : null,
        profitFactor: r.profitFactor ? Number(r.profitFactor) : null,
        sharpeRatio: r.sharpeRatio ? Number(r.sharpeRatio) : null,
        sampleSize: r.sampleSize,
        date: r.startedAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/learning-engine/features/summary — feature summary for latest cycle
router.get("/learning-engine/features/summary", async (req, res) => {
  try {
    const cycle = historyStore.getLatest();
    if (!cycle || cycle.features.length === 0) {
      const row = await db
        .select({ featureSummary: learningCyclesTable.featureSummary })
        .from(learningCyclesTable)
        .where(eq(learningCyclesTable.status, "complete"))
        .orderBy(desc(learningCyclesTable.startedAt))
        .limit(1);
      if (row.length === 0 || !row[0].featureSummary) return res.json({ summary: null });
      return res.json({ summary: row[0].featureSummary });
    }
    const summary = buildFeatureSummary(cycle.features);
    res.json({ summary });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/learning-engine/recommendations — get latest recommendations
router.get("/learning-engine/recommendations", async (req, res) => {
  try {
    const cycle = historyStore.getLatest();
    if (cycle) return res.json({ recommendations: cycle.recommendations, cycleId: cycle.id, isAdvisoryOnly: true });

    const rows = await db
      .select({ recommendations: learningCyclesTable.recommendations, cycleId: learningCyclesTable.cycleId })
      .from(learningCyclesTable)
      .where(eq(learningCyclesTable.status, "complete"))
      .orderBy(desc(learningCyclesTable.startedAt))
      .limit(1);
    if (rows.length === 0 || !rows[0].recommendations) return res.json({ recommendations: [], cycleId: null, isAdvisoryOnly: true });
    res.json({ recommendations: rows[0].recommendations, cycleId: rows[0].cycleId, isAdvisoryOnly: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/learning-engine/statistics — skipped setup + review stats
router.get("/learning-engine/statistics", async (req, res) => {
  try {
    const cycle = historyStore.getLatest();
    if (cycle?.statisticalAnalysis) {
      return res.json({ statistics: cycle.statisticalAnalysis, cycleId: cycle.id });
    }
    const rows = await db
      .select({ statisticsPayload: learningCyclesTable.statisticsPayload, cycleId: learningCyclesTable.cycleId })
      .from(learningCyclesTable)
      .where(eq(learningCyclesTable.status, "complete"))
      .orderBy(desc(learningCyclesTable.startedAt))
      .limit(1);
    if (rows.length === 0 || !rows[0].statisticsPayload) return res.json({ statistics: null, cycleId: null });
    res.json({ statistics: rows[0].statisticsPayload, cycleId: rows[0].cycleId });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/learning-engine/dashboard — all-in-one dashboard data
router.get("/learning-engine/dashboard", async (req, res) => {
  try {
    const cycle = historyStore.getLatest();

    // DB aggregates for history count
    const countResult = await db
      .select({ count: count() })
      .from(learningCyclesTable)
      .where(eq(learningCyclesTable.status, "complete"));
    const totalCycles = Number(countResult[0]?.count ?? 0);

    // Trend (last 10)
    const trendRows = await db
      .select({
        cycleNumber: learningCyclesTable.cycleNumber,
        winRate: learningCyclesTable.winRate,
        overallConfidence: learningCyclesTable.overallConfidence,
        sampleSize: learningCyclesTable.sampleSize,
        startedAt: learningCyclesTable.startedAt,
      })
      .from(learningCyclesTable)
      .where(eq(learningCyclesTable.status, "complete"))
      .orderBy(desc(learningCyclesTable.startedAt))
      .limit(10);

    res.json({
      hasData: !!cycle,
      engineVersion: LEARNING_ENGINE_VERSION,
      totalCycles,
      inProcessCycles: historyStore.count(),
      latest: cycle
        ? {
            cycleId: cycle.id,
            cycleNumber: cycle.cycleNumber,
            status: cycle.status,
            validationStatus: cycle.validationStatus,
            sampleSize: cycle.sampleSize,
            completedAt: cycle.completedAt,
            durationMs: cycle.durationMs,
            metrics: cycle.metrics,
            confidence: cycle.confidence,
            recommendations: cycle.recommendations,
            summary: formatCycleSummary(cycle),
          }
        : null,
      trend: trendRows.reverse().map(r => ({
        cycleNumber: r.cycleNumber,
        winRate: r.winRate ? Number(r.winRate) : null,
        confidence: r.overallConfidence ? Number(r.overallConfidence) : null,
        sampleSize: r.sampleSize,
        date: r.startedAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// GET /api/learning-engine/status — quick status check
router.get("/learning-engine/status", async (req, res) => {
  try {
    const cycle = historyStore.getLatest();
    const rows = await db
      .select({ count: count() })
      .from(learningCyclesTable)
      .where(eq(learningCyclesTable.status, "complete"));
    res.json({
      engineVersion: LEARNING_ENGINE_VERSION,
      isAdvisoryOnly: true,
      hasRun: !!cycle,
      inProcessCycles: historyStore.count(),
      dbCycles: Number(rows[0]?.count ?? 0),
      latestCycleId: cycle?.id ?? null,
      latestStatus: cycle?.status ?? null,
      latestConfidence: cycle?.confidence?.overallConfidence ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
