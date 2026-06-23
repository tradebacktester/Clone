import type { Candle, SwingPoint, MarketRegimeResult } from "../types.js";
import { calcATR, detectTrend } from "./swings.js";

function calcADXEquivalent(candles: Candle[], period = 14): number {
  if (candles.length < period + 2) return 0;

  let plusDMSum = 0;
  let minusDMSum = 0;
  let trSum = 0;

  for (let i = candles.length - period; i < candles.length; i++) {
    const c = candles[i]!;
    const prev = candles[i - 1]!;

    const upMove = c.high - prev.high;
    const downMove = prev.low - c.low;

    const plusDM = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDM = downMove > upMove && downMove > 0 ? downMove : 0;

    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close),
    );

    plusDMSum += plusDM;
    minusDMSum += minusDM;
    trSum += tr;
  }

  if (trSum === 0) return 0;

  const plusDI = (plusDMSum / trSum) * 100;
  const minusDI = (minusDMSum / trSum) * 100;
  const diSum = plusDI + minusDI;
  if (diSum === 0) return 0;

  return (Math.abs(plusDI - minusDI) / diSum) * 100;
}

function classifyVolatility(atr: number, candles: Candle[]): "low" | "medium" | "high" {
  const avgPrice = candles.slice(-20).reduce((s, c) => s + c.close, 0) / 20;
  const atrPct = (atr / avgPrice) * 100;

  if (atrPct < 0.3) return "low";
  if (atrPct < 0.7) return "medium";
  return "high";
}

export function detectRegime(
  pair: string,
  candles: Candle[],
  swings: SwingPoint[],
): MarketRegimeResult {
  if (candles.length < 20) {
    return {
      pair,
      regime: "unknown",
      trend: "neutral",
      volatility: "medium",
      atr: 0,
      adxEquivalent: 0,
    };
  }

  const atr = calcATR(candles);
  const adx = calcADXEquivalent(candles);
  const trend = detectTrend(swings);
  const volatility = classifyVolatility(atr, candles);

  let regime: "trending" | "ranging" | "volatile" | "unknown";

  if (volatility === "high" && adx < 25) {
    regime = "volatile";
  } else if (adx >= 25 || trend !== "neutral") {
    regime = "trending";
  } else {
    regime = "ranging";
  }

  return {
    pair,
    regime,
    trend,
    volatility,
    atr,
    adxEquivalent: adx,
  };
}

export function isGoodTradingRegime(regime: MarketRegimeResult): boolean {
  if (regime.regime === "volatile" && regime.adxEquivalent < 20) return false;
  if (regime.volatility === "low" && regime.adxEquivalent < 15) return false;
  return true;
}
