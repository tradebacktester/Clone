import {
  runFullAnalysis,
  type AnalysisResult,
  type Pair,
  type Timeframe,
  setNewsBlockedPairs,
} from "@workspace/market-analysis";
import {
  db,
  marketZonesTable,
  marketRegimeTable,
  tradeSignalsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";
import { getBlockedPairsSet } from "./news-fetcher.js";

const PAIRS: Pair[] = ["EURUSD", "GBPUSD", "USDJPY"];
const TIMEFRAMES: Timeframe[] = ["4h", "1d"];

const cache = new Map<string, { result: AnalysisResult; ts: number }>();

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export async function analyzeAll(): Promise<void> {
  logger.info("Starting market analysis for all pairs");

  // Refresh news state before analysis so Gate 3 is up-to-date
  try {
    const blocked = await getBlockedPairsSet();
    setNewsBlockedPairs(blocked);
    if (blocked.size > 0) {
      logger.info({ blocked: [...blocked] }, "News filter blocking pairs");
    }
  } catch (err) {
    logger.warn({ err }, "Failed to refresh news state — analysis proceeds unblocked");
    setNewsBlockedPairs(new Set());
  }

  for (const pair of PAIRS) {
    for (const tf of TIMEFRAMES) {
      try {
        const result = await runFullAnalysis(pair, tf);
        const key = `${pair}_${tf}`;
        cache.set(key, { result, ts: Date.now() });

        if (tf === "4h") {
          await persistAnalysis(result);
        }

        logger.info(
          { pair, tf, zones: result.zones.length, signals: result.signals.length },
          "Analysis complete",
        );
      } catch (err) {
        logger.error({ pair, tf, err }, "Analysis failed");
      }
    }
  }
}

async function persistAnalysis(result: AnalysisResult): Promise<void> {
  const { pair, zones, signals, regime } = result;

  await db.delete(marketZonesTable).where(eq(marketZonesTable.pair, pair));

  if (zones.length > 0) {
    await db.insert(marketZonesTable).values(
      zones.map(z => ({
        pair: z.pair,
        timeframe: z.timeframe,
        zoneType: z.zoneType,
        priceTop: String(z.priceTop),
        priceBottom: String(z.priceBottom),
        strength: String(z.strength),
        tested: z.tested,
        active: z.active,
        fibLevel: z.fibLevel != null ? String(z.fibLevel) : null,
      })),
    );
  }

  await db
    .insert(marketRegimeTable)
    .values({
      pair,
      regime: regime.regime,
      trend: regime.trend,
      volatility: regime.volatility,
      atr: String(regime.atr),
    })
    .onConflictDoUpdate({
      target: marketRegimeTable.pair,
      set: {
        regime: regime.regime,
        trend: regime.trend,
        volatility: regime.volatility,
        atr: String(regime.atr),
      },
    });

  if (signals.length > 0) {
    await db
      .update(tradeSignalsTable)
      .set({ active: false })
      .where(eq(tradeSignalsTable.pair, pair));

    await db.insert(tradeSignalsTable).values(
      signals.map(s => ({
        pair: s.pair,
        direction: s.direction,
        confidence: String(s.confidence),
        zoneType: s.zoneType,
        zoneStrength: String(s.zoneStrength),
        amdPhase: s.amdPhase,
        fibLevel: String(s.fibLevel),
        session: s.session,
        active: true,
      })),
    );
  }
}

export function getCachedAnalysis(pair: Pair, timeframe: Timeframe): AnalysisResult | null {
  const key = `${pair}_${timeframe}`;
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > 30 * 60 * 1000) return null;
  return entry.result;
}

export function startAnalysisScheduler(intervalMinutes = 10): void {
  if (intervalHandle) return;

  analyzeAll().catch(err => logger.error({ err }, "Initial analysis failed"));

  intervalHandle = setInterval(
    () => {
      analyzeAll().catch(err => logger.error({ err }, "Scheduled analysis failed"));
    },
    intervalMinutes * 60 * 1000,
  );

  logger.info({ intervalMinutes }, "Analysis scheduler started");
}

export function stopAnalysisScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info("Analysis scheduler stopped");
  }
}
