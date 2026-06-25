import type { Candle, SwingPoint } from "../types.js";

export interface TrendAnalysis {
  adx: number;
  plusDI: number;
  minusDI: number;
  trendDirection: "bullish" | "bearish" | "neutral";
  trendStrength: number;
  structureScore: number;
  consecutiveConfirming: number;
}

export function analyzeTrend(
  candles: Candle[],
  swings: SwingPoint[],
  period = 14,
): TrendAnalysis {
  const empty: TrendAnalysis = {
    adx: 0, plusDI: 0, minusDI: 0,
    trendDirection: "neutral", trendStrength: 0,
    structureScore: 0, consecutiveConfirming: 0,
  };

  if (candles.length < period + 2) return empty;

  let plusDMSum = 0;
  let minusDMSum = 0;
  let trSum = 0;
  const start = candles.length - period;
  for (let i = start; i < candles.length; i++) {
    const c = candles[i]!;
    const prev = candles[i - 1]!;
    const upMove = c.high - prev.high;
    const downMove = prev.low - c.low;
    if (upMove > downMove && upMove > 0) plusDMSum += upMove;
    if (downMove > upMove && downMove > 0) minusDMSum += downMove;
    trSum += Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close),
    );
  }

  const plusDI = trSum > 0 ? (plusDMSum / trSum) * 100 : 0;
  const minusDI = trSum > 0 ? (minusDMSum / trSum) * 100 : 0;
  const diSum = plusDI + minusDI;
  const adx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;

  const trendDirection: "bullish" | "bearish" | "neutral" =
    adx >= 18 && plusDI > minusDI ? "bullish" :
    adx >= 18 && minusDI > plusDI ? "bearish" : "neutral";

  const recentSwings = swings.slice(-10);
  const highs = recentSwings.filter(s => s.type === "high").map(s => s.price);
  const lows = recentSwings.filter(s => s.type === "low").map(s => s.price);

  let bullCount = 0;
  let bearCount = 0;
  for (let i = 1; i < highs.length; i++) {
    if (highs[i]! > highs[i - 1]!) bullCount++;
    else bearCount++;
  }
  for (let i = 1; i < lows.length; i++) {
    if (lows[i]! > lows[i - 1]!) bullCount++;
    else bearCount++;
  }

  const consecutiveConfirming = Math.max(bullCount, bearCount);
  const structureScore = Math.min(100, consecutiveConfirming * 20);
  const trendStrength = Math.min(100, adx * 0.6 + structureScore * 0.4);

  return {
    adx: Math.round(adx * 10) / 10,
    plusDI: Math.round(plusDI * 10) / 10,
    minusDI: Math.round(minusDI * 10) / 10,
    trendDirection,
    trendStrength: Math.round(trendStrength * 10) / 10,
    structureScore: Math.round(structureScore),
    consecutiveConfirming,
  };
}
