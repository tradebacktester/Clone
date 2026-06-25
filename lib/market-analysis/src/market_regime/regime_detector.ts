import type { Candle, SwingPoint } from "../types.js";
import { analyzeVolatility, type VolatilityAnalysis } from "./volatility_analyzer.js";
import { analyzeTrend, type TrendAnalysis } from "./trend_analyzer.js";

export type RegimeType = "trending" | "ranging" | "volatile" | "low_volatility";

export interface DetailedRegimeResult {
  regime: RegimeType;
  regimeConfidence: number;
  trend: "bullish" | "bearish" | "neutral";
  volatility: "low" | "medium" | "high";
  atr: number;
  adxEquivalent: number;
  volatilityPercentile: number;
  rangeCompression: number;
  volatilityAnalysis: VolatilityAnalysis;
  trendAnalysis: TrendAnalysis;
}

function scoreVolatileConfidence(vol: VolatilityAnalysis): number {
  const percentileScore = Math.min(100, Math.max(0, (vol.volatilityPercentile - 70) * 3.3));
  const atrPctScore = Math.min(100, Math.max(0, (vol.atrPercent - 0.7) * 60));
  return Math.min(100, Math.round(percentileScore * 0.5 + atrPctScore * 0.3 + 30));
}

function scoreLowVolConfidence(vol: VolatilityAnalysis): number {
  const percentileScore = Math.min(100, Math.max(0, (30 - vol.volatilityPercentile) * 3.3));
  const compressionScore = vol.rangeCompression;
  return Math.min(100, Math.round(percentileScore * 0.5 + compressionScore * 0.3 + 20));
}

function scoreTrendingConfidence(trend: TrendAnalysis): number {
  const adxScore = Math.min(100, Math.max(0, (trend.adx - 20) * 2.5));
  const diScore = Math.min(100, Math.abs(trend.plusDI - trend.minusDI) * 3);
  const structScore = trend.structureScore;
  return Math.min(100, Math.round(adxScore * 0.45 + structScore * 0.35 + diScore * 0.20 + 25));
}

function scoreRangingConfidence(trend: TrendAnalysis, vol: VolatilityAnalysis): number {
  const adxScore = Math.min(100, Math.max(0, (28 - trend.adx) * 2.5));
  const compressionScore = vol.rangeCompression;
  const midPercile = Math.min(100, 100 - Math.abs(vol.volatilityPercentile - 50) * 2);
  return Math.min(100, Math.round(adxScore * 0.45 + compressionScore * 0.30 + midPercile * 0.25 + 15));
}

export function detectRegimeDetailed(
  candles: Candle[],
  swings: SwingPoint[],
): DetailedRegimeResult {
  if (candles.length < 20) {
    const emptyVol: VolatilityAnalysis = { atr: 0, atrPercent: 0, volatilityLevel: "medium", volatilityPercentile: 50, rangeCompression: 0, avgRange: 0, currentRange: 0 };
    const emptyTrend: TrendAnalysis = { adx: 0, plusDI: 0, minusDI: 0, trendDirection: "neutral", trendStrength: 0, structureScore: 0, consecutiveConfirming: 0 };
    return {
      regime: "ranging", regimeConfidence: 0,
      trend: "neutral", volatility: "medium",
      atr: 0, adxEquivalent: 0,
      volatilityPercentile: 50, rangeCompression: 0,
      volatilityAnalysis: emptyVol, trendAnalysis: emptyTrend,
    };
  }

  const vol = analyzeVolatility(candles);
  const trend = analyzeTrend(candles, swings);

  let regime: RegimeType;
  let regimeConfidence: number;

  if (vol.volatilityPercentile >= 75 || vol.atrPercent >= 0.8) {
    regime = "volatile";
    regimeConfidence = scoreVolatileConfidence(vol);
  } else if (vol.volatilityPercentile <= 25 && vol.atrPercent < 0.35) {
    regime = "low_volatility";
    regimeConfidence = scoreLowVolConfidence(vol);
  } else if (trend.adx >= 25 || trend.trendStrength >= 50) {
    regime = "trending";
    regimeConfidence = scoreTrendingConfidence(trend);
  } else {
    regime = "ranging";
    regimeConfidence = scoreRangingConfidence(trend, vol);
  }

  return {
    regime,
    regimeConfidence,
    trend: trend.trendDirection,
    volatility: vol.volatilityLevel,
    atr: vol.atr,
    adxEquivalent: trend.adx,
    volatilityPercentile: vol.volatilityPercentile,
    rangeCompression: vol.rangeCompression,
    volatilityAnalysis: vol,
    trendAnalysis: trend,
  };
}
