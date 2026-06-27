import { db } from "@workspace/db";
import { historicalCandlesTable } from "@workspace/db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { Pair, Timeframe } from "../types.js";
import type { Candle, CacheStatus, FetchResult } from "./providers/base.js";

/** Read candles from the PostgreSQL cache for a pair+timeframe+date window. */
export async function getCachedCandles(
  pair: Pair,
  tf: Timeframe,
  start: Date,
  end: Date,
): Promise<Candle[]> {
  const rows = await db
    .select()
    .from(historicalCandlesTable)
    .where(
      and(
        eq(historicalCandlesTable.pair, pair),
        eq(historicalCandlesTable.timeframe, tf),
        gte(historicalCandlesTable.time, start),
        lte(historicalCandlesTable.time, end),
      ),
    )
    .orderBy(historicalCandlesTable.time);

  return rows.map((r) => ({
    time: r.time,
    open: parseFloat(r.open),
    high: parseFloat(r.high),
    low: parseFloat(r.low),
    close: parseFloat(r.close),
    volume: parseFloat(r.volume),
  }));
}

/** Write a FetchResult's candles into the cache (upsert by pair+tf+time). */
export async function cacheCandles(result: FetchResult): Promise<number> {
  if (result.candles.length === 0) return 0;

  const values = result.candles.map((c) => ({
    pair: result.pair,
    timeframe: result.timeframe,
    time: c.time,
    open: c.open.toFixed(6),
    high: c.high.toFixed(6),
    low: c.low.toFixed(6),
    close: c.close.toFixed(6),
    volume: c.volume.toFixed(2),
    provider: result.provider,
    isReal: true,
  }));

  // Batch insert in chunks to avoid parameter limit
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < values.length; i += CHUNK) {
    const chunk = values.slice(i, i + CHUNK);
    await db
      .insert(historicalCandlesTable)
      .values(chunk)
      .onConflictDoNothing(); // keep earlier/higher-priority data
    inserted += chunk.length;
  }
  return inserted;
}

/** Get the cache coverage status for a pair+timeframe. */
export async function getCacheStatus(pair: Pair, tf: Timeframe): Promise<CacheStatus> {
  const [row] = await db
    .select({
      provider: historicalCandlesTable.provider,
      minTime: sql<Date>`MIN(${historicalCandlesTable.time})`,
      maxTime: sql<Date>`MAX(${historicalCandlesTable.time})`,
      count: sql<number>`COUNT(*)`,
      lastUpdated: sql<Date>`MAX(${historicalCandlesTable.createdAt})`,
    })
    .from(historicalCandlesTable)
    .where(
      and(
        eq(historicalCandlesTable.pair, pair),
        eq(historicalCandlesTable.timeframe, tf),
      ),
    )
    .groupBy(historicalCandlesTable.provider)
    .limit(1);

  if (!row || !row.count) {
    return {
      pair,
      timeframe: tf,
      provider: null,
      coverageStart: null,
      coverageEnd: null,
      totalBars: 0,
      lastUpdated: null,
      isComplete: false,
    };
  }

  return {
    pair,
    timeframe: tf,
    provider: row.provider,
    coverageStart: row.minTime ? new Date(row.minTime) : null,
    coverageEnd: row.maxTime ? new Date(row.maxTime) : null,
    totalBars: Number(row.count),
    lastUpdated: row.lastUpdated ? new Date(row.lastUpdated) : null,
    isComplete: true,
  };
}

/** Check if the cache already covers the requested range with sufficient density. */
export async function isCacheValid(
  pair: Pair,
  tf: Timeframe,
  start: Date,
  end: Date,
  minCoveragePct = 80,
): Promise<boolean> {
  const cached = await getCachedCandles(pair, tf, start, end);
  if (cached.length === 0) return false;
  const coveragePct = (cached.length / Math.max(1, estimateExpected(tf, start, end))) * 100;
  return coveragePct >= minCoveragePct;
}

function estimateExpected(tf: Timeframe, start: Date, end: Date): number {
  const ms: Record<Timeframe, number> = {
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
  };
  const totalMs = end.getTime() - start.getTime();
  return Math.round((totalMs / ms[tf]) * 0.714);
}
