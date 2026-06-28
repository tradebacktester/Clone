// ─── Feature Calculator ────────────────────────────────────────────────────────
// Computes per-feature importance statistics from ExtractedFeature arrays.
// Advisory only — no trading decisions.

import type { ExtractedFeature } from "../learning-core/types.js";
import { clamp } from "../learning-validation/data-validator.js";
import { wilsonLowerBound } from "../learning-confidence/confidence-engine.js";
import type {
  FeatureId,
  FeatureDefinition,
  FeatureImportanceResult,
  BucketStats,
  OverfittingRisk,
  ConfidenceTier,
  ReliabilityRating,
  ConfidenceTrendDirection,
} from "./types.js";
import {
  FEATURE_DEFINITIONS,
  FI_ENGINE_VERSION,
  MIN_SAMPLE_SIZE,
  SUFFICIENT_SAMPLE_SIZE,
} from "./types.js";

// ─── Bucket assignment ─────────────────────────────────────────────────────────

function bucketNumeric(value: number, thresholds: [number, number]): "low" | "medium" | "high" {
  if (value <= thresholds[0]) return "low";
  if (value <= thresholds[1]) return "medium";
  return "high";
}

// ─── Feature value extraction from ExtractedFeature ───────────────────────────

function getFeatureValue(feature: ExtractedFeature, featureId: FeatureId): string {
  switch (featureId) {
    case "supply_zone_quality":
      return bucketNumeric(feature.supplyQuality, [40, 70]);
    case "demand_zone_quality":
      return bucketNumeric(feature.demandQuality, [40, 70]);
    case "premium_discount_position": {
      // Use tqi as a proxy: > 60 = premium opportunity, < 40 = discount opportunity
      const score = feature.tqi;
      if (score >= 60) return "premium";
      if (score <= 40) return "discount";
      return "equilibrium";
    }
    case "liquidity_sweep_strength":
      return bucketNumeric(feature.liquidityScore, [35, 65]);
    case "amd_quality":
      return bucketNumeric(feature.amdScore, [40, 70]);
    case "confirmation_candle_quality":
      return bucketNumeric(feature.confirmationQuality, [40, 70]);
    case "htf_alignment":
      // Use setupScore as HTF alignment proxy
      return bucketNumeric(feature.setupScore, [40, 70]);
    case "trend_direction":
      return feature.trend;
    case "market_regime":
      return feature.marketRegime;
    case "session":
      return feature.session;
    case "volatility":
      return feature.volatility;
    case "spread":
      // Invert: low spread = high, high spread = low (favorable = low spread)
      return bucketNumeric(feature.spreadPips, [1, 2.5]);
    case "news_distance":
      // Larger is safer: use RR as proxy when news distance not stored
      return bucketNumeric(feature.rrPlanned, [1, 4]);
    case "risk_reward_ratio":
      return bucketNumeric(feature.rrPlanned, [1.5, 3]);
    case "trade_duration":
      return bucketNumeric(feature.tradeDurationMins, [30, 240]);
    case "position_size":
      return bucketNumeric(feature.riskPct || 1, [0.5, 1.5]);
    case "correlation_exposure":
      // Use tqi as proxy: high tqi = low corr exposure
      return bucketNumeric(feature.tqi, [30, 60]);
    default:
      return "unknown";
  }
}

// ─── Numeric value extraction (for correlation) ───────────────────────────────

function getNumericValue(feature: ExtractedFeature, featureId: FeatureId): number {
  switch (featureId) {
    case "supply_zone_quality":      return feature.supplyQuality;
    case "demand_zone_quality":      return feature.demandQuality;
    case "premium_discount_position": return feature.tqi;
    case "liquidity_sweep_strength": return feature.liquidityScore;
    case "amd_quality":              return feature.amdScore;
    case "confirmation_candle_quality": return feature.confirmationQuality;
    case "htf_alignment":            return feature.setupScore;
    case "trend_direction":          return feature.trend === "bullish" ? 1 : feature.trend === "bearish" ? -1 : 0;
    case "market_regime":            return feature.marketRegime === "trending" ? 1 : feature.marketRegime === "ranging" ? 0.5 : 0;
    case "session":                  return feature.session === "london" ? 1 : feature.session === "new_york" ? 0.8 : 0.3;
    case "volatility":               return feature.volatility === "low" ? 0 : feature.volatility === "medium" ? 0.5 : 1;
    case "spread":                   return feature.spreadPips;
    case "news_distance":            return feature.rrPlanned;
    case "risk_reward_ratio":        return feature.rrPlanned;
    case "trade_duration":           return feature.tradeDurationMins;
    case "position_size":            return feature.riskPct || 1;
    case "correlation_exposure":     return feature.tqi;
    default:                         return 0;
  }
}

// ─── Bucket stats ──────────────────────────────────────────────────────────────

function computeBucketStats(group: ExtractedFeature[], label: string): BucketStats {
  const n = group.length;
  const wins   = group.filter(f => f.outcome === "win").length;
  const losses = group.filter(f => f.outcome === "loss").length;
  const breakEvens = group.filter(f => f.outcome === "break_even").length;
  const winRate  = n > 0 ? wins / n : 0;
  const lossRate = n > 0 ? losses / n : 0;
  const winTrades  = group.filter(f => f.outcome === "win");
  const lossTrades = group.filter(f => f.outcome === "loss");
  const avgRR     = n > 0 ? group.reduce((s, f) => s + f.rrActual, 0) / n : 0;
  const avgProfit = winTrades.length > 0 ? winTrades.reduce((s, f) => s + f.pnl, 0) / winTrades.length : 0;
  const avgLoss   = lossTrades.length > 0 ? Math.abs(lossTrades.reduce((s, f) => s + f.pnl, 0) / lossTrades.length) : 0;
  const totalPnl  = group.reduce((s, f) => s + f.pnl, 0);
  return { label, sampleSize: n, wins, losses, breakEvens, winRate, lossRate, avgRR, avgProfit, avgLoss, totalPnl };
}

// ─── Point-biserial correlation ────────────────────────────────────────────────
// Measures linear correlation between a continuous feature and binary outcome.

function pointBiserialCorrelation(features: ExtractedFeature[], featureId: FeatureId): number {
  const n = features.length;
  if (n < MIN_SAMPLE_SIZE) return 0;

  const values = features.map(f => getNumericValue(f, featureId));
  const outcomes = features.map(f => (f.outcome === "win" ? 1 : 0));

  const meanAll = values.reduce((s, v) => s + v, 0) / n;
  const winIdx  = outcomes.reduce<number[]>((acc, o, i) => { if (o === 1) acc.push(i); return acc; }, []);
  const lossIdx = outcomes.reduce<number[]>((acc, o, i) => { if (o === 0) acc.push(i); return acc; }, []);
  const n1 = winIdx.length;
  const n0 = lossIdx.length;
  if (n1 === 0 || n0 === 0) return 0;

  const meanWin  = winIdx.reduce((s, i) => s + values[i], 0) / n1;
  const meanLoss = lossIdx.reduce((s, i) => s + values[i], 0) / n0;

  const variance = values.reduce((s, v) => s + (v - meanAll) ** 2, 0) / n;
  const stdAll = Math.sqrt(variance);
  if (stdAll === 0) return 0;

  const r = ((meanWin - meanLoss) / stdAll) * Math.sqrt((n1 * n0) / (n * n));
  return clamp(r, -1, 1);
}

// ─── Chi-square style significance for categorical ─────────────────────────────

function categoricalSignificance(buckets: BucketStats[]): { significance: number; pValue: number } {
  const total = buckets.reduce((s, b) => s + b.sampleSize, 0);
  if (total < MIN_SAMPLE_SIZE) return { significance: 0, pValue: 1 };

  const totalWins = buckets.reduce((s, b) => s + b.wins, 0);
  const expectedWinRate = total > 0 ? totalWins / total : 0;

  let chiSquare = 0;
  for (const b of buckets) {
    if (b.sampleSize === 0) continue;
    const expectedWins = b.sampleSize * expectedWinRate;
    const expectedLoss = b.sampleSize * (1 - expectedWinRate);
    if (expectedWins > 0) chiSquare += (b.wins - expectedWins) ** 2 / expectedWins;
    if (expectedLoss > 0) chiSquare += (b.losses - expectedLoss) ** 2 / expectedLoss;
  }

  // Approximate p-value from chi-square (df = buckets-1), using normal approximation
  const df = Math.max(1, buckets.length - 1);
  const z = Math.sqrt(2 * chiSquare) - Math.sqrt(2 * df - 1);
  const pValue = clamp(1 - normalCdf(z), 0, 1);
  const significance = clamp(1 - pValue, 0, 1);
  return { significance, pValue };
}

function normalCdf(z: number): number {
  // Abramowitz and Stegun approximation
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

// ─── Predictive value ──────────────────────────────────────────────────────────
// 0–100. Combines correlation strength with statistical significance.

function computePredictiveValue(corrCoeff: number, significance: number, sampleSize: number): number {
  const absCorr = Math.abs(corrCoeff);
  const sampleFactor = clamp(sampleSize / SUFFICIENT_SAMPLE_SIZE, 0, 1);
  const raw = (absCorr * 0.5 + significance * 0.35 + sampleFactor * 0.15) * 100;
  return clamp(Math.round(raw * 10) / 10, 0, 100);
}

// ─── Reliability score ─────────────────────────────────────────────────────────
// Wilson lower bound × consistency factor.

function computeReliabilityScore(buckets: BucketStats[], totalN: number): number {
  if (totalN < MIN_SAMPLE_SIZE) return 0;
  const totalWins = buckets.reduce((s, b) => s + b.wins, 0);
  const wilson = wilsonLowerBound(totalWins, totalN);

  // Consistency: low variance of win rates across buckets
  const rates = buckets.filter(b => b.sampleSize >= 2).map(b => b.winRate);
  if (rates.length === 0) return clamp(wilson * 100, 0, 100);
  const meanRate = rates.reduce((s, r) => s + r, 0) / rates.length;
  const variance = rates.reduce((s, r) => s + (r - meanRate) ** 2, 0) / rates.length;
  const stdDev   = Math.sqrt(variance);
  const consistency = clamp(1 - stdDev * 2, 0.1, 1);

  return clamp((wilson * consistency) * 100, 0, 100);
}

// ─── Confidence score ──────────────────────────────────────────────────────────

function computeConfidenceScore(
  n: number,
  predictiveValue: number,
  reliabilityScore: number,
  significance: number,
): number {
  if (n < MIN_SAMPLE_SIZE) return 0;
  const sampleBonus = clamp(n / SUFFICIENT_SAMPLE_SIZE, 0, 1) * 100;
  const score = predictiveValue * 0.35 + reliabilityScore * 0.35 + significance * 50 * 0.2 + sampleBonus * 0.1;
  return clamp(Math.round(score * 10) / 10, 0, 100);
}

function toConfidenceTier(score: number, n: number): ConfidenceTier {
  if (n < MIN_SAMPLE_SIZE) return "insufficient";
  if (score < 25) return "low";
  if (score < 50) return "moderate";
  if (score < 75) return "high";
  return "very_high";
}

function toReliabilityRating(score: number, n: number): ReliabilityRating {
  if (n < MIN_SAMPLE_SIZE) return "insufficient";
  if (score >= 70 && n >= SUFFICIENT_SAMPLE_SIZE) return "institutional";
  if (score >= 55) return "strong";
  if (score >= 35) return "moderate";
  if (score >= 15) return "weak";
  return "insufficient";
}

function buildExplanation(
  featureId: FeatureId,
  displayName: string,
  n: number,
  winRate: number,
  corrCoeff: number,
  predictiveValue: number,
  confidenceScore: number,
  tier: ConfidenceTier,
  significancePct: number,
): string {
  const corrDir = corrCoeff > 0.05 ? "positively" : corrCoeff < -0.05 ? "negatively" : "minimally";
  return (
    `[${displayName}] Analyzed ${n} trades. ` +
    `Win rate: ${(winRate * 100).toFixed(1)}%. ` +
    `${displayName} is ${corrDir} correlated with profitable outcomes (r=${corrCoeff.toFixed(3)}). ` +
    `Statistical significance: ${(significancePct * 100).toFixed(1)}%. ` +
    `Predictive value: ${predictiveValue.toFixed(1)}/100. ` +
    `Confidence: ${confidenceScore.toFixed(1)}/100 (${tier}). ` +
    (n < SUFFICIENT_SAMPLE_SIZE
      ? `${SUFFICIENT_SAMPLE_SIZE - n} more trades needed to reach sufficient sample size.`
      : "Sample size is sufficient for statistical conclusions.")
  );
}

// ─── Main feature calculator ──────────────────────────────────────────────────

export function calculateFeatureImportance(
  features: ExtractedFeature[],
): FeatureImportanceResult[] {
  const results: FeatureImportanceResult[] = [];

  for (const def of FEATURE_DEFINITIONS) {
    results.push(calculateSingleFeature(features, def));
  }

  return results;
}

export function calculateSingleFeature(
  features: ExtractedFeature[],
  def: FeatureDefinition,
): FeatureImportanceResult {
  const n = features.length;

  // Group features by bucket/category value
  const groups = new Map<string, ExtractedFeature[]>();
  for (const f of features) {
    const v = getFeatureValue(f, def.id);
    if (!groups.has(v)) groups.set(v, []);
    groups.get(v)!.push(f);
  }

  const buckets: BucketStats[] = [];
  for (const [label, group] of groups.entries()) {
    buckets.push(computeBucketStats(group, label));
  }

  // Aggregate stats
  const wins       = features.filter(f => f.outcome === "win").length;
  const losses     = features.filter(f => f.outcome === "loss").length;
  const breakEvens = features.filter(f => f.outcome === "break_even").length;
  const winRate    = n > 0 ? wins / n : 0;
  const lossRate   = n > 0 ? losses / n : 0;
  const winTrades  = features.filter(f => f.outcome === "win");
  const lossTrades = features.filter(f => f.outcome === "loss");
  const avgRR      = n > 0 ? features.reduce((s, f) => s + f.rrActual, 0) / n : 0;
  const avgProfit  = winTrades.length > 0 ? winTrades.reduce((s, f) => s + f.pnl, 0) / winTrades.length : 0;
  const avgLoss    = lossTrades.length > 0 ? Math.abs(lossTrades.reduce((s, f) => s + f.pnl, 0) / lossTrades.length) : 0;

  // Correlation
  const corrCoeff = pointBiserialCorrelation(features, def.id);

  // Significance
  const { significance, pValue } = categoricalSignificance(buckets);

  // Derived scores
  const predictiveValue  = computePredictiveValue(corrCoeff, significance, n);
  const reliabilityScore = computeReliabilityScore(buckets, n);
  const confidenceScore  = computeConfidenceScore(n, predictiveValue, reliabilityScore, significance);

  const isInsufficient = n < MIN_SAMPLE_SIZE;
  const tier = toConfidenceTier(confidenceScore, n);
  const reliabilityRating = toReliabilityRating(reliabilityScore, n);

  // Overfitting risk: high when very few samples but high score
  let overfittingRisk: OverfittingRisk = "none";
  if (n < 10 && predictiveValue > 60) overfittingRisk = "high";
  else if (n < 20 && predictiveValue > 70) overfittingRisk = "medium";
  else if (n < SUFFICIENT_SAMPLE_SIZE && predictiveValue > 80) overfittingRisk = "low";

  // Contradiction: high correlation but low win rate, or vice versa
  const hasContradiction = corrCoeff > 0.3 && winRate < 0.3 || corrCoeff < -0.3 && winRate > 0.7;
  const contradictionNote = hasContradiction
    ? `Correlation (${corrCoeff.toFixed(2)}) contradicts win rate (${(winRate * 100).toFixed(1)}%)`
    : undefined;

  // Instability: high variance in bucket win rates
  const bucketRates = buckets.filter(b => b.sampleSize >= 2).map(b => b.winRate);
  const meanBucketRate = bucketRates.length > 0 ? bucketRates.reduce((s, r) => s + r, 0) / bucketRates.length : 0;
  const bucketVariance = bucketRates.length > 1
    ? bucketRates.reduce((s, r) => s + (r - meanBucketRate) ** 2, 0) / bucketRates.length
    : 0;
  const isUnstable = Math.sqrt(bucketVariance) > 0.35;
  const instabilityNote = isUnstable
    ? `High win rate variance across buckets (stddev=${(Math.sqrt(bucketVariance) * 100).toFixed(1)}%)`
    : undefined;

  const confidenceExplanation = buildExplanation(
    def.id, def.displayName, n, winRate, corrCoeff,
    predictiveValue, confidenceScore, tier, significance,
  );

  return {
    featureId: def.id,
    displayName: def.displayName,
    category: def.category,
    description: def.description,
    dataType: def.dataType,
    sampleSize: n,
    wins,
    losses,
    breakEvens,
    winRate,
    lossRate,
    avgRR,
    avgProfit,
    avgLoss,
    statisticalSignificance: significance,
    pValue,
    correlationCoeff: corrCoeff,
    predictiveValue,
    reliabilityScore,
    confidenceScore,
    isInsufficient,
    insufficientReason: isInsufficient ? `Only ${n} samples — minimum ${MIN_SAMPLE_SIZE} required` : undefined,
    hasContradiction,
    contradictionNote,
    isUnstable,
    instabilityNote,
    overfittingRisk,
    confidenceExplanation,
    confidenceTrend: "unknown" as const,      // updated by history store after multiple cycles
    reliabilityRating,
    confidenceTier: tier,
    bucketBreakdown: buckets,
    supportingTradeIds: features.map(f => f.tradeId),
  };
}
