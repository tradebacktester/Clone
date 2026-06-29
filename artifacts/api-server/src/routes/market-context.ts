import { Router, type IRouter } from "express";
import { desc, eq, and } from "drizzle-orm";
import {
  db,
  tradesTable,
  marketStateSnapshotsTable,
  marketContextSnapshotsTable,
  marketContextProfilesTable,
} from "@workspace/db";
import {
  buildMarketContext,
  analyzePerformance,
  overallStats,
  analyzeStability,
  findHistoricalMatches,
  classifyEnvironment,
  scoreMarketContext,
} from "@workspace/market-analysis";
import type { TradeRecord, SnapshotRecord } from "@workspace/market-analysis";
import { getCachedAnalysis } from "../lib/analyzer.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

type Pair = "EURUSD" | "GBPUSD" | "USDJPY";
const PAIRS: Pair[] = ["EURUSD", "GBPUSD", "USDJPY"];
const MAX_SNAPSHOTS = 200;
const MAX_TRADES = 1000;

async function loadTrades(pair?: string): Promise<TradeRecord[]> {
  try {
    const query = db
      .select()
      .from(tradesTable)
      .where(
        and(
          eq(tradesTable.status, "closed"),
          pair ? eq(tradesTable.pair, pair) : undefined,
        ),
      )
      .orderBy(desc(tradesTable.closedAt))
      .limit(MAX_TRADES);

    const rows = await query;
    return rows.map(r => ({
      id: r.id,
      pair: r.pair,
      direction: r.direction,
      session: r.session,
      regime: r.regime ?? null,
      newsStatus: r.newsStatus ?? null,
      spreadPips: parseFloat(r.spreadPips ?? "0") || 0,
      pnl: parseFloat(r.pnl ?? "0") || 0,
      riskRewardRatio: parseFloat(r.riskRewardRatio ?? "0") || 0,
      isWin: (parseFloat(r.pnl ?? "0") || 0) > 0,
      isLoss: (parseFloat(r.pnl ?? "0") || 0) < 0,
      openedAt: r.openedAt,
      closedAt: r.closedAt ?? null,
    }));
  } catch (err) {
    logger.warn({ err }, "market-context: failed to load trades");
    return [];
  }
}

async function loadSnapshots(pair?: string): Promise<SnapshotRecord[]> {
  try {
    const rows = await db
      .select()
      .from(marketStateSnapshotsTable)
      .where(pair ? eq(marketStateSnapshotsTable.pair, pair) : undefined)
      .orderBy(desc(marketStateSnapshotsTable.createdAt))
      .limit(MAX_SNAPSHOTS);

    return rows.map(r => ({
      id: r.id,
      pair: r.pair,
      session: r.session,
      trendDirection: r.trendDirection,
      trendStrength: r.trendStrength,
      regime: r.regime,
      regimeConfidence: r.regimeConfidence,
      volatilityClassification: r.volatilityClassification,
      volatilityPercentile: r.volatilityPercentile,
      liquidityQuality: r.liquidityQuality,
      liquidityScore: r.liquidityScore,
      correlationRisk: r.correlationRisk,
      newsEnvironment: r.newsEnvironment,
      confidenceScore: r.confidenceScore,
      createdAt: r.createdAt ?? null,
    }));
  } catch (err) {
    logger.warn({ err }, "market-context: failed to load snapshots");
    return [];
  }
}

function getCurrentConditionsForPair(pair: Pair) {
  const analysis = getCachedAnalysis(pair, "1h");
  const state = analysis?.result?.regime ?? null;
  return {
    regime: state?.regime ?? "trending",
    trend: (analysis as any)?.trend ?? "neutral",
    trendStrength: 50,
    volatilityClass: state?.volatility ?? "medium",
    volatilityPercentile: parseFloat(state?.volatilityPercentile as string ?? "50") || 50,
    liquidityQuality: "fair",
    liquidityScore: 50,
    correlationRisk: "low",
    session: detectSession(new Date()),
    newsEnvironment: "safe",
  };
}

function detectSession(now: Date): string {
  const h = now.getUTCHours();
  if (h >= 7 && h < 16) return "london";
  if (h >= 13 && h < 22) return "new_york";
  if (h >= 23 || h < 8) return "tokyo";
  return "off_hours";
}

function getPairFromQuery(q: Record<string, unknown>): Pair {
  const raw = String(q["pair"] ?? "EURUSD").toUpperCase();
  return (PAIRS.includes(raw as Pair) ? raw : "EURUSD") as Pair;
}

router.get("/market/context", async (req, res) => {
  try {
    const pair = getPairFromQuery(req.query as Record<string, unknown>);
    const [trades, snapshots] = await Promise.all([loadTrades(pair), loadSnapshots(pair)]);
    const conds = getCurrentConditionsForPair(pair);

    const ctx = buildMarketContext({
      pair,
      currentRegime: conds.regime,
      currentTrendDirection: conds.trend,
      currentTrendStrength: conds.trendStrength,
      currentVolatilityClass: conds.volatilityClass,
      currentVolatilityPercentile: conds.volatilityPercentile,
      currentLiquidityQuality: conds.liquidityQuality,
      currentLiquidityScore: conds.liquidityScore,
      currentCorrelationRisk: conds.correlationRisk,
      currentSession: conds.session,
      currentNewsEnvironment: conds.newsEnvironment,
      trades,
      snapshots,
    });

    try {
      await db.insert(marketContextSnapshotsTable).values({
        pair,
        score: ctx.mcs.score,
        label: ctx.mcs.label,
        regimeScore: ctx.mcs.components.find(c => c.dimension === "regime")?.score ?? 50,
        trendScore: ctx.mcs.components.find(c => c.dimension === "trend")?.score ?? 50,
        volatilityScore: ctx.mcs.components.find(c => c.dimension === "volatility")?.score ?? 50,
        liquidityScore: ctx.mcs.components.find(c => c.dimension === "liquidity")?.score ?? 50,
        correlationScore: ctx.mcs.components.find(c => c.dimension === "correlation")?.score ?? 50,
        sessionScore: ctx.mcs.components.find(c => c.dimension === "session")?.score ?? 50,
        newsScore: ctx.mcs.components.find(c => c.dimension === "news")?.score ?? 50,
        historicalConfidenceScore: ctx.mcs.components.find(c => c.dimension === "historicalConfidence")?.score ?? 50,
        overallConfidence: ctx.mcs.confidence,
        sampleSize: ctx.mcs.sampleSize,
        stabilityScore: ctx.stability.overallStability,
        stabilityLabel: ctx.stability.label,
        regimeStability: ctx.stability.regime.score,
        trendStability: ctx.stability.trend.score,
        volatilityStability: ctx.stability.volatility.score,
        liquidityStability: ctx.stability.liquidity.score,
        fullAnalysis: ctx as unknown as Record<string, unknown>,
      });
    } catch (saveErr) {
      logger.warn({ saveErr }, "market-context: could not save snapshot");
    }

    res.json({ ok: true, data: ctx });
  } catch (err) {
    logger.error({ err }, "market-context: GET /market/context failed");
    res.status(500).json({ ok: false, error: "Failed to build market context" });
  }
});

router.get("/market/context-score", async (req, res) => {
  try {
    const pair = getPairFromQuery(req.query as Record<string, unknown>);
    const [trades, snapshots] = await Promise.all([loadTrades(pair), loadSnapshots(pair)]);
    const conds = getCurrentConditionsForPair(pair);
    const allStats = analyzePerformance(trades);
    const overall = overallStats(trades);
    const mcs = scoreMarketContext(allStats, {
      regime: conds.regime,
      trendDirection: conds.trend,
      volatilityClassification: conds.volatilityClass,
      liquidityQuality: conds.liquidityQuality,
      correlationRisk: conds.correlationRisk,
      session: conds.session,
      newsEnvironment: conds.newsEnvironment,
    }, overall.sampleSize);

    res.json({ ok: true, data: { pair, mcs } });
  } catch (err) {
    logger.error({ err }, "market-context: GET /market/context-score failed");
    res.status(500).json({ ok: false, error: "Failed to compute context score" });
  }
});

router.get("/market/context-history", async (req, res) => {
  try {
    const pair = getPairFromQuery(req.query as Record<string, unknown>);
    const limitRaw = parseInt(String(req.query["limit"] ?? "50"), 10);
    const limit = Math.min(200, Math.max(1, isNaN(limitRaw) ? 50 : limitRaw));

    const rows = await db
      .select()
      .from(marketContextSnapshotsTable)
      .where(eq(marketContextSnapshotsTable.pair, pair))
      .orderBy(desc(marketContextSnapshotsTable.createdAt))
      .limit(limit);

    const history = rows.map(r => ({
      id: r.id,
      pair: r.pair,
      score: r.score,
      label: r.label,
      regimeScore: r.regimeScore,
      sessionScore: r.sessionScore,
      stabilityScore: r.stabilityScore,
      stabilityLabel: r.stabilityLabel,
      createdAt: r.createdAt,
    }));

    res.json({ ok: true, data: { pair, history, count: history.length } });
  } catch (err) {
    logger.error({ err }, "market-context: GET /market/context-history failed");
    res.status(500).json({ ok: false, error: "Failed to load context history" });
  }
});

router.get("/market/context-analysis", async (req, res) => {
  try {
    const pair = getPairFromQuery(req.query as Record<string, unknown>);
    const [trades, snapshots] = await Promise.all([loadTrades(pair), loadSnapshots(pair)]);

    const allStats = analyzePerformance(trades);
    const overall = overallStats(trades);

    res.json({
      ok: true,
      data: {
        pair,
        performanceByDimension: allStats,
        overallPerformance: overall,
        tradeCount: trades.length,
        snapshotCount: snapshots.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    logger.error({ err }, "market-context: GET /market/context-analysis failed");
    res.status(500).json({ ok: false, error: "Failed to run context analysis" });
  }
});

router.get("/market/context-comparison", async (req, res) => {
  try {
    const pair = getPairFromQuery(req.query as Record<string, unknown>);
    const snapshots = await loadSnapshots(pair);
    const conds = getCurrentConditionsForPair(pair);

    const matches = findHistoricalMatches(
      {
        regime: conds.regime,
        trendDirection: conds.trend,
        trendStrength: conds.trendStrength,
        volatilityClassification: conds.volatilityClass,
        volatilityPercentile: conds.volatilityPercentile,
        session: conds.session,
        liquidityQuality: conds.liquidityQuality,
        newsEnvironment: conds.newsEnvironment,
      },
      snapshots,
      15,
      20,
    );

    res.json({
      ok: true,
      data: {
        pair,
        matches,
        matchCount: matches.length,
        snapshotPool: snapshots.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    logger.error({ err }, "market-context: GET /market/context-comparison failed");
    res.status(500).json({ ok: false, error: "Failed to run context comparison" });
  }
});

router.get("/market/stability", async (req, res) => {
  try {
    const pair = getPairFromQuery(req.query as Record<string, unknown>);
    const snapshots = await loadSnapshots(pair);
    const conds = getCurrentConditionsForPair(pair);

    const stability = analyzeStability(
      snapshots,
      conds.regime,
      conds.trend,
      new Date(),
    );

    res.json({ ok: true, data: { pair, stability } });
  } catch (err) {
    logger.error({ err }, "market-context: GET /market/stability failed");
    res.status(500).json({ ok: false, error: "Failed to analyze stability" });
  }
});

export default router;
