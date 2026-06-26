import type {
  Candle,
  SupplyDemandZone,
  FibAnalysis,
  AMDSequence,
  MarketRegimeResult,
  LiquidityGrab,
  SweepEvent,
  TradeSignal,
  Pair,
} from "../types.js";
import { calcATR, detectTrend } from "../analysis/swings.js";
import { isPriceInZone } from "../analysis/zones.js";
import { isPremiumZone, isDiscountZone } from "../analysis/fibonacci.js";
import { recentSweep } from "../analysis/liquidity.js";
import { confirmCurrentCandle } from "../analysis/confirmation.js";
import { calcFinalTradeScore, isAllowedSession, isHighImpactNews } from "./finalScore.js";
import {
  calcConfidenceWithWeights,
  applyRegimeAdjustment,
  DEFAULT_WEIGHT_PROFILE,
  type WeightProfile,
} from "../learning/weights.js";

function getSessionForTime(pair: Pair, time: Date): string {
  const hour = time.getUTCHours();
  if (hour >= 7 && hour < 12) return "london";
  if (hour >= 12 && hour < 20) return "newyork";
  if (pair === "USDJPY" && (hour < 7 || hour >= 20)) return "asian";
  if (hour >= 20 || hour < 7) return "london";
  return "london";
}

function getBestSessionForPair(pair: Pair): string {
  const hour = new Date().getUTCHours();
  if (hour >= 7 && hour < 12) return "london";
  if (hour >= 12 && hour < 20) return "newyork";
  if (pair === "USDJPY" && (hour < 7 || hour >= 20)) return "asian";
  if (hour >= 20 || hour < 7) return "london";
  return "london";
}

function calcStopAndTarget(
  zone: SupplyDemandZone,
  direction: "buy" | "sell",
  atr: number,
  pair: Pair,
): { stopLoss: number; takeProfit: number; entryPrice: number } {
  const buffer = atr * 0.2;
  const pipSize = pair === "USDJPY" ? 0.01 : 0.0001;
  const minRR = 2.0;

  let entryPrice: number;
  let stopLoss: number;
  let takeProfit: number;

  if (direction === "buy") {
    entryPrice = zone.priceTop;
    stopLoss = zone.priceBottom - buffer;
    const risk = entryPrice - stopLoss;
    takeProfit = entryPrice + risk * minRR;
  } else {
    entryPrice = zone.priceBottom;
    stopLoss = zone.priceTop + buffer;
    const risk = stopLoss - entryPrice;
    takeProfit = entryPrice - risk * minRR;
  }

  entryPrice = Math.round(entryPrice / pipSize) * pipSize;
  stopLoss = Math.round(stopLoss / pipSize) * pipSize;
  takeProfit = Math.round(takeProfit / pipSize) * pipSize;

  return { entryPrice, stopLoss, takeProfit };
}

export interface GenerateSignalsOptions {
  backtestCandleTime?: Date;
  minScore?: number;
  skipSessionFilter?: boolean;
  skipNewsFilter?: boolean;
}

export function generateSignals(
  pair: Pair,
  candles: Candle[],
  zones: SupplyDemandZone[],
  fib: FibAnalysis | null,
  amd: AMDSequence,
  regime: MarketRegimeResult,
  grabs: LiquidityGrab[],
  learnedWeights: WeightProfile = DEFAULT_WEIGHT_PROFILE,
  sweeps: SweepEvent[] = [],
  backtestCandleTime?: Date,
  options?: GenerateSignalsOptions,
): TradeSignal[] {
  if (candles.length < 10) return [];

  const atr = calcATR(candles);
  if (atr === 0) return [];

  const candleTime = backtestCandleTime ?? options?.backtestCandleTime;
  const currentPrice = candles[candles.length - 1]!.close;
  const session = candleTime
    ? getSessionForTime(pair, candleTime)
    : getBestSessionForPair(pair);
  const skipSession = options?.skipSessionFilter ?? (candleTime !== undefined);
  const skipNews = options?.skipNewsFilter ?? (candleTime !== undefined);
  const minScore = options?.minScore ?? 80;
  const signals: TradeSignal[] = [];

  const activeZones = zones.filter(z => z.active && z.strength >= 55);

  for (const zone of activeZones) {
    const inZone = isPriceInZone(currentPrice, zone, atr);
    const approaching =
      !inZone &&
      (zone.zoneType === "demand"
        ? currentPrice >= zone.priceTop && currentPrice <= zone.priceTop + atr * 3
        : currentPrice <= zone.priceBottom && currentPrice >= zone.priceBottom - atr * 3);
    if (!inZone && !approaching) continue;

    const direction: "buy" | "sell" = zone.zoneType === "demand" ? "buy" : "sell";

    // Hard premium/discount filter:
    // Discount zone (price < 0.5) → only longs allowed.
    // Premium zone  (price > 0.5) → only shorts allowed.
    // Price exactly at equilibrium → allow both directions.
    if (fib) {
      if (direction === "buy" && isPremiumZone(currentPrice, fib)) continue;
      if (direction === "sell" && isDiscountZone(currentPrice, fib)) continue;
    }

    // Hard confirmation candle filter (Module 8):
    // The most recent closed candle must score ≥ 70 to allow a trade.
    // Score = Direction(30) + BOS(40) + Body>60%(30). Max 100.
    const confirmation = confirmCurrentCandle(candles, direction);
    if (!confirmation.valid) continue;

    const factors: string[] = [];

    if (inZone) {
      factors.push(
        direction === "buy" ? "Price in active demand zone" : "Price in active supply zone",
      );
    } else {
      factors.push(
        direction === "buy" ? "Approaching demand zone" : "Approaching supply zone",
      );
    }

    factors.push(`Confirmation candle (score ${confirmation.score})`);

    if (zone.strength > 80) factors.push("Zone strength > 80");
    else if (zone.strength > 70) factors.push("Zone strength > 70");

    if (zone.freshness === "fresh") factors.push("Fresh zone (untested)");

    if (zone.fibLevel === 0.618) factors.push("FIB 0.618 confluence");
    else if (zone.fibLevel === 0.786) factors.push("FIB 0.786 confluence");
    else if (zone.fibLevel === 0.5) factors.push("FIB 0.5 confluence");

    if (fib) {
      if (direction === "buy") factors.push("Discount zone — longs preferred");
      if (direction === "sell") factors.push("Premium zone — shorts preferred");
    }

    // AMD confluence only counts when the full sequence scores ≥ 80.
    if (amd.amdScore >= 80) {
      if (amd.phase === "distribution") factors.push(`AMD distribution (score ${amd.amdScore})`);
      else if (amd.phase === "manipulation") factors.push(`AMD manipulation (score ${amd.amdScore})`);
    }

    // Gate 2: London or New York session only (skipped in backtest mode — candle time used instead).
    if (!skipSession && !isAllowedSession(session)) continue;

    // Gate 3: No high-impact news (skipped in backtest mode — historical news not tracked).
    if (!skipNews && isHighImpactNews(pair)) continue;

    factors.push("London/NY session");

    // Use scored sweeps (≥ 70) for confluence: a sell-side sweep confirms buys,
    // a buy-side sweep confirms sells. Fall back to raw grabs if no sweeps available.
    const sweep = recentSweep(sweeps, 8, candles);
    if (sweep) {
      if (sweep.type === "sell_side" && direction === "buy") {
        factors.push(`Sell-side liquidity sweep (score ${sweep.sweepScore})`);
      } else if (sweep.type === "buy_side" && direction === "sell") {
        factors.push(`Buy-side liquidity sweep (score ${sweep.sweepScore})`);
      }
    } else if (sweeps.length === 0) {
      // Backward-compat: use raw grabs when no sweep detection data available
      const rawGrab = grabs[grabs.length - 1];
      if (rawGrab?.confirmed) {
        const grabMatchesBuy = rawGrab.type === "sweep_low" && direction === "buy";
        const grabMatchesSell = rawGrab.type === "sweep_high" && direction === "sell";
        if (grabMatchesBuy || grabMatchesSell) factors.push("Liquidity sweep before zone");
      }
    }

    const swingTrend = detectTrend(
      candles
        .slice(-20)
        .map((c, i) => ({ time: c.time, price: c.high, type: "high" as const, index: i })),
    );
    if (direction === "buy" && swingTrend === "bullish") factors.push("Bullish market structure");
    if (direction === "sell" && swingTrend === "bearish") factors.push("Bearish market structure");

    // Liquidity component: most recent matching sweep score, or 0.
    const liquidityScore = sweep
      ? (sweep.type === "sell_side" && direction === "buy") ||
        (sweep.type === "buy_side"  && direction === "sell")
        ? sweep.sweepScore
        : 0
      : 0;

    // Gate 1: Final weighted score must be ≥ minScore (80 live, lower in backtest).
    //   Zone 30% + Liquidity 25% + AMD 25% + Confirmation 20% = 100 max.
    const scored = calcFinalTradeScore(
      zone.strength,
      liquidityScore,
      amd.amdScore,
      confirmation.score,
      minScore,
    );
    if (!scored.allowed) continue;

    const regimeWeights = applyRegimeAdjustment(learnedWeights, regime);
    const confidence = calcConfidenceWithWeights(factors, regimeWeights);

    const { entryPrice, stopLoss, takeProfit } = calcStopAndTarget(zone, direction, atr, pair);
    const riskReward = Math.abs(takeProfit - entryPrice) / Math.abs(entryPrice - stopLoss);

    const amdPhase: "accumulation" | "manipulation" | "distribution" =
      amd.phase === "none" || amd.phase === "accumulation"
        ? "accumulation"
        : amd.phase;

    factors.push(`Final score ${scored.finalScore} (zone ${scored.zoneContrib} + liq ${scored.liquidityContrib} + amd ${scored.amdContrib} + conf ${scored.confirmationContrib})`);

    signals.push({
      pair,
      direction,
      confidence,
      finalScore: scored.finalScore,
      zoneScore: zone.strength,
      liquidityScore,
      amdScore: amd.amdScore,
      confirmationScore: confirmation.score,
      zoneType: zone.zoneType,
      zoneStrength: zone.strength,
      amdPhase,
      fibLevel: zone.fibLevel ?? 0.5,
      session,
      entryPrice,
      stopLoss,
      takeProfit,
      riskReward,
      confluenceFactors: factors,
    });
  }

  signals.sort((a, b) => b.finalScore - a.finalScore);
  return signals.slice(0, 3);
}
