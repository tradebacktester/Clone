import type { Candle } from "../types.js";

export interface VolatilityAnalysis {
  atr: number;
  atrPercent: number;
  volatilityLevel: "low" | "medium" | "high";
  volatilityPercentile: number;
  rangeCompression: number;
  avgRange: number;
  currentRange: number;
}

function calcSingleATR(candles: Candle[], endIdx: number, period: number): number {
  let sum = 0;
  const start = endIdx - period + 1;
  for (let i = start; i <= endIdx; i++) {
    const c = candles[i]!;
    const prev = candles[i - 1];
    if (!prev) { sum += c.high - c.low; continue; }
    sum += Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
  }
  return sum / period;
}

function buildATRSeries(candles: Candle[], period: number, lookback: number): number[] {
  const series: number[] = [];
  const startIdx = Math.max(period, candles.length - lookback - period);
  for (let i = startIdx + period - 1; i < candles.length; i++) {
    series.push(calcSingleATR(candles, i, period));
  }
  return series;
}

export function analyzeVolatility(
  candles: Candle[],
  atrPeriod = 14,
  lookback = 50,
): VolatilityAnalysis {
  const empty: VolatilityAnalysis = {
    atr: 0, atrPercent: 0, volatilityLevel: "medium",
    volatilityPercentile: 50, rangeCompression: 0,
    avgRange: 0, currentRange: 0,
  };

  if (candles.length < atrPeriod + 2) return empty;

  const atr = calcSingleATR(candles, candles.length - 1, atrPeriod);

  const slice20 = candles.slice(-20);
  const avgPrice = slice20.reduce((s, c) => s + c.close, 0) / slice20.length;
  const atrPercent = avgPrice > 0 ? (atr / avgPrice) * 100 : 0;

  const volatilityLevel: "low" | "medium" | "high" =
    atrPercent < 0.3 ? "low" : atrPercent < 0.7 ? "medium" : "high";

  const atrSeries = buildATRSeries(candles, atrPeriod, lookback);
  const currentAtr = atrSeries[atrSeries.length - 1] ?? atr;
  // midpoint percentile rank — ties share the midpoint, preventing all-equal → 100%
  const strictBelow = atrSeries.filter(v => v < currentAtr - 1e-10).length;
  const equal       = atrSeries.filter(v => Math.abs(v - currentAtr) < 1e-10).length;
  const volatilityPercentile =
    atrSeries.length > 0
      ? Math.round(((strictBelow + 0.5 * equal) / atrSeries.length) * 100)
      : 50;

  const slice5 = candles.slice(-5);
  const slice20r = candles.slice(-20);
  const currentRange =
    slice5.reduce((s, c) => s + (c.high - c.low), 0) / slice5.length;
  const avgRange =
    slice20r.reduce((s, c) => s + (c.high - c.low), 0) / slice20r.length;
  const rangeCompression =
    avgRange > 0
      ? Math.max(0, Math.min(100, (1 - currentRange / avgRange) * 100))
      : 0;

  return {
    atr: Math.round(atr * 1e6) / 1e6,
    atrPercent: Math.round(atrPercent * 100) / 100,
    volatilityLevel,
    volatilityPercentile,
    rangeCompression: Math.round(rangeCompression * 10) / 10,
    avgRange: Math.round(avgRange * 1e6) / 1e6,
    currentRange: Math.round(currentRange * 1e6) / 1e6,
  };
}
