// ─── Profile Engine ───────────────────────────────────────────────────────────
// Selects the optimal risk profile based on multi-dimensional evidence.
// Advisory only — NEVER modifies strategy or entry/exit rules.

import type {
  RiskProfile, MarketContext, EnvironmentStats, RiskParameters,
  ConfidenceResult,
} from "./types.js";
import {
  PROFILE_PARAMS, ABSOLUTE_SAFETY_LIMITS, RISK_PROFILE_LABELS,
} from "./types.js";

export interface ProfileSelection {
  profile:      RiskProfile;
  label:        string;
  params:       RiskParameters;
  score:        number;     // composite 0-100
  reason:       string;
  factors:      string[];
}

// ─── Main selection logic ─────────────────────────────────────────────────────

export function selectProfile(
  context:     MarketContext,
  allStats:    EnvironmentStats[],
  confidence:  ConfidenceResult,
  currentProfile: RiskProfile | null,
  userLimits?: Partial<RiskParameters>,
): ProfileSelection {

  // 1. Compute composite score from available environment stats
  const composite = computeCompositeScore(context, allStats);

  // 2. Determine base profile from composite + context
  let profile = mapScoreToProfile(composite, confidence, context);

  // 3. Override with protective profiles if needed
  profile = applyProtectiveOverrides(profile, context, confidence);

  // 4. Merge with user safety limits
  const params = applyUserLimits(PROFILE_PARAMS[profile], userLimits);

  // 5. Build explanation
  const { reason, factors } = buildProfileReason(profile, composite, context, allStats, confidence);

  return {
    profile,
    label:  RISK_PROFILE_LABELS[profile],
    params,
    score:  composite,
    reason,
    factors,
  };
}

// ─── Score computation ────────────────────────────────────────────────────────

function computeCompositeScore(context: MarketContext, stats: EnvironmentStats[]): number {
  if (stats.length === 0) return 50;

  // Dimension weights
  const weights: Record<string, number> = {
    regime:     0.25,
    volatility: 0.20,
    session:    0.20,
    pair:       0.20,
    liquidity:  0.10,
    condition:  0.05,
  };

  let totalWeight = 0;
  let weightedSum = 0;

  for (const stat of stats) {
    const w = weights[stat.environment] ?? 0.05;
    const sampleWeight = Math.min(1, stat.sampleSize / 30);
    const effectiveW   = w * sampleWeight;
    weightedSum  += stat.riskScore * effectiveW;
    totalWeight  += effectiveW;
  }

  const baseScore = totalWeight > 0 ? weightedSum / totalWeight : 50;

  // Context adjustments
  let adj = 0;
  if (context.newsRisk      > 70) adj -= 15;
  else if (context.newsRisk > 50) adj -= 7;
  if (context.volatilityScore > 80) adj -= 10;
  if (context.liquidityScore  < 30) adj -= 8;

  return Math.max(0, Math.min(100, Math.round(baseScore + adj)));
}

// ─── Score → Profile mapping ──────────────────────────────────────────────────

function mapScoreToProfile(
  score:      number,
  confidence: ConfidenceResult,
  context:    MarketContext,
): RiskProfile {
  // Without sufficient data → observation
  if (!confidence.hasMinimumEvidence) return "observation";

  if (score >= 75) return confidence.score >= 50 ? "aggressive"    : "balanced";
  if (score >= 60) return "balanced";
  if (score >= 45) return "conservative";
  if (score >= 30) return "observation";
  if (score >= 15) return "recovery";
  return "emergency";
}

// ─── Protective overrides ─────────────────────────────────────────────────────

function applyProtectiveOverrides(
  profile:    RiskProfile,
  context:    MarketContext,
  confidence: ConfidenceResult,
): RiskProfile {
  // Extreme volatility → at most conservative
  if (context.volatilityLevel === "extreme") {
    if (profile === "aggressive" || profile === "balanced") return "conservative";
  }

  // Very high news risk → observation minimum
  if (context.newsRisk > 85) {
    const order: RiskProfile[] = ["emergency", "observation", "recovery", "conservative", "balanced", "aggressive"];
    if (order.indexOf(profile) > order.indexOf("observation")) return "observation";
  }

  // Very low liquidity → conservative minimum
  if (context.liquidityLevel === "low") {
    if (profile === "aggressive") return "balanced";
  }

  // Very low confidence with aggressive → step down
  if (confidence.score < 30 && profile === "aggressive") return "balanced";
  if (confidence.score < 20 && profile === "balanced")   return "conservative";

  return profile;
}

// ─── Safety limit application ─────────────────────────────────────────────────

function applyUserLimits(
  base:   RiskParameters,
  limits?: Partial<RiskParameters>,
): RiskParameters {
  if (!limits) return base;
  const merged: RiskParameters = { ...base };

  if (limits.maxRiskPerTrade        != null)
    merged.maxRiskPerTrade = Math.min(base.maxRiskPerTrade, limits.maxRiskPerTrade, ABSOLUTE_SAFETY_LIMITS.maxRiskPerTrade);
  if (limits.maxOpenTrades          != null)
    merged.maxOpenTrades = Math.min(base.maxOpenTrades, limits.maxOpenTrades, ABSOLUTE_SAFETY_LIMITS.maxOpenTrades);
  if (limits.maxPairExposure        != null)
    merged.maxPairExposure = Math.min(base.maxPairExposure, limits.maxPairExposure, ABSOLUTE_SAFETY_LIMITS.maxPairExposure);
  if (limits.maxCorrelationExposure != null)
    merged.maxCorrelationExposure = Math.min(base.maxCorrelationExposure, limits.maxCorrelationExposure, ABSOLUTE_SAFETY_LIMITS.maxCorrelationExposure);
  if (limits.dailyRiskBudget        != null)
    merged.dailyRiskBudget = Math.min(base.dailyRiskBudget, limits.dailyRiskBudget, ABSOLUTE_SAFETY_LIMITS.dailyRiskBudget);
  if (limits.weeklyRiskBudget       != null)
    merged.weeklyRiskBudget = Math.min(base.weeklyRiskBudget, limits.weeklyRiskBudget, ABSOLUTE_SAFETY_LIMITS.weeklyRiskBudget);
  if (limits.positionSizeMultiplier != null)
    merged.positionSizeMultiplier = Math.min(base.positionSizeMultiplier, limits.positionSizeMultiplier, ABSOLUTE_SAFETY_LIMITS.positionSizeMultiplier);
  if (limits.exposureMultiplier     != null)
    merged.exposureMultiplier = Math.min(base.exposureMultiplier, limits.exposureMultiplier, ABSOLUTE_SAFETY_LIMITS.exposureMultiplier);

  return merged;
}

// ─── Reason builder ───────────────────────────────────────────────────────────

function buildProfileReason(
  profile:    RiskProfile,
  score:      number,
  context:    MarketContext,
  stats:      EnvironmentStats[],
  confidence: ConfidenceResult,
): { reason: string; factors: string[] } {
  const factors: string[] = [];

  // Primary driver
  const topStat = stats.sort((a, b) => b.sampleSize - a.sampleSize)[0];
  let reason = `Composite risk score of ${score}/100 across ${stats.length} market dimensions`;

  if (!confidence.hasMinimumEvidence) {
    reason = `Insufficient historical data (${confidence.sampleSize} trades). Observation mode selected for safety.`;
    factors.push("Minimum evidence threshold not met");
    return { reason, factors };
  }

  if (topStat) {
    factors.push(`${topStat.environment} "${topStat.environmentKey}": ${topStat.riskRating} (score ${topStat.riskScore})`);
  }

  if (context.volatilityLevel === "extreme") factors.push("Extreme volatility detected — profile capped");
  if (context.newsRisk > 70)                 factors.push(`High news risk (${context.newsRisk}%) — exposure reduced`);
  if (context.liquidityLevel === "low")      factors.push("Low liquidity — spread risk elevated");
  if (context.regime === "volatile")         factors.push("Volatile market regime — caution advised");

  const favorable = stats.filter(s => s.riskRating === "favorable").length;
  const avoid     = stats.filter(s => s.riskRating === "avoid").length;

  if (favorable > 0) factors.push(`${favorable} environment(s) rated favorable for trading`);
  if (avoid > 0)     factors.push(`${avoid} environment(s) rated avoid — risk reduced`);

  factors.push(`Confidence: ${confidence.label} (${confidence.score}/100) from ${confidence.sampleSize} trades`);

  return { reason, factors };
}
