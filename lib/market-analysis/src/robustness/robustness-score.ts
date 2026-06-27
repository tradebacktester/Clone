/**
 * Robustness Score Aggregator
 * Produces a 0-100 score from all sub-engine results.
 *
 * Weights:
 *   Stability (param sensitivity + WF consistency):  25%
 *   Generalization (OOS + WF efficiency):            20%
 *   Risk resilience:                                 20%
 *   Execution resilience:                            20%
 *   Data quality (confidence + regime coverage):     15%
 */
import type {
  SensitivityAnalysisResult,
  MarketStressResult,
  ExecutionStressResult,
  RiskStressResult,
  WFRobustnessResult,
  OOSResult,
  ConfidenceStabilityResult,
  RobustnessScore,
  RobustnessScoreBreakdown,
} from "./types.js";

function grade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

function verdict(score: number): "robust" | "acceptable" | "needs_work" | "fragile" {
  if (score >= 75) return "robust";
  if (score >= 55) return "acceptable";
  if (score >= 35) return "needs_work";
  return "fragile";
}

export function computeRobustnessScore(
  sensitivity: SensitivityAnalysisResult,
  marketStress: MarketStressResult,
  executionStress: ExecutionStressResult,
  riskStress: RiskStressResult,
  walkForward: WFRobustnessResult,
  oos: OOSResult,
  confidence: ConfidenceStabilityResult,
): RobustnessScore {
  // Stability: 50% from param stability, 50% from WF consistency
  const paramStabilityScore = Math.max(0, 100 - sensitivity.overallSensitivityScore);
  const wfConsistencyScore = walkForward.consistencyScore;
  const stability = Math.round((paramStabilityScore * 0.5 + wfConsistencyScore * 0.5));

  // Generalization: 50% OOS, 50% WF efficiency ratio
  const oosScore = oos.overallScore;
  const wfEfficiencyScore = Math.round(Math.min(100, walkForward.avgEfficiencyRatio * 120)); // ER of 0.833 → 100
  const generalization = Math.round((oosScore * 0.5 + wfEfficiencyScore * 0.5));

  // Risk resilience: direct from sub-engine
  const riskResilience = riskStress.overallResilienceScore;

  // Execution resilience: from execution stress + market stress
  const executionResilience = Math.round(
    (executionStress.overallResilienceScore * 0.6 + marketStress.overallRobustScore * 0.4),
  );

  // Data quality: confidence stability + regime coverage proxy
  const dataQuality = Math.round(
    (confidence.overallScore * 0.6 + marketStress.overallRobustScore * 0.4),
  );

  const breakdown: RobustnessScoreBreakdown = {
    stability,
    generalization,
    riskResilience,
    executionResilience,
    dataQuality,
  };

  // Weighted composite
  const overall = Math.round(
    stability * 0.25 +
    generalization * 0.20 +
    riskResilience * 0.20 +
    executionResilience * 0.20 +
    dataQuality * 0.15,
  );

  return {
    overall: Math.max(0, Math.min(100, overall)),
    breakdown,
    grade: grade(overall),
    verdict: verdict(overall),
  };
}
