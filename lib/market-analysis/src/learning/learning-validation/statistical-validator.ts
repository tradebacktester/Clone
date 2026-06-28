// ─── Statistical Validator ────────────────────────────────────────────────────
// Phase 3: Institutional-grade statistical validation of learning conclusions.
// Advisory only — never modifies trading behavior.
//
// Checks performed:
//   1. Minimum sample size (n ≥ 30 for statistical validity)
//   2. Statistical significance (binomial z-test, p < 0.05)
//   3. 95% confidence interval (Wilson score)
//   4. Stability across rolling windows
//   5. Data quality (completeness + conflict detection)
//   6. Reproducibility (cycle-to-cycle variance)
//   7. Outlier influence (jackknife leave-one-out)

import { wilsonLowerBound } from "../learning-confidence/confidence-engine.js";
import type { ExtractedFeature } from "../learning-core/types.js";
import { randomUUID } from "crypto";

// ─── Constants ────────────────────────────────────────────────────────────────

export const MIN_SAMPLE_STATISTICAL = 30;
export const SIGNIFICANCE_ALPHA = 0.05;  // 95% confidence
export const Z_95 = 1.96;
export const Z_50 = 0.674;               // 50% CI (for tight stability checks)

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ValidationCheck {
  check: string;
  passed: boolean;
  severity: "info" | "warning" | "error";
  message: string;
  value?: number;
  threshold?: number;
}

export interface StatisticalValidationResult {
  validationId: string;
  sampleSize: number;
  minSampleMet: boolean;
  minSampleRequired: number;

  observedWinRate: number;
  ci95Lower: number;
  ci95Upper: number;
  wilsonLower: number;
  zScore: number;
  pValue: number;
  statisticallySignificant: boolean;

  stabilityScore: number;
  stabilityGrade: "A" | "B" | "C" | "D" | "F";
  windowConsistency: number;

  dataQualityScore: number;
  completenessScore: number;
  missingDataPct: number;
  conflictingEvidence: boolean;

  reproducibilityScore: number;
  cycleVariance: number;

  outlierCount: number;
  outlierInfluence: number;
  jackknifeDelta: number;

  overallStatus: "passed" | "degraded" | "failed";
  overallScore: number;
  passedChecks: number;
  totalChecks: number;
  issues: ValidationCheck[];
  recommendations: string[];
}

// ─── Normal Distribution CDF Approximation ───────────────────────────────────
// Abramowitz & Stegun approximation for p-value computation.

function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const pdf = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  const cdf = 1 - pdf * poly;
  return z >= 0 ? cdf : 1 - cdf;
}

function twoTailedPValue(z: number): number {
  return 2 * (1 - normalCDF(Math.abs(z)));
}

// ─── Confidence Interval (Wilson) ─────────────────────────────────────────────

function wilsonCI95(wins: number, n: number): { lower: number; upper: number } {
  if (n === 0) return { lower: 0, upper: 0 };
  const p = wins / n;
  const z2 = Z_95 * Z_95;
  const center = (p + z2 / (2 * n)) / (1 + z2 / n);
  const margin = (Z_95 / (1 + z2 / n)) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return {
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
  };
}

// ─── Stability Analysis ───────────────────────────────────────────────────────
// Split features into time windows, compare win rates across windows.

function analyzeStability(features: ExtractedFeature[]): {
  stabilityScore: number;
  windowConsistency: number;
  grade: "A" | "B" | "C" | "D" | "F";
} {
  if (features.length < 10) {
    return { stabilityScore: 20, windowConsistency: 0, grade: "F" };
  }

  const sorted = [...features].sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime());
  const windowSize = Math.max(Math.floor(sorted.length / 4), 5);
  const windows: number[] = [];

  for (let i = 0; i + windowSize <= sorted.length; i += windowSize) {
    const slice = sorted.slice(i, i + windowSize);
    const wins = slice.filter(f => f.outcome === "win").length;
    windows.push(wins / slice.length);
  }

  if (windows.length < 2) return { stabilityScore: 40, windowConsistency: 0.5, grade: "D" };

  const mean = windows.reduce((a, b) => a + b, 0) / windows.length;
  const variance = windows.reduce((sum, w) => sum + Math.pow(w - mean, 2), 0) / windows.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? stdDev / mean : 1;  // coefficient of variation

  const windowConsistency = Math.max(0, 1 - cv);
  const stabilityScore = Math.round(windowConsistency * 100);

  let grade: "A" | "B" | "C" | "D" | "F";
  if (stabilityScore >= 80) grade = "A";
  else if (stabilityScore >= 65) grade = "B";
  else if (stabilityScore >= 50) grade = "C";
  else if (stabilityScore >= 35) grade = "D";
  else grade = "F";

  return { stabilityScore, windowConsistency, grade };
}

// ─── Outlier Detection ────────────────────────────────────────────────────────
// Identifies extreme PnL outliers using IQR method.
// Jackknife: measures how much removing each outlier shifts the win rate.

function analyzeOutliers(features: ExtractedFeature[]): {
  outlierCount: number;
  outlierInfluence: number;
  jackknifeDelta: number;
} {
  if (features.length < 5) return { outlierCount: 0, outlierInfluence: 0, jackknifeDelta: 0 };

  const pnls = features.map(f => f.pnl).sort((a, b) => a - b);
  const q1 = pnls[Math.floor(pnls.length * 0.25)];
  const q3 = pnls[Math.floor(pnls.length * 0.75)];
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;

  const outliers = features.filter(f => f.pnl < lower || f.pnl > upper);
  const outlierCount = outliers.length;

  const overallWinRate = features.filter(f => f.outcome === "win").length / features.length;
  const withoutOutliers = features.filter(f => f.pnl >= lower && f.pnl <= upper);
  const cleanWinRate = withoutOutliers.length > 0
    ? withoutOutliers.filter(f => f.outcome === "win").length / withoutOutliers.length
    : overallWinRate;

  const jackknifeDelta = Math.abs(overallWinRate - cleanWinRate);
  const outlierInfluence = Math.min(100, (outlierCount / features.length) * 100 + jackknifeDelta * 100);

  return { outlierCount, outlierInfluence, jackknifeDelta };
}

// ─── Data Quality ─────────────────────────────────────────────────────────────

function analyzeDataQuality(features: ExtractedFeature[]): {
  dataQualityScore: number;
  completenessScore: number;
  missingDataPct: number;
  conflictingEvidence: boolean;
} {
  if (features.length === 0) {
    return { dataQualityScore: 0, completenessScore: 0, missingDataPct: 100, conflictingEvidence: false };
  }

  const CRITICAL_FIELDS = ["pair", "session", "outcome", "pnl", "setupScore", "tqi"] as const;
  let missingCount = 0;
  let totalFields = 0;

  for (const f of features) {
    for (const field of CRITICAL_FIELDS) {
      totalFields++;
      const v = f[field];
      if (v === null || v === undefined || (typeof v === "number" && isNaN(v))) {
        missingCount++;
      }
    }
  }

  const missingDataPct = totalFields > 0 ? (missingCount / totalFields) * 100 : 0;
  const completenessScore = Math.max(0, 100 - missingDataPct * 2);

  // Conflicting evidence: win rate > 70% but avg RR < 1 (should not both be true simultaneously in a healthy system)
  const wins = features.filter(f => f.outcome === "win").length;
  const winRate = wins / features.length;
  const avgRR = features.reduce((sum, f) => sum + f.rrActual, 0) / features.length;
  const conflictingEvidence = winRate > 0.7 && avgRR < 0.8;

  const dataQualityScore = Math.round(completenessScore * 0.8 + (conflictingEvidence ? 0 : 20));

  return { dataQualityScore, completenessScore, missingDataPct, conflictingEvidence };
}

// ─── Reproducibility ──────────────────────────────────────────────────────────
// Measures cycle-to-cycle variance given an array of historical cycle win rates.

export function measureReproducibility(historicalWinRates: number[]): {
  reproducibilityScore: number;
  cycleVariance: number;
} {
  if (historicalWinRates.length < 2) {
    return { reproducibilityScore: 50, cycleVariance: 0 };
  }
  const mean = historicalWinRates.reduce((a, b) => a + b, 0) / historicalWinRates.length;
  const variance = historicalWinRates.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / historicalWinRates.length;
  const reproducibilityScore = Math.max(0, Math.round(100 - variance * 1000));
  return { reproducibilityScore, cycleVariance: variance };
}

// ─── Main Validator ───────────────────────────────────────────────────────────

export function runStatisticalValidation(
  features: ExtractedFeature[],
  historicalWinRates: number[] = [],
): StatisticalValidationResult {
  const validationId = randomUUID();
  const n = features.length;
  const wins = features.filter(f => f.outcome === "win").length;
  const issues: ValidationCheck[] = [];
  const recommendations: string[] = [];

  // ── Check 1: Sample size ────────────────────────────────────────────────
  const minSampleMet = n >= MIN_SAMPLE_STATISTICAL;
  issues.push({
    check: "minimum_sample_size",
    passed: minSampleMet,
    severity: minSampleMet ? "info" : n < 10 ? "error" : "warning",
    message: `Sample size: ${n} (required: ${MIN_SAMPLE_STATISTICAL})`,
    value: n,
    threshold: MIN_SAMPLE_STATISTICAL,
  });
  if (!minSampleMet) {
    recommendations.push(`Collect at least ${MIN_SAMPLE_STATISTICAL - n} more closed trades before drawing conclusions.`);
  }

  // ── Check 2: Win rate + CI ───────────────────────────────────────────────
  const observedWinRate = n > 0 ? wins / n : 0;
  const ci = wilsonCI95(wins, n);
  const wilsonLower = wilsonLowerBound(wins, n);

  // ── Check 3: Statistical significance (null hypothesis: win rate = 0.5) ─
  const pHypothesis = 0.5;
  const stdErr = n > 0 ? Math.sqrt((pHypothesis * (1 - pHypothesis)) / n) : 1;
  const zScore = stdErr > 0 ? (observedWinRate - pHypothesis) / stdErr : 0;
  const pValue = twoTailedPValue(zScore);
  const statisticallySignificant = pValue < SIGNIFICANCE_ALPHA && minSampleMet;

  issues.push({
    check: "statistical_significance",
    passed: statisticallySignificant,
    severity: statisticallySignificant ? "info" : "warning",
    message: `p-value: ${pValue.toFixed(4)} (α=0.05), z-score: ${zScore.toFixed(2)}`,
    value: pValue,
    threshold: SIGNIFICANCE_ALPHA,
  });
  if (!statisticallySignificant && n >= MIN_SAMPLE_STATISTICAL) {
    recommendations.push("Results are not statistically significant. Continue accumulating evidence.");
  }

  // ── Check 4: Stability ───────────────────────────────────────────────────
  const { stabilityScore, windowConsistency, grade: stabilityGrade } = analyzeStability(features);
  issues.push({
    check: "performance_stability",
    passed: stabilityScore >= 50,
    severity: stabilityScore >= 50 ? "info" : stabilityScore >= 30 ? "warning" : "error",
    message: `Stability score: ${stabilityScore}/100 (grade: ${stabilityGrade})`,
    value: stabilityScore,
    threshold: 50,
  });
  if (stabilityScore < 50) {
    recommendations.push("Performance is unstable across time windows. Extend observation period before trusting conclusions.");
  }

  // ── Check 5: Data quality ────────────────────────────────────────────────
  const { dataQualityScore, completenessScore, missingDataPct, conflictingEvidence } = analyzeDataQuality(features);
  issues.push({
    check: "data_quality",
    passed: dataQualityScore >= 70,
    severity: dataQualityScore >= 70 ? "info" : dataQualityScore >= 50 ? "warning" : "error",
    message: `Data quality: ${dataQualityScore}/100 (${missingDataPct.toFixed(1)}% missing)${conflictingEvidence ? " — conflicting evidence detected" : ""}`,
    value: dataQualityScore,
    threshold: 70,
  });
  if (conflictingEvidence) {
    recommendations.push("Conflicting evidence detected (high win rate + low R:R). Verify data integrity.");
  }

  // ── Check 6: CI width ────────────────────────────────────────────────────
  const ciWidth = ci.upper - ci.lower;
  const narrowCI = ciWidth <= 0.20;
  issues.push({
    check: "confidence_interval_width",
    passed: narrowCI,
    severity: narrowCI ? "info" : ciWidth <= 0.35 ? "warning" : "error",
    message: `95% CI: [${(ci.lower * 100).toFixed(1)}%, ${(ci.upper * 100).toFixed(1)}%] — width: ${(ciWidth * 100).toFixed(1)}pp`,
    value: ciWidth,
    threshold: 0.20,
  });
  if (!narrowCI) {
    recommendations.push(`Confidence interval is wide (${(ciWidth * 100).toFixed(0)}pp). More data needed for reliable estimates.`);
  }

  // ── Check 7: Outlier influence ───────────────────────────────────────────
  const { outlierCount, outlierInfluence, jackknifeDelta } = analyzeOutliers(features);
  const outlierOk = outlierInfluence < 15;
  issues.push({
    check: "outlier_influence",
    passed: outlierOk,
    severity: outlierOk ? "info" : "warning",
    message: `Outliers: ${outlierCount} (influence: ${outlierInfluence.toFixed(1)}%, jackknife Δ win rate: ${(jackknifeDelta * 100).toFixed(1)}pp)`,
    value: outlierInfluence,
    threshold: 15,
  });
  if (!outlierOk) {
    recommendations.push("High outlier influence. Review extreme trades — conclusions may be skewed by exceptional events.");
  }

  // ── Check 8: Reproducibility ─────────────────────────────────────────────
  const { reproducibilityScore, cycleVariance } = measureReproducibility(
    historicalWinRates.length > 0 ? historicalWinRates : [observedWinRate],
  );
  issues.push({
    check: "reproducibility",
    passed: reproducibilityScore >= 60,
    severity: reproducibilityScore >= 60 ? "info" : "warning",
    message: `Reproducibility: ${reproducibilityScore}/100 (cycle variance: ${(cycleVariance * 100).toFixed(2)}pp²)`,
    value: reproducibilityScore,
    threshold: 60,
  });
  if (reproducibilityScore < 60) {
    recommendations.push("High cycle-to-cycle variance detected. Learning conclusions may not be stable over time.");
  }

  // ── Aggregate ────────────────────────────────────────────────────────────
  const passedChecks = issues.filter(i => i.passed).length;
  const totalChecks = issues.length;
  const errorChecks = issues.filter(i => !i.passed && i.severity === "error").length;
  const warningChecks = issues.filter(i => !i.passed && i.severity === "warning").length;

  let overallStatus: "passed" | "degraded" | "failed";
  if (errorChecks > 0 || passedChecks < totalChecks * 0.5) overallStatus = "failed";
  else if (warningChecks > 1 || passedChecks < totalChecks * 0.75) overallStatus = "degraded";
  else overallStatus = "passed";

  const overallScore = Math.round((passedChecks / totalChecks) * 100);

  return {
    validationId,
    sampleSize: n,
    minSampleMet,
    minSampleRequired: MIN_SAMPLE_STATISTICAL,
    observedWinRate,
    ci95Lower: ci.lower,
    ci95Upper: ci.upper,
    wilsonLower,
    zScore,
    pValue,
    statisticallySignificant,
    stabilityScore,
    stabilityGrade,
    windowConsistency,
    dataQualityScore,
    completenessScore,
    missingDataPct,
    conflictingEvidence,
    reproducibilityScore,
    cycleVariance,
    outlierCount,
    outlierInfluence,
    jackknifeDelta,
    overallStatus,
    overallScore,
    passedChecks,
    totalChecks,
    issues,
    recommendations,
  };
}
