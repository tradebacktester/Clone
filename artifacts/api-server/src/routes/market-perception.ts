import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, marketStateSnapshotsTable } from "@workspace/db";
import {
  perceiveTrend,
  perceiveRegime,
  perceiveVolatility,
  perceiveLiquidity,
  perceiveCorrelation,
  perceiveNewsContext,
  buildMarketState,
  type RawNewsEvent,
} from "@workspace/market-analysis";
import { getCachedAnalysis } from "../lib/analyzer.js";
import { getUpcomingEvents } from "../lib/news-fetcher.js";
import { logger } from "../lib/logger.js";
import type { Candle } from "@workspace/market-analysis";

const router: IRouter = Router();

type Pair = "EURUSD" | "GBPUSD" | "USDJPY";
const PAIRS: Pair[] = ["EURUSD", "GBPUSD", "USDJPY"];
const TIMEFRAME = "1h" as const;

function getCandlesForPair(pair: string): Candle[] {
  const analysis = getCachedAnalysis(pair as Pair, TIMEFRAME);
  return analysis?.candles ?? [];
}

function getAllPairCandles(): Record<string, Candle[]> {
  return Object.fromEntries(PAIRS.map(p => [p, getCandlesForPair(p)]));
}

async function getNewsAsRaw(): Promise<RawNewsEvent[]> {
  try {
    const events = await getUpcomingEvents(undefined, 24);
    return events.map(e => ({
      title: e.title,
      currency: e.currency,
      category: e.category,
      impact: e.impact,
      eventTime: e.eventTime,
      minutesUntil: e.minutesUntil,
      isBlocking: e.isBlocking,
    }));
  } catch {
    return [];
  }
}

function toSwings(candles: Candle[]) {
  const swings: { time: Date; price: number; type: "high" | "low"; index: number }[] = [];
  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i]!;
    const prev1 = candles[i - 1]!;
    const prev2 = candles[i - 2]!;
    const next1 = candles[i + 1]!;
    const next2 = candles[i + 2]!;
    if (c.high >= prev1.high && c.high >= prev2.high && c.high >= next1.high && c.high >= next2.high) {
      swings.push({ time: c.time, price: c.high, type: "high", index: i });
    }
    if (c.low <= prev1.low && c.low <= prev2.low && c.low <= next1.low && c.low <= next2.low) {
      swings.push({ time: c.time, price: c.low, type: "low", index: i });
    }
  }
  return swings;
}

async function saveSnapshot(state: ReturnType<typeof buildMarketState>) {
  try {
    await db.insert(marketStateSnapshotsTable).values({
      pair: state.pair,
      session: state.session,
      trendDirection: state.trend.direction,
      trendStrength: state.trend.strength,
      trendPersistence: state.trend.persistence,
      trendAge: state.trend.age,
      regime: state.regime.regime,
      regimeConfidence: state.regime.confidence,
      volatilityClassification: state.volatility.classification,
      volatilityPercentile: state.volatility.volatilityPercentile,
      volatilityTrend: state.volatility.volatilityTrend,
      atr: String(state.volatility.atr),
      historicalVolatility: String(state.volatility.historicalVolatility),
      realizedVolatility: String(state.volatility.realizedVolatility),
      liquidityQuality: state.liquidity.quality,
      liquidityScore: state.liquidity.score,
      relativeVolume: String(state.liquidity.relativeVolume),
      correlationRisk: state.correlation.overallCorrelationRisk,
      newsEnvironment: state.newsContext.environment,
      nextEventMinutes: state.newsContext.nextEventMinutes ?? undefined,
      overallConfidence: state.overallConfidence,
      confidenceScore: state.confidenceScore,
      summary: state.summary,
      fullState: state as unknown as Record<string, unknown>,
    });
  } catch (err) {
    logger.warn({ err }, "Failed to save market state snapshot");
  }
}

router.get("/market/state", async (req, res): Promise<void> => {
  try {
    const pair = (req.query["pair"] as string | undefined)?.toUpperCase() ?? "EURUSD";
    const save = req.query["save"] !== "false";

    const candles = getCandlesForPair(pair);
    const allCandles = getAllPairCandles();
    const newsEvents = await getNewsAsRaw();
    const swings = toSwings(candles);

    const state = buildMarketState({
      pair,
      candles,
      swings,
      allPairCandles: allCandles,
      newsEvents,
    });

    if (save) await saveSnapshot(state);

    res.json({ ok: true, data: state });
  } catch (err) {
    logger.error({ err }, "market/state error");
    res.status(500).json({ ok: false, error: "Failed to build market state" });
  }
});

router.get("/market/trend", async (req, res): Promise<void> => {
  try {
    const pair = (req.query["pair"] as string | undefined)?.toUpperCase() ?? "EURUSD";
    const candles = getCandlesForPair(pair);
    const swings = toSwings(candles);
    const trend = perceiveTrend(candles, swings);
    res.json({ ok: true, data: { pair, trend, timestamp: new Date().toISOString() } });
  } catch (err) {
    logger.error({ err }, "market/trend error");
    res.status(500).json({ ok: false, error: "Failed to analyze trend" });
  }
});

router.get("/market/regime/perception", async (req, res): Promise<void> => {
  try {
    const pair = (req.query["pair"] as string | undefined)?.toUpperCase() ?? "EURUSD";
    const candles = getCandlesForPair(pair);
    const swings = toSwings(candles);
    const regime = perceiveRegime(candles, swings);
    res.json({ ok: true, data: { pair, regime, timestamp: new Date().toISOString() } });
  } catch (err) {
    logger.error({ err }, "market/regime/perception error");
    res.status(500).json({ ok: false, error: "Failed to analyze regime" });
  }
});

router.get("/market/volatility", async (req, res): Promise<void> => {
  try {
    const pair = (req.query["pair"] as string | undefined)?.toUpperCase() ?? "EURUSD";
    const candles = getCandlesForPair(pair);
    const volatility = perceiveVolatility(candles);
    res.json({ ok: true, data: { pair, volatility, timestamp: new Date().toISOString() } });
  } catch (err) {
    logger.error({ err }, "market/volatility error");
    res.status(500).json({ ok: false, error: "Failed to analyze volatility" });
  }
});

router.get("/market/volatility/detail", async (req, res): Promise<void> => {
  try {
    const pair = (req.query["pair"] as string | undefined)?.toUpperCase() ?? "EURUSD";
    const candles = getCandlesForPair(pair);
    const volatility = perceiveVolatility(candles);
    res.json({ ok: true, data: { pair, volatility, timestamp: new Date().toISOString() } });
  } catch (err) {
    logger.error({ err }, "market/volatility/detail error");
    res.status(500).json({ ok: false, error: "Failed to analyze volatility" });
  }
});

router.get("/market/liquidity", async (req, res): Promise<void> => {
  try {
    const pair = (req.query["pair"] as string | undefined)?.toUpperCase() ?? "EURUSD";
    const candles = getCandlesForPair(pair);
    const liquidity = perceiveLiquidity(candles);
    res.json({ ok: true, data: { pair, liquidity, timestamp: new Date().toISOString() } });
  } catch (err) {
    logger.error({ err }, "market/liquidity error");
    res.status(500).json({ ok: false, error: "Failed to analyze liquidity" });
  }
});

router.get("/market/correlation", async (_req, res): Promise<void> => {
  try {
    const allCandles = getAllPairCandles();
    const correlation = perceiveCorrelation(allCandles);
    res.json({ ok: true, data: { correlation, timestamp: new Date().toISOString() } });
  } catch (err) {
    logger.error({ err }, "market/correlation error");
    res.status(500).json({ ok: false, error: "Failed to analyze correlation" });
  }
});

router.get("/market/news-context", async (_req, res): Promise<void> => {
  try {
    const newsEvents = await getNewsAsRaw();
    const context = perceiveNewsContext(newsEvents);
    res.json({ ok: true, data: { newsContext: context, timestamp: new Date().toISOString() } });
  } catch (err) {
    logger.error({ err }, "market/news-context error");
    res.status(500).json({ ok: false, error: "Failed to build news context" });
  }
});

router.get("/market/state/history", async (req, res): Promise<void> => {
  try {
    const pair = (req.query["pair"] as string | undefined)?.toUpperCase() ?? "EURUSD";
    const limit = Math.min(50, parseInt(String(req.query["limit"] ?? "20")));
    const rows = await db.select().from(marketStateSnapshotsTable)
      .where(eq(marketStateSnapshotsTable.pair, pair))
      .orderBy(desc(marketStateSnapshotsTable.createdAt))
      .limit(limit);
    res.json({ ok: true, data: rows });
  } catch (err) {
    logger.error({ err }, "market/state/history error");
    res.status(500).json({ ok: false, error: "Failed to load state history" });
  }
});

export default router;
