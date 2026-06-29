import type { Candle, SwingPoint } from "../types.js";
import { analyzeVolatility } from "../market_regime/volatility_analyzer.js";
import { analyzeTrend } from "../market_regime/trend_analyzer.js";

export type PerceptionRegime =
  | "trending"
  | "ranging"
  | "expansion"
  | "compression"
  | "transitioning";

export interface RegimeScore {
  regime: PerceptionRegime;
  score: number;
}

export interface RegimePerception {
  regime: PerceptionRegime;
  confidence: number;
  scores: Record<PerceptionRegime, number>;
  prevRegime: PerceptionRegime | null;
  isTransitioning: boolean;
  volatilityPercentile: number;
  adx: number;
  rangeCompression: number;
}

function scoreRegimes(
  adx: number,
  volPercentile: number,
  rangeCompression: number,
  trendStrength: number,
): Record<PerceptionRegime, number> {
  const trending = Math.min(100, Math.round(
    (adx >= 25 ? Math.min(100, (adx - 10) * 2) : 0) * 0.5 +
    (trendStrength * 0.3) +
    (volPercentile >= 40 ? 20 : 0),
  ));

  const ranging = Math.min(100, Math.round(
    (adx < 25 ? Math.min(100, (30 - adx) * 3) : 0) * 0.5 +
    (rangeCompression * 0.3) +
    (volPercentile >= 25 && volPercentile <= 60 ? 20 : 0),
  ));

  const expansion = Math.min(100, Math.round(
    (volPercentile >= 60 ? Math.min(100, (volPercentile - 50) * 2) : 0) * 0.6 +
    (adx >= 20 ? 20 : 0) +
    (rangeCompression < 20 ? 20 : 0),
  ));

  const compression = Math.min(100, Math.round(
    (rangeCompression >= 40 ? rangeCompression : 0) * 0.5 +
    (volPercentile <= 30 ? Math.min(100, (35 - volPercentile) * 2) : 0) * 0.4 +
    (adx < 20 ? 10 : 0),
  ));

  return { trending, ranging, expansion, compression, transitioning: 0 };
}

const REGIME_HISTORY: PerceptionRegime[] = [];
const MAX_HISTORY = 5;

export function perceiveRegime(
  candles: Candle[],
  swings: SwingPoint[],
): RegimePerception {
  const empty: RegimePerception = {
    regime: "ranging", confidence: 0,
    scores: { trending: 0, ranging: 0, expansion: 0, compression: 0, transitioning: 0 },
    prevRegime: null, isTransitioning: false,
    volatilityPercentile: 50, adx: 0, rangeCompression: 0,
  };

  if (candles.length < 20) return empty;

  const vol = analyzeVolatility(candles);
  const trend = analyzeTrend(candles, swings);

  const rawScores = scoreRegimes(
    trend.adx,
    vol.volatilityPercentile,
    vol.rangeCompression,
    trend.trendStrength,
  );

  const entries = Object.entries(rawScores) as [PerceptionRegime, number][];
  const sorted = entries.sort((a, b) => b[1] - a[1]);
  const topRegime = sorted[0]![0];
  const topScore = sorted[0]![1];
  const secondScore = sorted[1]?.[1] ?? 0;

  const scoreDiff = topScore - secondScore;
  const isTransitioning = scoreDiff < 15 && topScore > 20;

  const finalRegime: PerceptionRegime = isTransitioning ? "transitioning" : topRegime;

  const transitScore = isTransitioning ? Math.max(topScore, secondScore) : 0;
  const scores: Record<PerceptionRegime, number> = { ...rawScores, transitioning: transitScore };

  const confidence = isTransitioning
    ? Math.min(100, Math.round(topScore * 0.6))
    : Math.min(100, topScore);

  const prevRegime = REGIME_HISTORY.length > 0 ? REGIME_HISTORY[REGIME_HISTORY.length - 1]! : null;

  REGIME_HISTORY.push(finalRegime);
  if (REGIME_HISTORY.length > MAX_HISTORY) REGIME_HISTORY.shift();

  return {
    regime: finalRegime,
    confidence,
    scores,
    prevRegime,
    isTransitioning,
    volatilityPercentile: vol.volatilityPercentile,
    adx: trend.adx,
    rangeCompression: vol.rangeCompression,
  };
}
