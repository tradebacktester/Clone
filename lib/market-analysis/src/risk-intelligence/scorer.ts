// ─── Risk Intelligence — Scorer & Classifier ─────────────────────────────────
// Converts component health scores into an Overall Risk Score (0–100)
// and a classified risk level.
// Advisory only. NEVER modifies production strategy.

import type {
  RiskClassification,
  RiScoreWeights,
  UnifiedRiskIntelligenceObject,
  AccountRiskResult,
  PositionRiskResult,
  PortfolioRiskResult,
  MarketRiskResult,
  BrokerRiskResult,
  SystemRiskResult,
} from "./types.js";
import { DEFAULT_RI_WEIGHTS, RISK_CLASSIFICATION_THRESHOLDS, RISK_CLASSIFICATION_LABELS } from "./types.js";

export { RISK_CLASSIFICATION_LABELS };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, isFinite(v) ? v : 0));
}

// ─── Risk classification ──────────────────────────────────────────────────────

/**
 * Converts a risk score (0=safe, 100=catastrophic) to a classification.
 * Uses descending threshold order.
 */
export function scoreToRiskClassification(score: number): RiskClassification {
  if (score >= RISK_CLASSIFICATION_THRESHOLDS.critical)  return "critical";
  if (score >= RISK_CLASSIFICATION_THRESHOLDS.high)      return "high";
  if (score >= RISK_CLASSIFICATION_THRESHOLDS.elevated)  return "elevated";
  if (score >= RISK_CLASSIFICATION_THRESHOLDS.moderate)  return "moderate";
  if (score >= RISK_CLASSIFICATION_THRESHOLDS.low)       return "low";
  return "very_low";
}

export function riskClassificationLabel(cls: RiskClassification): string {
  return RISK_CLASSIFICATION_LABELS[cls];
}

// ─── Normalised weight map ────────────────────────────────────────────────────

function normaliseWeights(weights: Partial<RiScoreWeights>): RiScoreWeights {
  const merged: RiScoreWeights = { ...DEFAULT_RI_WEIGHTS, ...weights };
  const sum = Object.values(merged).reduce((a, b) => a + b, 0);
  if (sum === 0) return { ...DEFAULT_RI_WEIGHTS };
  return {
    accountHealth:     merged.accountHealth     / sum,
    positionRisk:      merged.positionRisk      / sum,
    portfolioRisk:     merged.portfolioRisk      / sum,
    marketRisk:        merged.marketRisk        / sum,
    brokerReliability: merged.brokerReliability / sum,
    systemHealth:      merged.systemHealth      / sum,
  };
}

// ─── Master scorer ────────────────────────────────────────────────────────────
// NOTE: "risk score" is the INVERSE of health/reliability.
// Higher overall risk score → more dangerous → higher risk classification.
// All component "health" scores are inverted before weighting.

export interface ScoreInput {
  accountRisk:   AccountRiskResult;
  positionRisk:  PositionRiskResult | null;
  portfolioRisk: PortfolioRiskResult;
  marketRisk:    MarketRiskResult;
  brokerRisk:    BrokerRiskResult;
  systemRisk:    SystemRiskResult;
  weights?:      Partial<RiScoreWeights>;
}

export function computeOverallRisk(input: ScoreInput): {
  overallRiskScore: number;
  riskClassification: RiskClassification;
  weights: RiScoreWeights;
  breakdown: UnifiedRiskIntelligenceObject["scoreBreakdown"];
  confidence: number;
} {
  const w = normaliseWeights(input.weights ?? {});

  // Each component provides a "health" score (0=worst, 100=best)
  // We convert to a "risk contribution" (0=no risk, 100=max risk)

  const accountHealth     = clamp(input.accountRisk.accountHealthScore);
  const positionHealth    = input.positionRisk
    ? clamp(100 - input.positionRisk.positionRiskScore)
    : 100; // no position = no position risk
  const portfolioHealth   = clamp(100 - input.portfolioRisk.portfolioRiskScore);
  const marketSafety      = clamp(100 - input.marketRisk.marketRiskScore);
  const brokerHealth      = clamp(input.brokerRisk.brokerReliabilityScore);
  const systemHealth      = clamp(input.systemRisk.systemHealthScore);

  // Inverted (risk) scores
  const accountRiskContrib     = clamp(100 - accountHealth);
  const positionRiskContrib    = clamp(100 - positionHealth);
  const portfolioRiskContrib   = clamp(100 - portfolioHealth);
  const marketRiskContrib      = clamp(100 - marketSafety);
  const brokerRiskContrib      = clamp(100 - brokerHealth);
  const systemRiskContrib      = clamp(100 - systemHealth);

  const breakdown: UnifiedRiskIntelligenceObject["scoreBreakdown"] = {
    accountHealth: {
      raw: accountHealth, inverted: accountRiskContrib,
      weighted: accountRiskContrib * w.accountHealth, weight: w.accountHealth,
    },
    positionRisk: {
      raw: positionHealth, inverted: positionRiskContrib,
      weighted: positionRiskContrib * w.positionRisk, weight: w.positionRisk,
    },
    portfolioRisk: {
      raw: portfolioHealth, inverted: portfolioRiskContrib,
      weighted: portfolioRiskContrib * w.portfolioRisk, weight: w.portfolioRisk,
    },
    marketRisk: {
      raw: marketSafety, inverted: marketRiskContrib,
      weighted: marketRiskContrib * w.marketRisk, weight: w.marketRisk,
    },
    brokerReliability: {
      raw: brokerHealth, inverted: brokerRiskContrib,
      weighted: brokerRiskContrib * w.brokerReliability, weight: w.brokerReliability,
    },
    systemHealth: {
      raw: systemHealth, inverted: systemRiskContrib,
      weighted: systemRiskContrib * w.systemHealth, weight: w.systemHealth,
    },
    total: 0,
  };

  const total = clamp(
    breakdown.accountHealth.weighted +
    breakdown.positionRisk.weighted +
    breakdown.portfolioRisk.weighted +
    breakdown.marketRisk.weighted +
    breakdown.brokerReliability.weighted +
    breakdown.systemHealth.weighted,
  );
  breakdown.total = Math.round(total * 10) / 10;

  const overallRiskScore = breakdown.total;
  const riskClassification = scoreToRiskClassification(overallRiskScore);

  // Confidence: based on data availability and system health
  const dataAvailability = [
    accountHealth > 0 ? 1 : 0,
    input.positionRisk !== null ? 1 : 0.5,
    portfolioHealth > 0 ? 1 : 0.5,
    marketSafety > 0 ? 1 : 0,
    brokerHealth > 0 ? 1 : 0,
    systemHealth > 0 ? 1 : 0,
  ].reduce((a, b) => a + b, 0) / 6;

  const confidence = clamp(dataAvailability * 100 * (systemHealth / 100) * 0.3 + dataAvailability * 100 * 0.7);

  return { overallRiskScore, riskClassification, weights: w, breakdown, confidence };
}

// ─── Confidence interval ──────────────────────────────────────────────────────

/** Estimate uncertainty band around the risk score based on confidence. */
export function computeConfidenceInterval(
  score:      number,
  confidence: number,
): { lower: number; upper: number } {
  const uncertainty = (1 - confidence / 100) * 20; // up to ±20 points at zero confidence
  return {
    lower: clamp(score - uncertainty),
    upper: clamp(score + uncertainty),
  };
}

// ─── Reliability rating ───────────────────────────────────────────────────────

export function computeReliabilityRating(
  confidence: number,
  systemHealth: number,
  dataCompleteness: number,
): "high" | "moderate" | "low" | "insufficient" {
  if (confidence >= 80 && systemHealth >= 70 && dataCompleteness >= 0.8) return "high";
  if (confidence >= 60 && systemHealth >= 50 && dataCompleteness >= 0.6) return "moderate";
  if (confidence >= 30)                                                    return "low";
  return "insufficient";
}
