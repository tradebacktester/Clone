import type { Candle } from "../types.js";

export type VolatilityClassification =
  | "very_low"
  | "low"
  | "normal"
  | "high"
  | "extreme";

export type VolatilityTrend = "rising" | "falling" | "stable";

export interface VolatilityPerception {
  atr: number;
  atrPercent: number;
  historicalVolatility: number;
  realizedVolatility: number;
  volatilityPercentile: number;
  volatilityTrend: VolatilityTrend;
  classification: VolatilityClassification;
  rangeCompression: number;
  annualizedHV: number;
  confidence: number;
}

function calcATR(candles: Candle[], period: number, endIdx: number): number {
  if (endIdx < period) return 0;
  let sum = 0;
  for (let i = endIdx - period + 1; i <= endIdx; i++) {
    const c = candles[i]!;
    const prev = candles[i - 1];
    if (!prev) { sum += c.high - c.low; continue; }
    sum += Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
  }
  return sum / period;
}

function calcLogReturnVolatility(candles: Candle[], window: number): number {
  if (candles.length < window + 1) return 0;
  const slice = candles.slice(-window - 1);
  const logReturns: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1]!.close;
    const curr = slice[i]!.close;
    if (prev > 0 && curr > 0) logReturns.push(Math.log(curr / prev));
  }
  if (logReturns.length < 2) return 0;
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const variance = logReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (logReturns.length - 1);
  return Math.sqrt(variance);
}

function buildATRSeries(candles: Candle[], period: number, lookback: number): number[] {
  const series: number[] = [];
  const startIdx = Math.max(period, candles.length - lookback - period);
  for (let i = startIdx + period - 1; i < candles.length; i++) {
    series.push(calcATR(candles, period, i));
  }
  return series;
}

function calcATRPercentile(series: number[], current: number): number {
  if (series.length === 0) return 50;
  const strictBelow = series.filter(v => v < current - 1e-10).length;
  const equal = series.filter(v => Math.abs(v - current) < 1e-10).length;
  return Math.round(((strictBelow + 0.5 * equal) / series.length) * 100);
}

function classifyVolatility(
  atrPercent: number,
  percentile: number,
): VolatilityClassification {
  if (percentile >= 90 || atrPercent >= 1.2) return "extreme";
  if (percentile >= 70 || atrPercent >= 0.7) return "high";
  if (percentile <= 10 || atrPercent <= 0.15) return "very_low";
  if (percentile <= 30 || atrPercent <= 0.3) return "low";
  return "normal";
}

function calcVolatilityTrend(series: number[]): VolatilityTrend {
  if (series.length < 6) return "stable";
  const recent = series.slice(-3);
  const prior = series.slice(-6, -3);
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length;
  if (priorAvg === 0) return "stable";
  const changePct = (recentAvg - priorAvg) / priorAvg;
  if (changePct > 0.1) return "rising";
  if (changePct < -0.1) return "falling";
  return "stable";
}

export function perceiveVolatility(
  candles: Candle[],
  atrPeriod = 14,
  lookback = 50,
): VolatilityPerception {
  const empty: VolatilityPerception = {
    atr: 0, atrPercent: 0, historicalVolatility: 0, realizedVolatility: 0,
    volatilityPercentile: 50, volatilityTrend: "stable", classification: "normal",
    rangeCompression: 0, annualizedHV: 0, confidence: 0,
  };

  if (candles.length < atrPeriod + 2) return empty;

  const atr = calcATR(candles, atrPeriod, candles.length - 1);
  const slice20 = candles.slice(-20);
  const avgPrice = slice20.reduce((s, c) => s + c.close, 0) / slice20.length;
  const atrPercent = avgPrice > 0 ? (atr / avgPrice) * 100 : 0;

  const realizedVol = calcLogReturnVolatility(candles, Math.min(20, candles.length - 1));
  const historicalVol = calcLogReturnVolatility(candles, Math.min(50, candles.length - 1));
  const SQRT_PERIODS_PER_YEAR = Math.sqrt(252);
  const annualizedHV = historicalVol * SQRT_PERIODS_PER_YEAR * 100;

  const atrSeries = buildATRSeries(candles, atrPeriod, lookback);
  const volatilityPercentile = calcATRPercentile(atrSeries, atr);
  const volatilityTrend = calcVolatilityTrend(atrSeries);

  const slice5 = candles.slice(-5);
  const currentRange = slice5.reduce((s, c) => s + (c.high - c.low), 0) / slice5.length;
  const avgRange = slice20.reduce((s, c) => s + (c.high - c.low), 0) / slice20.length;
  const rangeCompression = avgRange > 0
    ? Math.max(0, Math.min(100, (1 - currentRange / avgRange) * 100))
    : 0;

  const classification = classifyVolatility(atrPercent, volatilityPercentile);

  const confidence = Math.min(100, Math.round(
    (candles.length >= lookback ? 40 : (candles.length / lookback) * 40) +
    (atrSeries.length >= 10 ? 40 : (atrSeries.length / 10) * 40) +
    20,
  ));

  return {
    atr: Math.round(atr * 1e6) / 1e6,
    atrPercent: Math.round(atrPercent * 100) / 100,
    historicalVolatility: Math.round(historicalVol * 10000) / 10000,
    realizedVolatility: Math.round(realizedVol * 10000) / 10000,
    volatilityPercentile,
    volatilityTrend,
    classification,
    rangeCompression: Math.round(rangeCompression * 10) / 10,
    annualizedHV: Math.round(annualizedHV * 100) / 100,
    confidence,
  };
}
