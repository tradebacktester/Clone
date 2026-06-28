// ─── Pattern Performance Routes ───────────────────────────────────────────────
// Advisory only. These routes surface learned pattern knowledge — they never
// modify trading rules, parameters, signals, or execution behavior.

import { Router } from "express";
import { db } from "@workspace/db";
import {
  patternRecordsTable,
  patternTrendSnapshotsTable,
  learningFeaturesTable,
} from "@workspace/db";
import { desc, eq, and, gte, count, sql } from "drizzle-orm";
import {
  analyzePatterns,
  filterPatterns,
  rankPatterns,
  patternStore,
  generatePatternReport,
  PATTERN_ENGINE_VERSION,
} from "@workspace/market-analysis";
import type { ExtractedFeature } from "@workspace/market-analysis";

const router = Router();

// ─── Load features from DB ────────────────────────────────────────────────────

async function loadFeaturesFromDb(cycleId?: string): Promise<ExtractedFeature[]> {
  const query = cycleId
    ? db.select().from(learningFeaturesTable).where(eq(learningFeaturesTable.cycleId, cycleId)).limit(5000)
    : db.select().from(learningFeaturesTable).orderBy(desc(learningFeaturesTable.extractedAt)).limit(5000);

  const rows = await query;

  return rows.map(r => ({
    tradeId: r.tradeId,
    pair: (r.pair as "EURUSD" | "GBPUSD" | "USDJPY"),
    session: (r.session as "london" | "new_york" | "asian" | "unknown"),
    trend: (r.trend as "bullish" | "bearish" | "ranging"),
    marketRegime: (r.marketRegime as "trending" | "ranging" | "volatile" | "low_volatility" | "unknown"),
    supplyQuality: Number(r.supplyQuality),
    demandQuality: Number(r.demandQuality),
    liquidityScore: Number(r.liquidityScore),
    amdScore: Number(r.amdScore),
    confirmationQuality: Number(r.confirmationQuality),
    tradeDurationMins: r.tradeDurationMins,
    spreadPips: Number(r.spreadPips),
    volatility: (r.volatility as "low" | "medium" | "high"),
    riskPct: 1,
    rrPlanned: Number(r.rrPlanned),
    rrActual: Number(r.rrActual),
    outcome: (r.outcome as "win" | "loss" | "break_even"),
    pnl: Number(r.pnl),
    pnlPercent: Number(r.pnlPercent),
    setupScore: Number(r.setupScore),
    confidence: Number(r.confidence),
    tqi: Number(r.tqi),
    openedAt: r.openedAt ? new Date(r.openedAt) : new Date(),
    closedAt: null,
  }));
}

// ─── Persist patterns to DB ───────────────────────────────────────────────────

async function persistPatterns(patterns: ReturnType<typeof analyzePatterns>): Promise<void> {
  if (patterns.length === 0) return;

  const rows = patterns.map(p => ({
    patternId: p.id,
    category: p.category,
    key: p.key,
    description: p.description,
    conditions: p.conditions,
    version: p.version,
    totalTrades: p.stats.totalTrades,
    wins: p.stats.wins,
    losses: p.stats.losses,
    breakEvens: p.stats.breakEvens,
    winRate: String(p.stats.winRate),
    lossRate: String(p.stats.lossRate),
    avgRR: String(p.stats.avgRR),
    avgProfit: String(p.stats.avgProfit),
    avgLoss: String(p.stats.avgLoss),
    expectancy: String(p.stats.expectancy),
    profitFactor: String(Math.min(p.stats.profitFactor, 99)),
    avgDurationMins: String(p.stats.avgDurationMins),
    maxDrawdownPct: String(p.stats.maxDrawdownPct),
    recoveryFactor: String(Math.min(p.stats.recoveryFactor, 99)),
    stdDevRR: String(p.stats.stdDevRR),
    ci95Lower: String(p.stats.confidenceInterval95.lower),
    ci95Upper: String(p.stats.confidenceInterval95.upper),
    evidenceCount: p.evidence.evidenceCount,
    statisticalConf: String(p.evidence.statisticalConfidence),
    dataQualityScore: String(p.evidence.dataQualityScore),
    isInsufficient: p.evidence.isInsufficient,
    insufficientReason: p.evidence.insufficientReason ?? null,
    trendDirection: p.trend.direction,
    trendConfidence: String(p.trend.directionConfidence),
    trendExplanation: p.trend.explanation,
    trendLast30: p.trend.last30 as Record<string, unknown> | null,
    trendLast100: p.trend.last100 as Record<string, unknown> | null,
    trendLast500: p.trend.last500 as Record<string, unknown> | null,
    statsPayload: p.stats as unknown as Record<string, unknown>,
    evidencePayload: p.evidence as unknown as Record<string, unknown>,
    lastValidationDate: new Date(),
  }));

  await db.insert(patternRecordsTable)
    .values(rows)
    .onConflictDoUpdate({
      target: patternRecordsTable.patternId,
      set: {
        totalTrades: sql`excluded.total_trades`,
        wins: sql`excluded.wins`,
        losses: sql`excluded.losses`,
        winRate: sql`excluded.win_rate`,
        lossRate: sql`excluded.loss_rate`,
        avgRR: sql`excluded.avg_rr`,
        avgProfit: sql`excluded.avg_profit`,
        avgLoss: sql`excluded.avg_loss`,
        expectancy: sql`excluded.expectancy`,
        profitFactor: sql`excluded.profit_factor`,
        avgDurationMins: sql`excluded.avg_duration_mins`,
        maxDrawdownPct: sql`excluded.max_drawdown_pct`,
        recoveryFactor: sql`excluded.recovery_factor`,
        stdDevRR: sql`excluded.std_dev_rr`,
        ci95Lower: sql`excluded.ci95_lower`,
        ci95Upper: sql`excluded.ci95_upper`,
        evidenceCount: sql`excluded.evidence_count`,
        statisticalConf: sql`excluded.statistical_confidence`,
        dataQualityScore: sql`excluded.data_quality_score`,
        isInsufficient: sql`excluded.is_insufficient`,
        insufficientReason: sql`excluded.insufficient_reason`,
        trendDirection: sql`excluded.trend_direction`,
        trendConfidence: sql`excluded.trend_confidence`,
        trendExplanation: sql`excluded.trend_explanation`,
        trendLast30: sql`excluded.trend_last30`,
        trendLast100: sql`excluded.trend_last100`,
        trendLast500: sql`excluded.trend_last500`,
        statsPayload: sql`excluded.stats_payload`,
        evidencePayload: sql`excluded.evidence_payload`,
        lastValidationDate: sql`excluded.last_validation_date`,
        updatedAt: sql`now()`,
      },
    });

  // Append trend snapshots
  const snapshots = patterns
    .filter(p => !p.evidence.isInsufficient)
    .map(p => ({
      patternId: p.id,
      snapshotDate: new Date(),
      winRate: String(p.stats.winRate),
      avgRR: String(p.stats.avgRR),
      sampleSize: p.stats.sampleSize,
      confidence: String(p.evidence.statisticalConfidence),
      version: p.version,
    }));

  if (snapshots.length > 0) {
    await db.insert(patternTrendSnapshotsTable).values(snapshots);
  }
}

// ─── POST /learning/patterns/analyze — run pattern analysis ──────────────────

router.post("/learning/patterns/analyze", async (req, res) => {
  try {
    const { cycleId, dataQuality = 80 } = req.body as { cycleId?: string; dataQuality?: number };
    const features = await loadFeaturesFromDb(cycleId);

    if (features.length === 0) {
      return res.json({
        success: false,
        message: "No feature data available. Run a learning cycle first.",
        totalPatterns: 0,
        sufficientPatterns: 0,
      });
    }

    const patterns = analyzePatterns(features, dataQuality, PATTERN_ENGINE_VERSION);
    patternStore.upsert(patterns);
    persistPatterns(patterns).catch(() => {}); // non-blocking

    res.json({
      success: true,
      totalPatterns: patterns.length,
      sufficientPatterns: patterns.filter(p => !p.evidence.isInsufficient).length,
      featureCount: features.length,
      version: PATTERN_ENGINE_VERSION,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Pattern analysis failed" });
  }
});

// ─── GET /learning/patterns — list all patterns ───────────────────────────────

router.get("/learning/patterns", async (req, res) => {
  try {
    const category = req.query.category as string | undefined;
    const sufficientOnly = req.query.sufficientOnly === "true";
    const minSampleSize = req.query.minSampleSize ? Number(req.query.minSampleSize) : undefined;
    const minConfidence = req.query.minConfidence ? Number(req.query.minConfidence) : undefined;
    const sortBy = (req.query.sortBy as "win_rate" | "confidence" | "expectancy" | "sample_size") || "win_rate";
    const limit = Math.min(Number(req.query.limit) || 100, 200);

    // Try in-process store first
    let patterns = patternStore.list();

    // Fall back to DB if store is empty
    if (patterns.length === 0) {
      const dbRows = await db.select().from(patternRecordsTable)
        .orderBy(desc(patternRecordsTable.winRate))
        .limit(limit);
      return res.json({ patterns: dbRows, source: "db", total: dbRows.length });
    }

    // Apply filters
    patterns = filterPatterns(patterns, {
      category: category as typeof patterns[0]["category"] | undefined,
      sufficientOnly,
      minSampleSize,
      minConfidence,
    });

    patterns = rankPatterns(patterns, sortBy).slice(0, limit);

    res.json({
      patterns: patterns.map(p => ({
        id: p.id,
        category: p.category,
        key: p.key,
        description: p.description,
        conditions: p.conditions,
        sampleSize: p.stats.sampleSize,
        winRate: p.stats.winRate,
        lossRate: p.stats.lossRate,
        avgRR: p.stats.avgRR,
        expectancy: p.stats.expectancy,
        profitFactor: p.stats.profitFactor,
        maxDrawdownPct: p.stats.maxDrawdownPct,
        confidence: p.evidence.statisticalConfidence,
        isInsufficient: p.evidence.isInsufficient,
        insufficientReason: p.evidence.insufficientReason,
        trendDirection: p.trend.direction,
        trendConfidence: p.trend.directionConfidence,
        lastValidationDate: p.lastValidationDate,
        version: p.version,
      })),
      source: "memory",
      total: patterns.length,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// ─── GET /learning/statistics — aggregate stats across all patterns ───────────

router.get("/learning/statistics", async (req, res) => {
  try {
    const patterns = patternStore.list();

    if (patterns.length === 0) {
      const dbCount = await db.select({ count: count() }).from(patternRecordsTable);
      return res.json({
        hasData: false,
        totalPatterns: Number(dbCount[0]?.count ?? 0),
        sufficientPatterns: 0,
        version: PATTERN_ENGINE_VERSION,
      });
    }

    const sufficient = filterPatterns(patterns, { sufficientOnly: true });
    const byCategory: Record<string, { total: number; sufficient: number; avgWinRate: number }> = {};

    for (const p of patterns) {
      if (!byCategory[p.category]) {
        byCategory[p.category] = { total: 0, sufficient: 0, avgWinRate: 0 };
      }
      byCategory[p.category].total++;
      if (!p.evidence.isInsufficient) {
        byCategory[p.category].sufficient++;
        byCategory[p.category].avgWinRate += p.stats.winRate;
      }
    }

    // Finalize averages
    for (const cat of Object.keys(byCategory)) {
      const suf = byCategory[cat].sufficient;
      if (suf > 0) {
        byCategory[cat].avgWinRate = byCategory[cat].avgWinRate / suf;
      }
    }

    const topWinRate = patternStore.topByWinRate(5);
    const bottomWinRate = patternStore.bottomByWinRate(5);
    const topConfidence = patternStore.topByConfidence(5);
    const topExpectancy = patternStore.topByExpectancy(5);

    res.json({
      hasData: true,
      version: PATTERN_ENGINE_VERSION,
      totalPatterns: patterns.length,
      sufficientPatterns: sufficient.length,
      byCategory,
      topByWinRate: topWinRate.map(p => ({ id: p.id, description: p.description, winRate: p.stats.winRate, sampleSize: p.stats.sampleSize, confidence: p.evidence.statisticalConfidence })),
      bottomByWinRate: bottomWinRate.map(p => ({ id: p.id, description: p.description, winRate: p.stats.winRate, sampleSize: p.stats.sampleSize, confidence: p.evidence.statisticalConfidence })),
      topByConfidence: topConfidence.map(p => ({ id: p.id, description: p.description, confidence: p.evidence.statisticalConfidence, winRate: p.stats.winRate, sampleSize: p.stats.sampleSize })),
      topByExpectancy: topExpectancy.map(p => ({ id: p.id, description: p.description, expectancy: p.stats.expectancy, winRate: p.stats.winRate, sampleSize: p.stats.sampleSize })),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// ─── GET /learning/trends — pattern trend snapshots from DB ──────────────────

router.get("/learning/trends", async (req, res) => {
  try {
    const patternId = req.query.patternId as string | undefined;
    const days = Math.min(Number(req.query.days) || 30, 365);
    const since = new Date(Date.now() - days * 86400000);

    const inMemoryTrends = patternStore.list().map(p => ({
      id: p.id,
      description: p.description,
      direction: p.trend.direction,
      directionConfidence: p.trend.directionConfidence,
      explanation: p.trend.explanation,
      winRate30: p.trend.last30?.winRate ?? null,
      winRate100: p.trend.last100?.winRate ?? null,
      winRate500: p.trend.last500?.winRate ?? null,
      sampleSize: p.stats.sampleSize,
      isInsufficient: p.evidence.isInsufficient,
    }));

    const query = patternId
      ? db.select().from(patternTrendSnapshotsTable)
          .where(and(
            eq(patternTrendSnapshotsTable.patternId, patternId),
            gte(patternTrendSnapshotsTable.snapshotDate, since),
          ))
          .orderBy(desc(patternTrendSnapshotsTable.snapshotDate))
          .limit(365)
      : db.select().from(patternTrendSnapshotsTable)
          .where(gte(patternTrendSnapshotsTable.snapshotDate, since))
          .orderBy(desc(patternTrendSnapshotsTable.snapshotDate))
          .limit(1000);

    const dbSnapshots = await query;

    res.json({
      trends: inMemoryTrends,
      snapshots: dbSnapshots,
      improving: inMemoryTrends.filter(t => t.direction === "improving").length,
      stable: inMemoryTrends.filter(t => t.direction === "stable").length,
      declining: inMemoryTrends.filter(t => t.direction === "declining").length,
      insufficient: inMemoryTrends.filter(t => t.direction === "insufficient_data").length,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// ─── GET /learning/evidence — evidence breakdown ──────────────────────────────

router.get("/learning/evidence", async (req, res) => {
  try {
    const patterns = patternStore.list();

    if (patterns.length === 0) {
      return res.json({
        hasData: false,
        message: "No patterns analyzed yet. Run a learning cycle then /learning/patterns/analyze.",
      });
    }

    const sampleSizeBuckets = {
      "< 5 (insufficient)": 0,
      "5–9": 0,
      "10–29": 0,
      "30–99": 0,
      "100+": 0,
    };

    const confidenceBuckets = {
      "0–20": 0,
      "20–40": 0,
      "40–60": 0,
      "60–80": 0,
      "80–100": 0,
    };

    for (const p of patterns) {
      const n = p.stats.sampleSize;
      if (n < 5) sampleSizeBuckets["< 5 (insufficient)"]++;
      else if (n < 10) sampleSizeBuckets["5–9"]++;
      else if (n < 30) sampleSizeBuckets["10–29"]++;
      else if (n < 100) sampleSizeBuckets["30–99"]++;
      else sampleSizeBuckets["100+"]++;

      const conf = p.evidence.statisticalConfidence;
      if (conf < 20) confidenceBuckets["0–20"]++;
      else if (conf < 40) confidenceBuckets["20–40"]++;
      else if (conf < 60) confidenceBuckets["40–60"]++;
      else if (conf < 80) confidenceBuckets["60–80"]++;
      else confidenceBuckets["80–100"]++;
    }

    const byCategoryEvidence = Object.fromEntries(
      ["pair", "session", "regime", "zone_quality", "liquidity", "amd", "confirmation", "volatility", "risk_profile", "pair_session", "pair_regime", "session_regime"]
        .map(cat => {
          const catPatterns = patterns.filter(p => p.category === cat);
          return [cat, {
            total: catPatterns.length,
            sufficient: catPatterns.filter(p => !p.evidence.isInsufficient).length,
            avgSampleSize: catPatterns.length > 0
              ? Math.round(catPatterns.reduce((s, p) => s + p.stats.sampleSize, 0) / catPatterns.length)
              : 0,
            avgConfidence: catPatterns.filter(p => !p.evidence.isInsufficient).length > 0
              ? Math.round(catPatterns.filter(p => !p.evidence.isInsufficient).reduce((s, p) => s + p.evidence.statisticalConfidence, 0) / catPatterns.filter(p => !p.evidence.isInsufficient).length * 10) / 10
              : 0,
          }];
        }),
    );

    res.json({
      hasData: true,
      totalPatterns: patterns.length,
      sufficientPatterns: patterns.filter(p => !p.evidence.isInsufficient).length,
      insufficientPatterns: patterns.filter(p => p.evidence.isInsufficient).length,
      sampleSizeBuckets,
      confidenceBuckets,
      byCategoryEvidence,
      dataQualityNote: "Sample size is always displayed alongside every statistical conclusion.",
      version: PATTERN_ENGINE_VERSION,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// ─── GET /learning/patterns/report — full markdown report ────────────────────

router.get("/learning/patterns/report", async (req, res) => {
  try {
    const patterns = patternStore.list();
    if (patterns.length === 0) {
      return res.json({ report: null, message: "No patterns analyzed yet." });
    }
    const report = generatePatternReport(patterns, PATTERN_ENGINE_VERSION);
    const format = req.query.format;
    if (format === "markdown") {
      res.setHeader("Content-Type", "text/markdown");
      return res.send(report.markdownContent);
    }
    res.json({ report });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// ─── GET /learning/patterns/status — quick status ────────────────────────────

router.get("/learning/patterns/status", async (req, res) => {
  try {
    const dbCount = await db.select({ count: count() }).from(patternRecordsTable);
    res.json({
      version: PATTERN_ENGINE_VERSION,
      isAdvisoryOnly: true,
      inMemoryPatterns: patternStore.count(),
      dbPatterns: Number(dbCount[0]?.count ?? 0),
      sufficientInMemory: patternStore.sufficientCount(),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// ─── GET /learning/patterns/:id — single pattern detail ──────────────────────
// NOTE: Must be registered AFTER all fixed /learning/patterns/* routes to avoid
//       "status" and "report" being captured as :id values.

router.get("/learning/patterns/:id", async (req, res) => {
  try {
    const patternId = decodeURIComponent(req.params.id);

    const inProcess = patternStore.getById(patternId);
    if (inProcess) return res.json({ pattern: inProcess, source: "memory" });

    const rows = await db.select().from(patternRecordsTable)
      .where(eq(patternRecordsTable.patternId, patternId))
      .limit(1);
    if (rows.length === 0) return res.status(404).json({ error: "Pattern not found" });
    res.json({ pattern: rows[0], source: "db" });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
