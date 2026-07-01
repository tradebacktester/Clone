// ─── Recommendation Engine ────────────────────────────────────────────────────
// Generates individual parameter recommendations based on evidence.
// All recommendations stay within absolute safety limits.

import type {
  RiskProfile, RiskParameters, EnvironmentStats, ConfidenceResult, MarketContext,
} from "./types.js";
import { PROFILE_PARAMS, ABSOLUTE_SAFETY_LIMITS } from "./types.js";

export interface ParameterRecommendation {
  parameterName:    string;
  parameterLabel:   string;
  currentValue:     number | null;
  recommendedValue: number;
  changeDirection:  "increase" | "decrease" | "maintain";
  changeMagnitude:  number;      // % change from base
  reason:           string;
  evidenceSummary:  string;
  confidenceScore:  number;
  sampleSize:       number;
  marketRegime:     string;
  volatilityLevel:  string;
  session:          string;
  pair:             string;
  withinSafetyLimits: boolean;
  safetyNotes:      string;
  evidence:         object;
}

export function generateRecommendations(
  profile:    RiskProfile,
  params:     RiskParameters,
  context:    MarketContext,
  allStats:   EnvironmentStats[],
  confidence: ConfidenceResult,
  currentProfile: RiskProfile | null,
): ParameterRecommendation[] {
  const base        = PROFILE_PARAMS[profile];
  const recList: ParameterRecommendation[] = [];

  // Helper to build one recommendation
  function rec(
    parameterName: string,
    parameterLabel: string,
    recommended: number,
    limit: number,
    reason: string,
  ): ParameterRecommendation {
    const safeValue  = Math.min(recommended, limit);
    const baseValue  = (base as any)[parameterName] as number;
    const magnitude  = baseValue > 0 ? Math.abs((safeValue - baseValue) / baseValue) * 100 : 0;
    const direction  = safeValue > (baseValue ?? safeValue)
      ? "increase" : safeValue < (baseValue ?? safeValue)
      ? "decrease" : "maintain";

    const top = allStats.sort((a, b) => b.sampleSize - a.sampleSize).slice(0, 2);
    const evidenceSummary = top.length > 0
      ? top.map(s => `${s.environment}="${s.environmentKey}" (${s.riskRating}, n=${s.sampleSize})`).join("; ")
      : "Insufficient specific evidence";

    return {
      parameterName,
      parameterLabel,
      currentValue:     null,
      recommendedValue: Math.round(safeValue * 100) / 100,
      changeDirection:  direction,
      changeMagnitude:  Math.round(magnitude * 10) / 10,
      reason,
      evidenceSummary,
      confidenceScore:  confidence.score,
      sampleSize:       confidence.sampleSize,
      marketRegime:     context.regime,
      volatilityLevel:  context.volatilityLevel,
      session:          context.session,
      pair:             context.pair,
      withinSafetyLimits: safeValue <= limit,
      safetyNotes: safeValue === limit ? `Capped at absolute safety limit of ${limit}` : "",
      evidence:    { stats: top, context },
    };
  }

  const compositeRisk = allStats.length > 0
    ? allStats.reduce((s, v) => s + v.riskScore, 0) / allStats.length
    : 50;

  recList.push(rec(
    "maxRiskPerTrade", "Max Risk Per Trade (%)",
    params.maxRiskPerTrade,
    ABSOLUTE_SAFETY_LIMITS.maxRiskPerTrade,
    compositeRisk >= 65
      ? `Favorable conditions support ${params.maxRiskPerTrade}% risk per trade`
      : `Elevated risk environment warrants reduced risk to ${params.maxRiskPerTrade}%`,
  ));

  recList.push(rec(
    "maxOpenTrades", "Max Concurrent Open Trades",
    params.maxOpenTrades,
    ABSOLUTE_SAFETY_LIMITS.maxOpenTrades,
    `${profile} profile limits concurrent exposure to ${params.maxOpenTrades} trades`,
  ));

  recList.push(rec(
    "dailyRiskBudget", "Daily Risk Budget (%)",
    params.dailyRiskBudget,
    ABSOLUTE_SAFETY_LIMITS.dailyRiskBudget,
    context.newsRisk > 50
      ? `Elevated news risk reduces daily budget to ${params.dailyRiskBudget}%`
      : `${profile} profile daily risk budget: ${params.dailyRiskBudget}%`,
  ));

  recList.push(rec(
    "positionSizeMultiplier", "Position Size Multiplier",
    params.positionSizeMultiplier,
    ABSOLUTE_SAFETY_LIMITS.positionSizeMultiplier,
    `Size multiplier of ${params.positionSizeMultiplier}x matches current risk evidence`,
  ));

  recList.push(rec(
    "maxPairExposure", "Max Pair Exposure (%)",
    params.maxPairExposure,
    ABSOLUTE_SAFETY_LIMITS.maxPairExposure,
    `Pair concentration capped at ${params.maxPairExposure}% for ${context.regime} regime`,
  ));

  recList.push(rec(
    "weeklyRiskBudget", "Weekly Risk Budget (%)",
    params.weeklyRiskBudget,
    ABSOLUTE_SAFETY_LIMITS.weeklyRiskBudget,
    `Weekly budget of ${params.weeklyRiskBudget}% maintains ${profile} profile discipline`,
  ));

  return recList;
}
