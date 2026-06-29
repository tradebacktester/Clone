import type { Candle } from "../types.js";

export type LiquidityQuality = "excellent" | "good" | "fair" | "poor";
export type SessionLiquidity = "high" | "medium" | "low";

export interface LiquidityPerception {
  sessionLiquidity: SessionLiquidity;
  relativeVolume: number;
  spread: number;
  spreadPercent: number;
  candleEfficiency: number;
  gapFrequency: number;
  quality: LiquidityQuality;
  score: number;
  confidence: number;
}

function calcRelativeVolume(candles: Candle[], recentN = 5, baseN = 20): number {
  if (candles.length < baseN) return 1;
  const recentSlice = candles.slice(-recentN);
  const baseSlice = candles.slice(-baseN);
  const recentAvgVol = recentSlice.reduce((s, c) => s + c.volume, 0) / recentSlice.length;
  const baseAvgVol = baseSlice.reduce((s, c) => s + c.volume, 0) / baseSlice.length;
  if (baseAvgVol === 0) return 1;
  return Math.round((recentAvgVol / baseAvgVol) * 100) / 100;
}

function calcSpread(candles: Candle[], n = 5): { spread: number; spreadPercent: number } {
  const slice = candles.slice(-n);
  if (slice.length === 0) return { spread: 0, spreadPercent: 0 };
  const avgHL = slice.reduce((s, c) => s + (c.high - c.low), 0) / slice.length;
  const avgClose = slice.reduce((s, c) => s + c.close, 0) / slice.length;
  const spreadPercent = avgClose > 0 ? (avgHL / avgClose) * 100 : 0;
  return {
    spread: Math.round(avgHL * 1e6) / 1e6,
    spreadPercent: Math.round(spreadPercent * 10000) / 10000,
  };
}

function calcCandleEfficiency(candles: Candle[], n = 10): number {
  const slice = candles.slice(-n);
  if (slice.length === 0) return 0;
  let totalEfficiency = 0;
  for (const c of slice) {
    const range = c.high - c.low;
    const body = Math.abs(c.close - c.open);
    totalEfficiency += range > 0 ? body / range : 0;
  }
  return Math.round((totalEfficiency / slice.length) * 100) / 100;
}

function calcGapFrequency(candles: Candle[], n = 20): number {
  const slice = candles.slice(-n);
  if (slice.length < 2) return 0;
  let gapCount = 0;
  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1]!;
    const curr = slice[i]!;
    const gap = Math.abs(curr.open - prev.close);
    const range = prev.high - prev.low;
    if (range > 0 && gap / range > 0.3) gapCount++;
  }
  return Math.round((gapCount / (slice.length - 1)) * 100) / 100;
}

function classifySessionLiquidity(
  relativeVolume: number,
  candleEfficiency: number,
): SessionLiquidity {
  const score = relativeVolume * 0.6 + candleEfficiency * 0.4;
  if (score >= 1.3) return "high";
  if (score >= 0.7) return "medium";
  return "low";
}

function calcLiquidityScore(
  relVol: number,
  candleEff: number,
  gapFreq: number,
  spreadPercent: number,
): number {
  const volScore = Math.min(100, relVol * 50);
  const effScore = candleEff * 100;
  const gapPenalty = gapFreq * 30;
  const spreadPenalty = Math.min(50, spreadPercent * 10000);
  return Math.max(0, Math.min(100, Math.round(
    volScore * 0.35 + effScore * 0.35 - gapPenalty * 0.15 - spreadPenalty * 0.15,
  )));
}

function classifyQuality(score: number): LiquidityQuality {
  if (score >= 70) return "excellent";
  if (score >= 50) return "good";
  if (score >= 30) return "fair";
  return "poor";
}

export function perceiveLiquidity(candles: Candle[]): LiquidityPerception {
  const empty: LiquidityPerception = {
    sessionLiquidity: "medium", relativeVolume: 1, spread: 0, spreadPercent: 0,
    candleEfficiency: 0.5, gapFrequency: 0, quality: "fair", score: 50, confidence: 0,
  };

  if (candles.length < 5) return empty;

  const relativeVolume = calcRelativeVolume(candles);
  const { spread, spreadPercent } = calcSpread(candles);
  const candleEfficiency = calcCandleEfficiency(candles);
  const gapFrequency = calcGapFrequency(candles);
  const sessionLiquidity = classifySessionLiquidity(relativeVolume, candleEfficiency);
  const score = calcLiquidityScore(relativeVolume, candleEfficiency, gapFrequency, spreadPercent);
  const quality = classifyQuality(score);

  const confidence = Math.min(100, Math.round(
    (candles.length >= 20 ? 60 : (candles.length / 20) * 60) + 40,
  ));

  return {
    sessionLiquidity,
    relativeVolume,
    spread,
    spreadPercent,
    candleEfficiency,
    gapFrequency,
    quality,
    score,
    confidence,
  };
}
