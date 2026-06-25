import {
  runFullAnalysis,
  type AnalysisResult,
  type Pair,
  type Timeframe,
  setNewsBlockedPairs,
  calcRegimePerformance,
  adaptRegimeWeights,
  bestPerformingRegime,
  DEFAULT_REGIME_WEIGHTS,
  type RegimeTradeRecord,
  type RegimeWeightProfile,
} from "@workspace/market-analysis";
import {
  db,
  marketZonesTable,
  marketRegimeTable,
  tradeSignalsTable,
  tradesTable,
  regimePerformanceTable,
  regimeWeightsTable,
} from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { logger } from "./logger.js";
import { getBlockedPairsSet } from "./news-fetcher.js";
import { executePaperSignals } from "./paper-engine.js";

const PAIRS: Pair[] = ["EURUSD", "GBPUSD", "USDJPY"];
const TIMEFRAMES: Timeframe[] = ["4h", "1d"];

const cache = new Map<string, { result: AnalysisResult; ts: number }>();

let intervalHandle: ReturnType<typeof setInterval> | null = null;

async function loadRegimeWeights(): Promise<Map<string, RegimeWeightProfile>> {
  const rows = await db
    .select()
    .from(regimeWeightsTable)
    .where(isNull(regimeWeightsTable.pair));

  const map = new Map<string, RegimeWeightProfile>();
  for (const row of rows) {
    const regime = row.regime as RegimeWeightProfile["regime"];
    map.set(regime, {
      regime,
      zone: parseFloat(row.zoneWeight),
      liquidity: parseFloat(row.liquidityWeight),
      amd: parseFloat(row.amdWeight),
      confirmation: parseFloat(row.confirmationWeight),
      sampleSize: row.sampleSize,
      lastUpdated: row.updatedAt,
    });
  }
  return map;
}

async function updateRegimeAnalytics(): Promise<void> {
  try {
    const trades = await db
      .select()
      .from(tradesTable)
      .where(eq(tradesTable.status, "closed"));

    if (trades.length === 0) return;

    const records: RegimeTradeRecord[] = trades
      .filter(t => t.regime != null)
      .map(t => ({
        regime: (t.regime ?? "ranging") as RegimeTradeRecord["regime"],
        pnl: parseFloat(t.pnl ?? "0"),
        setupScore: parseFloat(t.setupScore ?? "0"),
        zoneType: (t.zoneType ?? "demand") as "demand" | "supply",
        liquiditySweep: t.liquiditySweep ?? false,
        amdPattern: t.amdPattern ?? "unknown",
        fibLevel: parseFloat(t.fibLevel ?? "0"),
        session: t.session ?? "unknown",
      }));

    if (records.length === 0) return;

    const stats = calcRegimePerformance(records);
    const best = bestPerformingRegime(stats);

    for (const stat of stats) {
      const grossProfit = records
        .filter(r => r.regime === stat.regime && r.pnl > 0)
        .reduce((s, r) => s + r.pnl, 0);
      const grossLoss = Math.abs(
        records
          .filter(r => r.regime === stat.regime && r.pnl < 0)
          .reduce((s, r) => s + r.pnl, 0),
      );
      const totalPnl = records
        .filter(r => r.regime === stat.regime)
        .reduce((s, r) => s + r.pnl, 0);

      await db
        .insert(regimePerformanceTable)
        .values({
          pair: null,
          regime: stat.regime,
          totalTrades: stat.totalTrades,
          wins: stat.wins,
          losses: stat.losses,
          totalPnl: String(Math.round(totalPnl * 100) / 100),
          grossProfit: String(Math.round(grossProfit * 100) / 100),
          grossLoss: String(Math.round(grossLoss * 100) / 100),
          winRate: String(stat.winRate),
          profitFactor: String(stat.profitFactor),
          maxDrawdown: String(stat.maxDrawdown),
          avgSetupScore: String(stat.avgSetupScore),
          zoneWinRate: String(stat.zoneWinRate),
          liquidityWinRate: String(stat.liquidityWinRate),
          amdWinRate: String(stat.amdWinRate),
          confirmationWinRate: String(stat.confirmationWinRate),
        })
        .onConflictDoUpdate({
          target: [regimePerformanceTable.regime, regimePerformanceTable.pair],
          set: {
            totalTrades: stat.totalTrades,
            wins: stat.wins,
            losses: stat.losses,
            totalPnl: String(Math.round(totalPnl * 100) / 100),
            grossProfit: String(Math.round(grossProfit * 100) / 100),
            grossLoss: String(Math.round(grossLoss * 100) / 100),
            winRate: String(stat.winRate),
            profitFactor: String(stat.profitFactor),
            maxDrawdown: String(stat.maxDrawdown),
            avgSetupScore: String(stat.avgSetupScore),
            zoneWinRate: String(stat.zoneWinRate),
            liquidityWinRate: String(stat.liquidityWinRate),
            amdWinRate: String(stat.amdWinRate),
            confirmationWinRate: String(stat.confirmationWinRate),
          },
        });

      const currentWeights =
        (await loadRegimeWeights()).get(stat.regime) ??
        DEFAULT_REGIME_WEIGHTS[stat.regime as keyof typeof DEFAULT_REGIME_WEIGHTS] ??
        DEFAULT_REGIME_WEIGHTS.ranging;

      const adapted = adaptRegimeWeights(records, currentWeights);

      await db
        .insert(regimeWeightsTable)
        .values({
          regime: stat.regime,
          pair: null,
          zoneWeight: String(adapted.zone),
          liquidityWeight: String(adapted.liquidity),
          amdWeight: String(adapted.amd),
          confirmationWeight: String(adapted.confirmation),
          sampleSize: adapted.sampleSize,
        })
        .onConflictDoUpdate({
          target: [regimeWeightsTable.regime, regimeWeightsTable.pair],
          set: {
            zoneWeight: String(adapted.zone),
            liquidityWeight: String(adapted.liquidity),
            amdWeight: String(adapted.amd),
            confirmationWeight: String(adapted.confirmation),
            sampleSize: adapted.sampleSize,
          },
        });
    }

    if (best) {
      logger.info({ bestRegime: best }, "Best performing regime updated");
    }
  } catch (err) {
    logger.warn({ err }, "Regime analytics update failed");
  }
}

export async function analyzeAll(): Promise<void> {
  logger.info("Starting market analysis for all pairs");

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
          if (result.signals.length > 0) {
            await executePaperSignals(result.signals, pair).catch(err =>
              logger.warn({ pair, err }, "Paper signal execution failed"),
            );
          }
        }

        logger.info(
          { pair, tf, zones: result.zones.length, signals: result.signals.length, regime: result.regime.regime, confidence: result.regime.regimeConfidence },
          "Analysis complete",
        );
      } catch (err) {
        logger.error({ pair, tf, err }, "Analysis failed");
      }
    }
  }

  await updateRegimeAnalytics();
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
      adxEquivalent: String(regime.adxEquivalent),
      regimeConfidence: String(regime.regimeConfidence),
      volatilityPercentile: String(regime.volatilityPercentile),
      rangeCompression: String(regime.rangeCompression),
    })
    .onConflictDoUpdate({
      target: marketRegimeTable.pair,
      set: {
        regime: regime.regime,
        trend: regime.trend,
        volatility: regime.volatility,
        atr: String(regime.atr),
        adxEquivalent: String(regime.adxEquivalent),
        regimeConfidence: String(regime.regimeConfidence),
        volatilityPercentile: String(regime.volatilityPercentile),
        rangeCompression: String(regime.rangeCompression),
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
