// ─── Decision Engine ──────────────────────────────────────────────────────────
// Produces the final Executive Decision from weighted scores + vetoes.

import type {
  EaiDecisionType,
  EaiScoreBreakdown,
  EaiDimensionScore,
  EaiContribution,
  EaiWeights,
  StrategyIntelligence,
  MarketIntelligence,
  RiskIntelligence,
  MemoryIntelligence,
  LearningIntelligence,
  IdentityIntelligence,
  ResearchIntelligence,
  EaiConflict,
} from "./types.js";
import {
  DECISION_LABELS,
  DECISION_DESCRIPTIONS,
  DECISION_THRESHOLD,
} from "./types.js";
import type { WeightedDimension } from "./weighting-engine.js";

function clamp(v: number): number { return Math.max(0, Math.min(100, v)); }
function r1(v: number): number { return Math.round(v * 10) / 10; }

// ─── Convert raw intelligence to normalised 0-100 scores ─────────────────────

export interface DimensionScores {
  strategy: number;
  market: number;
  risk: number;      // safety score: 100 - riskScore
  memory: number;
  learning: number;
  identity: number;
  research: number;
}

export function computeDimensionScores(
  strategy:  StrategyIntelligence,
  market:    MarketIntelligence,
  risk:      RiskIntelligence,
  memory:    MemoryIntelligence,
  learning:  LearningIntelligence,
  identity:  IdentityIntelligence,
  research:  ResearchIntelligence
): DimensionScores {
  // Strategy: composite of executive score, strength, quality
  const strategyScore = clamp(
    strategy.executiveScore   * 0.40 +
    strategy.strategyStrength * 0.30 +
    strategy.rulePassRate     * 0.20 +
    strategy.ruleQualityScore * 0.10
  );

  // Market: higher health/opportunity is better (flip volatility penalty)
  const marketScore = clamp(
    market.healthScore       * 0.35 +
    market.opportunityScore  * 0.30 +
    market.marketStability   * 0.20 +
    (100 - market.volatility) * 0.15
  );

  // Risk: invert overallRiskScore so higher = safer
  const riskSafetyScore = clamp(
    (100 - risk.overallRiskScore) * 0.40 +
    risk.survivalScore            * 0.25 +
    risk.capitalHealthScore       * 0.20 +
    risk.brokerReliabilityScore   * 0.15
  );

  // Memory: historical win rate + pattern frequency + confidence
  const memoryScore = clamp(
    memory.historicalWinRate    * 0.35 +
    memory.historicalConfidence * 0.30 +
    memory.positiveOutcomeRate  * 0.20 +
    memory.patternFrequency     * 0.15
  );

  // Learning: confidence + reliability + drift bonus
  const driftBonus = Math.max(0, Math.min(10, learning.performanceDrift * 0.1));
  const learningScore = clamp(
    learning.overallConfidence       * 0.40 +
    learning.patternPerformanceScore * 0.30 +
    learning.predictionReliability   * 0.20 +
    driftBonus                       * 10 * 0.10
  );

  // Identity: alignment + consistency + confidence
  const identityScore = clamp(
    identity.identitySimilarityScore  * 0.35 +
    identity.preferenceAlignmentScore * 0.35 +
    identity.historicalConsistency    * 0.20 +
    identity.identityConfidence       * 0.10
  );

  // Research: advisory weight, experimental success bonus
  const researchBonus = research.experimentalResults === "positive" ? 10 : 0;
  const researchScore = clamp(research.researchConfidence * 0.8 + researchBonus);

  return {
    strategy: r1(strategyScore),
    market:   r1(marketScore),
    risk:     r1(riskSafetyScore),
    memory:   r1(memoryScore),
    learning: r1(learningScore),
    identity: r1(identityScore),
    research: r1(researchScore),
  };
}

// ─── Veto logic ───────────────────────────────────────────────────────────────

export function applyVetoes(
  composite: number,
  risk: RiskIntelligence,
  conflicts: EaiConflict[]
): { vetoed: boolean; vetoReason: string | null; adjustedScore: number } {
  // Hard veto 1: Emergency halt
  if (risk.crisisStatus === "emergency" || risk.survivalModeActive) {
    return {
      vetoed: true,
      vetoReason: `Emergency condition active (crisis=${risk.crisisStatus}, survivalMode=${risk.survivalModeActive})`,
      adjustedScore: 5,
    };
  }

  // Hard veto 2: ERB says emergency_stop or survival_mode
  if (risk.recommendation === "emergency_stop") {
    return {
      vetoed: true,
      vetoReason: `ERB emergency_stop recommendation — all trading halted`,
      adjustedScore: 5,
    };
  }
  if (risk.recommendation === "survival_mode") {
    return {
      vetoed: true,
      vetoReason: `ERB survival_mode active — pause trading enforced`,
      adjustedScore: 18,
    };
  }

  // Soft veto 3: High overall risk score caps the composite
  if (risk.overallRiskScore > 70) {
    const cap = clamp(100 - risk.overallRiskScore);
    if (composite > cap + 20) {
      return {
        vetoed: true,
        vetoReason: `ERB risk score ${risk.overallRiskScore.toFixed(0)} caps composite to ${cap.toFixed(0)}`,
        adjustedScore: Math.min(composite, cap + 20),
      };
    }
  }

  // Soft veto 4: Critical conflicts
  const criticalConflicts = conflicts.filter(c => c.severity === "critical");
  if (criticalConflicts.length > 0 && composite > 65) {
    const adjusted = composite * 0.75;
    return {
      vetoed: true,
      vetoReason: `${criticalConflicts.length} critical conflict(s) detected — composite dampened`,
      adjustedScore: clamp(adjusted),
    };
  }

  return { vetoed: false, vetoReason: null, adjustedScore: composite };
}

// ─── Map score → decision ─────────────────────────────────────────────────────

export function scoreToDecision(score: number): EaiDecisionType {
  if (score >= DECISION_THRESHOLD.trade)          return "trade";
  if (score >= DECISION_THRESHOLD.wait)           return "wait";
  if (score >= DECISION_THRESHOLD.observe)        return "observe";
  if (score >= DECISION_THRESHOLD.reduce_risk)    return "reduce_risk";
  if (score >= DECISION_THRESHOLD.pause_trading)  return "pause_trading";
  return "emergency_halt";
}

// ─── Build score breakdown ────────────────────────────────────────────────────

export function buildScoreBreakdown(
  dims: DimensionScores,
  weights: EaiWeights,
  weightedDims: WeightedDimension[],
  composite: number,
  vetoed: boolean,
  vetoReason: string | null
): EaiScoreBreakdown {
  function dataQuality(score: number): EaiDimensionScore["dataQuality"] {
    if (score > 65) return "strong";
    if (score > 45) return "moderate";
    if (score > 25) return "weak";
    return "missing";
  }

  return {
    strategy: {
      label: "Strategy Intelligence",
      raw: dims.strategy,
      weight: weights.strategy,
      weighted: r1(dims.strategy * weights.strategy),
      dataQuality: dataQuality(dims.strategy),
      trend: dims.strategy > 65 ? "improving" : dims.strategy > 45 ? "stable" : "degrading",
      calculation: `executiveScore×0.40 + strategyStrength×0.30 + rulePassRate×0.20 + ruleQuality×0.10`,
    },
    market: {
      label: "Market Intelligence",
      raw: dims.market,
      weight: weights.market,
      weighted: r1(dims.market * weights.market),
      dataQuality: dataQuality(dims.market),
      trend: dims.market > 60 ? "stable" : "degrading",
      calculation: `healthScore×0.35 + opportunity×0.30 + stability×0.20 + (100-volatility)×0.15`,
    },
    risk: {
      label: "Risk Intelligence (Safety)",
      raw: dims.risk,
      weight: weights.risk,
      weighted: r1(dims.risk * weights.risk),
      dataQuality: "strong",
      trend: dims.risk > 65 ? "stable" : "degrading",
      calculation: `(100-ERBrisk)×0.40 + survival×0.25 + capitalHealth×0.20 + brokerReliability×0.15`,
    },
    memory: {
      label: "Memory Intelligence",
      raw: dims.memory,
      weight: weights.memory,
      weighted: r1(dims.memory * weights.memory),
      dataQuality: dataQuality(dims.memory),
      trend: "stable",
      calculation: `historicalWinRate×0.35 + confidence×0.30 + positiveOutcomeRate×0.20 + frequency×0.15`,
    },
    learning: {
      label: "Learning Intelligence",
      raw: dims.learning,
      weight: weights.learning,
      weighted: r1(dims.learning * weights.learning),
      dataQuality: dataQuality(dims.learning),
      trend: dims.learning > 60 ? "improving" : "stable",
      calculation: `confidence×0.40 + patternScore×0.30 + reliability×0.20 + driftBonus×0.10`,
    },
    identity: {
      label: "Trader Identity",
      raw: dims.identity,
      weight: weights.identity,
      weighted: r1(dims.identity * weights.identity),
      dataQuality: dataQuality(dims.identity),
      trend: "stable",
      calculation: `similarityScore×0.35 + preferenceAlignment×0.35 + consistency×0.20 + confidence×0.10`,
    },
    research: {
      label: "Research Intelligence (Advisory)",
      raw: dims.research,
      weight: weights.research,
      weighted: r1(dims.research * weights.research),
      dataQuality: "weak",
      trend: "unknown",
      calculation: `researchConfidence×0.80 + experimentalBonus×0.20 (advisory only, minimal weight)`,
    },
    composite: r1(composite),
    vetoApplied: vetoed,
    vetoReason,
  };
}

// ─── Build contributing systems list ─────────────────────────────────────────

export function buildContributions(
  dims: DimensionScores,
  weights: EaiWeights,
  composite: number
): EaiContribution[] {
  const systems = [
    { system: "Strategy Intelligence",      key: "strategy" as keyof DimensionScores },
    { system: "Market Intelligence",        key: "market"   as keyof DimensionScores },
    { system: "Risk Intelligence",          key: "risk"     as keyof DimensionScores },
    { system: "Memory Intelligence",        key: "memory"   as keyof DimensionScores },
    { system: "Learning Intelligence",      key: "learning" as keyof DimensionScores },
    { system: "Trader Identity",            key: "identity" as keyof DimensionScores },
    { system: "Research Intelligence",      key: "research" as keyof DimensionScores },
  ] as const;

  const findingMap: Record<keyof DimensionScores, (score: number) => string> = {
    strategy: s => s >= 70 ? "Strong signal quality and rule compliance" : s >= 50 ? "Moderate signal quality" : "Weak strategy conditions",
    market:   s => s >= 70 ? "Favorable market conditions and opportunity" : s >= 50 ? "Neutral market environment" : "Adverse market conditions",
    risk:     s => s >= 70 ? "Risk controls satisfied, conditions safe" : s >= 50 ? "Moderate risk level" : "Elevated risk — capital protection active",
    memory:   s => s >= 70 ? "Strong historical precedent for this setup" : s >= 50 ? "Moderate historical alignment" : "Limited historical data for this pattern",
    learning: s => s >= 70 ? "Learning model performing well" : s >= 50 ? "Learning confidence is moderate" : "Learning model showing degradation",
    identity: s => s >= 70 ? "Setup aligns with established trading identity" : s >= 50 ? "Moderate identity alignment" : "Setup diverges from trader identity profile",
    research: s => s >= 60 ? "Research supports current approach (advisory)" : "Research in early stages (advisory only)",
  };

  return systems.map(({ system, key }) => {
    const score  = dims[key];
    const weight = weights[key];
    const weighted = score * weight;
    const position: EaiContribution["position"] =
      score >= 60 ? "supporting" : score < 40 ? "opposing" : "neutral";

    return {
      system,
      score:                r1(score),
      weight:               r1(weight * 100),
      weightedContribution: r1(weighted),
      position,
      keyFinding:           findingMap[key](score),
      dataQuality:          score > 65 ? "strong" : score > 40 ? "moderate" : "weak",
    };
  }).sort((a, b) => b.weightedContribution - a.weightedContribution);
}
