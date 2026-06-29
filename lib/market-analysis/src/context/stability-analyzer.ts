import type { StabilityAnalysis, StabilityLabel, StabilityMeasure } from "./types.js";
import type { SnapshotRecord } from "./types.js";
import { STABILITY_WINDOW } from "./types.js";

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function stabilityToTrend(scores: number[]): "improving" | "deteriorating" | "stable" {
  if (scores.length < 4) return "stable";
  const half = Math.floor(scores.length / 2);
  const firstHalf = scores.slice(0, half);
  const secondHalf = scores.slice(half);
  const firstAvg = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
  const delta = secondAvg - firstAvg;
  if (delta > 5) return "improving";
  if (delta < -5) return "deteriorating";
  return "stable";
}

function calcRegimeStability(snapshots: SnapshotRecord[], currentRegime: string): StabilityMeasure {
  if (snapshots.length === 0) {
    return { name: "Regime Stability", score: 50, trend: "stable", warning: false, detail: "No historical snapshots available" };
  }
  const regimes = snapshots.map(s => s.regime);
  const sameCount = regimes.filter(r => r === currentRegime).length;
  const score = Math.round((sameCount / regimes.length) * 100);
  const uniqueRegimes = new Set(regimes).size;
  const warning = score < 50 || uniqueRegimes >= 3;
  const detail = `${sameCount}/${regimes.length} recent snapshots in "${currentRegime}" regime (${uniqueRegimes} unique regimes seen)`;
  const halfScores = regimes.map((r, i) => (r === regimes[Math.max(0, i - 1)] ? 80 : 40));
  return {
    name: "Regime Stability",
    score,
    trend: stabilityToTrend(halfScores),
    warning,
    detail,
  };
}

function calcTrendStability(snapshots: SnapshotRecord[], currentTrend: string): StabilityMeasure {
  if (snapshots.length === 0) {
    return { name: "Trend Stability", score: 50, trend: "stable", warning: false, detail: "No historical snapshots available" };
  }
  const directions = snapshots.map(s => s.trendDirection);
  const sameCount = directions.filter(d => d === currentTrend).length;
  const score = Math.round((sameCount / directions.length) * 100);
  const flipCount = directions.reduce((flips, d, i) => i > 0 && d !== directions[i - 1] ? flips + 1 : flips, 0);
  const flipRate = flipCount / directions.length;
  const warning = flipRate > 0.4 || score < 40;
  const detail = `${sameCount}/${directions.length} recent snapshots match "${currentTrend}" (${flipCount} direction flips)`;
  const halfScores = directions.map((d, i) => (d === currentTrend ? 80 : 30) - i);
  return {
    name: "Trend Stability",
    score,
    trend: stabilityToTrend(halfScores),
    warning,
    detail,
  };
}

function calcVolatilityStability(snapshots: SnapshotRecord[]): StabilityMeasure {
  if (snapshots.length < 3) {
    return { name: "Volatility Stability", score: 50, trend: "stable", warning: false, detail: "Insufficient snapshots for volatility stability" };
  }
  const percentiles = snapshots.map(s => s.volatilityPercentile);
  const sd = stdDev(percentiles);
  const score = Math.round(Math.max(0, Math.min(100, 100 - sd * 1.5)));
  const warning = sd > 25;
  const detail = `Volatility percentile std-dev: ${sd.toFixed(1)} across ${snapshots.length} snapshots`;
  const halfIdx = Math.floor(percentiles.length / 2);
  const firstSd = stdDev(percentiles.slice(0, halfIdx));
  const secondSd = stdDev(percentiles.slice(halfIdx));
  const trend = secondSd < firstSd - 5 ? "improving" : secondSd > firstSd + 5 ? "deteriorating" : "stable";
  return { name: "Volatility Stability", score, trend, warning, detail };
}

function calcLiquidityStability(snapshots: SnapshotRecord[]): StabilityMeasure {
  if (snapshots.length < 3) {
    return { name: "Liquidity Stability", score: 50, trend: "stable", warning: false, detail: "Insufficient snapshots for liquidity stability" };
  }
  const scores = snapshots.map(s => s.liquidityScore);
  const sd = stdDev(scores);
  const score = Math.round(Math.max(0, Math.min(100, 100 - sd)));
  const warning = sd > 30;
  const detail = `Liquidity score std-dev: ${sd.toFixed(1)} across ${snapshots.length} snapshots`;
  const halfIdx = Math.floor(scores.length / 2);
  const firstSd = stdDev(scores.slice(0, halfIdx));
  const secondSd = stdDev(scores.slice(halfIdx));
  const trend = secondSd < firstSd - 5 ? "improving" : secondSd > firstSd + 5 ? "deteriorating" : "stable";
  return { name: "Liquidity Stability", score, trend, warning, detail };
}

function stabilityLabelFromScore(score: number): StabilityLabel {
  if (score >= 75) return "very_stable";
  if (score >= 55) return "stable";
  if (score >= 35) return "unstable";
  return "very_unstable";
}

export function analyzeStability(
  snapshots: SnapshotRecord[],
  currentRegime: string,
  currentTrend: string,
  now = new Date(),
): StabilityAnalysis {
  const recent = snapshots.slice(-STABILITY_WINDOW);

  const regime = calcRegimeStability(recent, currentRegime);
  const trend = calcTrendStability(recent, currentTrend);
  const volatility = calcVolatilityStability(recent);
  const liquidity = calcLiquidityStability(recent);

  const overallStability = Math.round(
    regime.score * 0.30 +
    trend.score * 0.30 +
    volatility.score * 0.25 +
    liquidity.score * 0.15,
  );

  const label = stabilityLabelFromScore(overallStability);

  const warnings: string[] = [];
  if (regime.warning) warnings.push(`Regime instability: ${regime.detail}`);
  if (trend.warning) warnings.push(`Trend instability: ${trend.detail}`);
  if (volatility.warning) warnings.push(`Volatility instability: ${volatility.detail}`);
  if (liquidity.warning) warnings.push(`Liquidity instability: ${liquidity.detail}`);
  if (overallStability < 35) warnings.push("Overall market environment is highly unstable — proceed with caution");

  return {
    overallStability,
    label,
    regime,
    trend,
    volatility,
    liquidity,
    warnings,
    timestamp: now.toISOString(),
  };
}
