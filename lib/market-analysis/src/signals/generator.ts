import type {
  Candle,
  SupplyDemandZone,
  FibAnalysis,
  AMDSequence,
  MarketRegimeResult,
  LiquidityGrab,
  TradeSignal,
  Pair,
} from "../types.js";
import { calcATR, detectTrend } from "../analysis/swings.js";
import { isPriceInZone } from "../analysis/zones.js";
import { isPremiumZone, isDiscountZone } from "../analysis/fibonacci.js";
import { recentLiquidityGrab } from "../analysis/liquidity.js";
import {
  calcConfidenceWithWeights,
  applyRegimeAdjustment,
  DEFAULT_WEIGHT_PROFILE,
  type WeightProfile,
} from "../learning/weights.js";

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

export function generateSignals(
  pair: Pair,
  candles: Candle[],
  zones: SupplyDemandZone[],
  fib: FibAnalysis | null,
  amd: AMDSequence,
  regime: MarketRegimeResult,
  grabs: LiquidityGrab[],
  learnedWeights: WeightProfile = DEFAULT_WEIGHT_PROFILE,
): TradeSignal[] {
  if (candles.length < 10) return [];

  const atr = calcATR(candles);
  if (atr === 0) return [];

  const currentPrice = candles[candles.length - 1]!.close;
  const session = getBestSessionForPair(pair);
  const signals: TradeSignal[] = [];

  const activeZones = zones.filter(z => z.active && z.strength >= 70);

  for (const zone of activeZones) {
    const inZone = isPriceInZone(currentPrice, zone, atr);
    const approaching =
      !inZone &&
      (zone.zoneType === "demand"
        ? currentPrice >= zone.priceTop && currentPrice <= zone.priceTop + atr * 3
        : currentPrice <= zone.priceBottom && currentPrice >= zone.priceBottom - atr * 3);
    if (!inZone && !approaching) continue;

    const direction: "buy" | "sell" = zone.zoneType === "demand" ? "buy" : "sell";
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

    if (zone.strength > 80) factors.push("Zone strength > 80");
    else if (zone.strength > 70) factors.push("Zone strength > 70");
    else if (zone.strength > 60) factors.push("Zone strength > 60");

    if (zone.freshness === "fresh") factors.push("Fresh zone (untested)");

    if (zone.fibLevel === 0.618) factors.push("FIB 0.618 confluence");
    else if (zone.fibLevel === 0.786) factors.push("FIB 0.786 confluence");
    else if (zone.fibLevel === 0.5) factors.push("FIB 0.5 confluence");

    if (fib) {
      if (direction === "buy" && isDiscountZone(currentPrice, fib)) {
        factors.push("Discount zone (bullish bias)");
      }
      if (direction === "sell" && isPremiumZone(currentPrice, fib)) {
        factors.push("Premium zone (bearish bias)");
      }
    }

    if (amd.phase === "distribution") factors.push("AMD distribution phase");
    else if (amd.phase === "manipulation") factors.push("AMD manipulation phase");

    if (session === "london" || session === "newyork") {
      factors.push("London/NY session");
    }

    const grab = recentLiquidityGrab(grabs, 8, candles);
    if (grab) {
      const grabMatchesBuy = grab.type === "sweep_low" && direction === "buy";
      const grabMatchesSell = grab.type === "sweep_high" && direction === "sell";
      if (grabMatchesBuy || grabMatchesSell) {
        factors.push("Liquidity sweep before zone");
      }
    }

    const swingTrend = detectTrend(
      candles
        .slice(-20)
        .map((c, i) => ({ time: c.time, price: c.high, type: "high" as const, index: i })),
    );
    if (direction === "buy" && swingTrend === "bullish") factors.push("Bullish market structure");
    if (direction === "sell" && swingTrend === "bearish") factors.push("Bearish market structure");

    const regimeWeights = applyRegimeAdjustment(learnedWeights, regime);
    const confidence = calcConfidenceWithWeights(factors, regimeWeights);
    if (confidence < 38) continue;

    const { entryPrice, stopLoss, takeProfit } = calcStopAndTarget(zone, direction, atr, pair);
    const riskReward = Math.abs(takeProfit - entryPrice) / Math.abs(entryPrice - stopLoss);

    const amdPhase: "accumulation" | "manipulation" | "distribution" =
      amd.phase === "none" || amd.phase === "accumulation"
        ? "accumulation"
        : amd.phase;

    signals.push({
      pair,
      direction,
      confidence,
      zoneType: zone.zoneType,
      zoneStrength: zone.strength,
      amdPhase,
      fibLevel: zone.fibLevel ?? 0.5,
      session: session === "london" ? "london" : "newyork",
      entryPrice,
      stopLoss,
      takeProfit,
      riskReward,
      confluenceFactors: factors,
    });
  }

  signals.sort((a, b) => b.confidence - a.confidence);
  return signals.slice(0, 3);
}
