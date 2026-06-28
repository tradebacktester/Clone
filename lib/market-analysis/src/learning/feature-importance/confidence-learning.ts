// ─── Confidence Learning Engine ────────────────────────────────────────────────
// Tracks confidence evolution across analysis cycles.
// Confidence grows/shrinks based on evidence quality and consistency.
// Advisory only — never modifies trading behavior.

import { clamp } from "../learning-validation/data-validator.js";
import type {
  FeatureImportanceResult,
  FeatureConfidenceState,
  ConfidenceTrendDirection,
} from "./types.js";
import { MIN_SAMPLE_SIZE } from "./types.js";

// ─── Confidence change factors ─────────────────────────────────────────────────

interface ConfidenceChangeFactor {
  name: string;
  delta: number;        // positive = increase, negative = decrease
  reason: string;
}

export interface ConfidenceLearningOutput {
  featureId: string;
  previousConfidence: number;
  newConfidence: number;
  delta: number;
  trend: ConfidenceTrendDirection;
  factors: ConfidenceChangeFactor[];
  explanation: string;
  isInsufficient: boolean;
}

// ─── Compare two cycles and compute confidence delta ──────────────────────────

export function computeConfidenceDelta(
  current: FeatureImportanceResult,
  previous: FeatureConfidenceState | null,
): ConfidenceLearningOutput {
  const factors: ConfidenceChangeFactor[] = [];
  const prevConf = previous?.confidenceScore ?? 0;
  const prevN    = previous?.sampleSize ?? 0;
  const newConf  = current.confidenceScore;
  const newN     = current.sampleSize;

  // Factor 1: Sample size growth
  if (newN > prevN) {
    const growth = Math.min((newN - prevN) / 10, 5);
    factors.push({
      name: "Sample Size Growth",
      delta: growth,
      reason: `Sample grew from ${prevN} to ${newN} (+${newN - prevN} trades)`,
    });
  } else if (newN < prevN) {
    factors.push({
      name: "Sample Size Decrease",
      delta: -2,
      reason: `Sample decreased from ${prevN} to ${newN} (data window may have shifted)`,
    });
  }

  // Factor 2: Result consistency
  if (previous) {
    const prevWinRate = previous.winRate;
    const newWinRate  = current.winRate;
    const drift = Math.abs(newWinRate - prevWinRate);
    if (drift > 0.2) {
      factors.push({
        name: "Result Inconsistency",
        delta: -clamp(drift * 10, 1, 8),
        reason: `Win rate shifted by ${(drift * 100).toFixed(1)}% — results are unstable`,
      });
    } else if (drift < 0.05 && newN >= MIN_SAMPLE_SIZE) {
      factors.push({
        name: "Result Consistency",
        delta: 2,
        reason: `Win rate stable within 5% — results are consistent`,
      });
    }
  }

  // Factor 3: Statistical significance improvement
  if (current.statisticalSignificance >= 0.7 && newN >= MIN_SAMPLE_SIZE) {
    factors.push({
      name: "High Statistical Significance",
      delta: 3,
      reason: `Statistical significance ${(current.statisticalSignificance * 100).toFixed(0)}% — strong evidence`,
    });
  } else if (current.statisticalSignificance < 0.3) {
    factors.push({
      name: "Low Statistical Significance",
      delta: -2,
      reason: `Statistical significance only ${(current.statisticalSignificance * 100).toFixed(0)}% — weak evidence`,
    });
  }

  // Factor 4: Insufficient data penalty
  if (current.isInsufficient) {
    factors.push({
      name: "Insufficient Sample",
      delta: -5,
      reason: `Only ${newN} samples — insufficient for reliable conclusions`,
    });
  }

  // Factor 5: Contradiction detection
  if (current.hasContradiction) {
    factors.push({
      name: "Contradictory Evidence",
      delta: -4,
      reason: current.contradictionNote ?? "Correlation contradicts observed win rate",
    });
  }

  // Factor 6: Instability
  if (current.isUnstable) {
    factors.push({
      name: "Feature Instability",
      delta: -3,
      reason: current.instabilityNote ?? "High variance across feature buckets",
    });
  }

  // Factor 7: Overfitting risk
  if (current.overfittingRisk === "high") {
    factors.push({
      name: "Overfitting Risk",
      delta: -4,
      reason: "Very small sample with high apparent predictive value — likely spurious",
    });
  } else if (current.overfittingRisk === "medium") {
    factors.push({
      name: "Moderate Overfitting Risk",
      delta: -2,
      reason: "Small sample relative to predictive value — treat with caution",
    });
  }

  // Compute final confidence
  const totalDelta = factors.reduce((s, f) => s + f.delta, 0);
  const blended = prevConf > 0
    ? clamp(prevConf * 0.7 + newConf * 0.3 + totalDelta, 0, 100)
    : clamp(newConf + totalDelta, 0, 100);
  const finalConfidence = clamp(Math.round(blended * 10) / 10, 0, 100);

  // Trend direction
  let trend: ConfidenceTrendDirection = "stable";
  const delta = finalConfidence - prevConf;
  if (Math.abs(delta) < 2) trend = "stable";
  else if (delta > 0) trend = "improving";
  else trend = "declining";

  if (!previous) trend = "unknown";

  const explanation = buildConfidenceExplanation(
    current.displayName, prevConf, finalConfidence, trend, factors,
  );

  return {
    featureId: current.featureId,
    previousConfidence: prevConf,
    newConfidence: finalConfidence,
    delta: finalConfidence - prevConf,
    trend,
    factors,
    explanation,
    isInsufficient: current.isInsufficient,
  };
}

// ─── Apply confidence learning to a set of results ────────────────────────────

export function applyConfidenceLearning(
  features: FeatureImportanceResult[],
  history: FeatureConfidenceState[],
): FeatureImportanceResult[] {
  const historyMap = new Map<string, FeatureConfidenceState>(
    history.map(h => [h.featureId, h]),
  );

  return features.map(f => {
    const prev = historyMap.get(f.featureId) ?? null;
    const output = computeConfidenceDelta(f, prev);
    return {
      ...f,
      confidenceScore: output.newConfidence,
      confidenceTrend: output.trend,
    };
  });
}

// ─── Overall confidence for a cycle ───────────────────────────────────────────

export function computeOverallCycleConfidence(features: FeatureImportanceResult[]): number {
  const sufficient = features.filter(f => !f.isInsufficient);
  if (sufficient.length === 0) return 0;
  const avg = sufficient.reduce((s, f) => s + f.confidenceScore, 0) / sufficient.length;
  return clamp(Math.round(avg * 10) / 10, 0, 100);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildConfidenceExplanation(
  displayName: string,
  prev: number,
  next: number,
  trend: ConfidenceTrendDirection,
  factors: ConfidenceChangeFactor[],
): string {
  const trendStr = trend === "improving" ? "increased" : trend === "declining" ? "decreased" : "remained stable";
  const posFactors = factors.filter(f => f.delta > 0).map(f => f.name).join(", ");
  const negFactors = factors.filter(f => f.delta < 0).map(f => f.name).join(", ");
  let explanation = `[${displayName}] Confidence ${trendStr} from ${prev.toFixed(1)} to ${next.toFixed(1)}.`;
  if (posFactors) explanation += ` Boosted by: ${posFactors}.`;
  if (negFactors) explanation += ` Reduced by: ${negFactors}.`;
  return explanation;
}
