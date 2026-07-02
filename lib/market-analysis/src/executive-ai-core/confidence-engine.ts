// ─── Confidence Engine ────────────────────────────────────────────────────────
// Multi-dimensional confidence calculation for Executive AI decisions.

import type { EaiConfidence, EaiIntelligenceInput } from "./types.js";

function clamp(v: number): number { return Math.max(0, Math.min(100, v)); }

// ─── Statistical confidence ───────────────────────────────────────────────────
// Based on how many subsystems provided data and their sample sizes.

function computeStatistical(intel: EaiIntelligenceInput): number {
  let score = 0;
  let count = 0;
  if (intel.strategy)  { score += intel.strategy.executiveScore > 0 ? 80 : 40; count++; }
  if (intel.market)    { score += intel.market.healthScore > 0 ? 75 : 40; count++; }
  if (intel.risk)      { score += 85; count++; }  // ERB always produces data
  if (intel.memory)    { score += intel.memory.similarTradeCount > 5 ? 80 : intel.memory.similarTradeCount > 0 ? 60 : 30; count++; }
  if (intel.learning)  { score += intel.learning.sampleSize > 20 ? 80 : intel.learning.sampleSize > 5 ? 60 : 35; count++; }
  if (intel.identity)  { score += intel.identity.sampleSize > 10 ? 75 : intel.identity.sampleSize > 0 ? 55 : 30; count++; }
  return count > 0 ? clamp(score / count) : 40;
}

// ─── Data quality ─────────────────────────────────────────────────────────────

function computeDataQuality(intel: EaiIntelligenceInput): number {
  const systemsPresent = [intel.strategy, intel.market, intel.risk, intel.memory, intel.learning, intel.identity].filter(Boolean).length;
  return clamp((systemsPresent / 6) * 100);
}

// ─── Historical reliability ───────────────────────────────────────────────────

function computeHistoricalReliability(intel: EaiIntelligenceInput): number {
  let scores: number[] = [];
  if (intel.memory)   scores.push(intel.memory.historicalConfidence);
  if (intel.memory)   scores.push(intel.memory.historicalWinRate);
  if (intel.strategy) scores.push(intel.strategy.executiveScore);
  if (intel.identity) scores.push(intel.identity.historicalConsistency);
  if (scores.length === 0) return 50;
  return clamp(scores.reduce((a, b) => a + b, 0) / scores.length);
}

// ─── Market reliability ───────────────────────────────────────────────────────

function computeMarketReliability(intel: EaiIntelligenceInput): number {
  if (!intel.market) return 50;
  const stability = intel.market.marketStability;
  const liquidity  = intel.market.liquidity;
  const trend      = intel.market.trendStrength;
  return clamp((stability * 0.40 + liquidity * 0.35 + trend * 0.25));
}

// ─── System reliability ───────────────────────────────────────────────────────

function computeSystemReliability(intel: EaiIntelligenceInput): number {
  if (!intel.risk) return 70;
  return clamp(
    intel.risk.infrastructureScore * 0.40 +
    intel.risk.brokerReliabilityScore * 0.35 +
    (intel.risk.crisisStatus === "none" ? 100 : 40) * 0.25
  );
}

// ─── Reliability rating ───────────────────────────────────────────────────────

function reliabilityRating(overall: number): EaiConfidence["reliabilityRating"] {
  if (overall >= 75) return "high";
  if (overall >= 55) return "moderate";
  if (overall >= 35) return "low";
  return "insufficient";
}

// ─── Confidence interval (Wilson-inspired) ────────────────────────────────────

function confidenceInterval(score: number, reliability: number): { lower: number; upper: number } {
  const uncertainty = (100 - reliability) * 0.15;
  return {
    lower: clamp(score - uncertainty),
    upper: clamp(score + uncertainty),
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function computeConfidence(
  intel: EaiIntelligenceInput,
  compositeScore: number
): EaiConfidence {
  const statistical  = computeStatistical(intel);
  const dataQuality  = computeDataQuality(intel);
  const historical   = computeHistoricalReliability(intel);
  const market       = computeMarketReliability(intel);
  const system       = computeSystemReliability(intel);

  const overall = clamp(
    statistical * 0.25 +
    dataQuality * 0.20 +
    historical  * 0.25 +
    market      * 0.15 +
    system      * 0.15
  );

  return {
    overall,
    statistical,
    dataQuality,
    historicalReliability: historical,
    marketReliability:     market,
    systemReliability:     system,
    reliabilityRating:     reliabilityRating(overall),
    confidenceInterval:    confidenceInterval(compositeScore, overall),
  };
}
