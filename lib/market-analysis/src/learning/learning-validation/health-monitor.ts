// ─── Learning Health Monitor ──────────────────────────────────────────────────
// Phase 3: Composite Learning Health Score (0–100).
// Aggregates 7 dimensions into an overall health grade with trend analysis.
//
// Dimensions (equal weight):
//   1. Data Quality        (14.3%)
//   2. Evidence Volume     (14.3%)
//   3. Confidence Stability(14.3%)
//   4. Pattern Reliability (14.3%)
//   5. Validation Success  (14.3%)
//   6. Drift Status        (14.3%)
//   7. Recommendation Acc  (14.3%)

import { randomUUID } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HealthDimension {
  name: string;
  score: number;    // 0–100
  weight: number;   // 0–1
  grade: "A" | "B" | "C" | "D" | "F";
  detail: string;
}

export interface HealthSnapshot {
  snapshotId: string;
  triggeredBy: string;

  overallScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  certificationStatus: "certified" | "conditional" | "not_ready";

  dataQualityScore: number;
  evidenceVolumeScore: number;
  confidenceStabilityScore: number;
  patternReliabilityScore: number;
  validationSuccessScore: number;
  driftStatusScore: number;
  recommendationAccScore: number;

  dimensions: HealthDimension[];

  totalCycles: number;
  passedCycles: number;
  activeDriftAlerts: number;
  criticalDriftAlerts: number;
  totalPatterns: number;
  reliablePatterns: number;
  totalFeatures: number;

  strengths: string[];
  weaknesses: string[];
  recommendations: string[];

  snapshotAt: Date;
}

export interface HealthInput {
  triggeredBy?: string;

  // Data quality (from latest validation result)
  dataQualityScore: number;       // 0–100
  completenessScore: number;      // 0–100
  missingDataPct: number;

  // Evidence volume
  totalFeatures: number;
  totalCycles: number;

  // Confidence stability (rolling cycle confidence scores)
  cycleConfidenceScores: number[];

  // Pattern reliability
  totalPatterns: number;
  reliablePatterns: number;  // patterns with isInsufficient=false + statisticalConf >= 60

  // Validation success
  passedCycles: number;
  totalValidations: number;
  passedValidations: number;

  // Drift status
  activeDriftAlerts: number;
  criticalDriftAlerts: number;

  // Recommendation accuracy (latest evaluation)
  recommendationF1: number;        // 0–1
  brierScore: number;              // 0–1 (lower = better)
}

// ─── Grade from Score ─────────────────────────────────────────────────────────

function grade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

// ─── Dimension Scorers ────────────────────────────────────────────────────────

function scoreDataQuality(input: HealthInput): number {
  const base = input.dataQualityScore * 0.6 + input.completenessScore * 0.4;
  const penalty = Math.min(30, input.missingDataPct * 2);
  return Math.max(0, Math.min(100, base - penalty));
}

function scoreEvidenceVolume(input: HealthInput): number {
  // Diminishing returns: score plateaus at 500 features, 20 cycles
  const featureScore = Math.min(100, (input.totalFeatures / 500) * 100);
  const cycleScore = Math.min(100, (input.totalCycles / 20) * 100);
  return Math.round(featureScore * 0.6 + cycleScore * 0.4);
}

function scoreConfidenceStability(input: HealthInput): number {
  const scores = input.cycleConfidenceScores;
  if (scores.length < 2) return 50;
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / scores.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
  return Math.max(0, Math.min(100, Math.round(100 - cv * 100)));
}

function scorePatternReliability(input: HealthInput): number {
  if (input.totalPatterns === 0) return 20;
  const reliabilityRatio = input.reliablePatterns / input.totalPatterns;
  const volumeScore = Math.min(100, (input.totalPatterns / 20) * 100);
  return Math.round(reliabilityRatio * 70 + volumeScore * 0.30);
}

function scoreValidationSuccess(input: HealthInput): number {
  if (input.totalValidations === 0) return 30;
  const successRate = input.passedValidations / input.totalValidations;
  const cycleSuccessRate = input.totalCycles > 0 ? input.passedCycles / input.totalCycles : 0;
  return Math.round(successRate * 60 + cycleSuccessRate * 40);
}

function scoreDriftStatus(input: HealthInput): number {
  if (input.activeDriftAlerts === 0) return 100;
  const criticalPenalty = input.criticalDriftAlerts * 25;
  const highPenalty = (input.activeDriftAlerts - input.criticalDriftAlerts) * 10;
  return Math.max(0, 100 - criticalPenalty - highPenalty);
}

function scoreRecommendationAcc(input: HealthInput): number {
  if (input.recommendationF1 === 0 && input.brierScore === 0) return 50; // No data
  const f1Score = input.recommendationF1 * 100;
  // Brier score: 0=perfect, 1=worst. Invert for health score contribution.
  const brierScore = Math.max(0, (1 - input.brierScore) * 100);
  return Math.round(f1Score * 0.6 + brierScore * 0.4);
}

// ─── Narrative Generation ─────────────────────────────────────────────────────

function generateNarrative(
  dimensions: HealthDimension[],
  overallScore: number,
): { strengths: string[]; weaknesses: string[]; recommendations: string[] } {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const recommendations: string[] = [];

  for (const dim of dimensions) {
    if (dim.score >= 80) {
      strengths.push(`${dim.name}: ${dim.detail}`);
    } else if (dim.score < 55) {
      weaknesses.push(`${dim.name}: ${dim.detail}`);
    }
  }

  if (overallScore >= 85) {
    recommendations.push("System is in excellent health. Continue current learning cadence.");
  } else if (overallScore >= 70) {
    recommendations.push("System health is good. Focus on improving weakest dimensions.");
  } else if (overallScore >= 55) {
    recommendations.push("System health is acceptable. Prioritize data quality and evidence volume improvements.");
  } else {
    recommendations.push("System health is below acceptable threshold. Suspend advisory recommendations until score exceeds 55.");
  }

  const weakDims = dimensions.filter(d => d.score < 55);
  for (const dim of weakDims.slice(0, 3)) {
    recommendations.push(`Improve ${dim.name}: ${dim.detail}`);
  }

  return { strengths, weaknesses, recommendations };
}

// ─── Main Health Monitor ──────────────────────────────────────────────────────

export function computeHealthSnapshot(input: HealthInput): HealthSnapshot {
  const dataQualityScore = scoreDataQuality(input);
  const evidenceVolumeScore = scoreEvidenceVolume(input);
  const confidenceStabilityScore = scoreConfidenceStability(input);
  const patternReliabilityScore = scorePatternReliability(input);
  const validationSuccessScore = scoreValidationSuccess(input);
  const driftStatusScore = scoreDriftStatus(input);
  const recommendationAccScore = scoreRecommendationAcc(input);

  const componentScores = [
    dataQualityScore,
    evidenceVolumeScore,
    confidenceStabilityScore,
    patternReliabilityScore,
    validationSuccessScore,
    driftStatusScore,
    recommendationAccScore,
  ];

  const overallScore = Math.round(componentScores.reduce((a, b) => a + b, 0) / componentScores.length);

  const dimensions: HealthDimension[] = [
    { name: "Data Quality", score: dataQualityScore, weight: 1 / 7, grade: grade(dataQualityScore), detail: `Quality: ${input.dataQualityScore.toFixed(0)}/100, Completeness: ${input.completenessScore.toFixed(0)}/100, Missing: ${input.missingDataPct.toFixed(1)}%` },
    { name: "Evidence Volume", score: evidenceVolumeScore, weight: 1 / 7, grade: grade(evidenceVolumeScore), detail: `${input.totalFeatures} features, ${input.totalCycles} cycles` },
    { name: "Confidence Stability", score: confidenceStabilityScore, weight: 1 / 7, grade: grade(confidenceStabilityScore), detail: `Cycle confidence CV: ${input.cycleConfidenceScores.length} cycles measured` },
    { name: "Pattern Reliability", score: patternReliabilityScore, weight: 1 / 7, grade: grade(patternReliabilityScore), detail: `${input.reliablePatterns}/${input.totalPatterns} patterns statistically reliable` },
    { name: "Validation Success Rate", score: validationSuccessScore, weight: 1 / 7, grade: grade(validationSuccessScore), detail: `${input.passedValidations}/${input.totalValidations} validations passed` },
    { name: "Drift Status", score: driftStatusScore, weight: 1 / 7, grade: grade(driftStatusScore), detail: `${input.activeDriftAlerts} active alerts (${input.criticalDriftAlerts} critical)` },
    { name: "Recommendation Accuracy", score: recommendationAccScore, weight: 1 / 7, grade: grade(recommendationAccScore), detail: `F1: ${(input.recommendationF1 * 100).toFixed(1)}%, Brier: ${input.brierScore.toFixed(3)}` },
  ];

  const overallGrade = grade(overallScore);

  let certificationStatus: "certified" | "conditional" | "not_ready";
  if (overallScore >= 75 && input.criticalDriftAlerts === 0) certificationStatus = "certified";
  else if (overallScore >= 55) certificationStatus = "conditional";
  else certificationStatus = "not_ready";

  const { strengths, weaknesses, recommendations } = generateNarrative(dimensions, overallScore);

  return {
    snapshotId: randomUUID(),
    triggeredBy: input.triggeredBy ?? "manual",
    overallScore,
    grade: overallGrade,
    certificationStatus,
    dataQualityScore,
    evidenceVolumeScore,
    confidenceStabilityScore,
    patternReliabilityScore,
    validationSuccessScore,
    driftStatusScore,
    recommendationAccScore,
    dimensions,
    totalCycles: input.totalCycles,
    passedCycles: input.passedCycles,
    activeDriftAlerts: input.activeDriftAlerts,
    criticalDriftAlerts: input.criticalDriftAlerts,
    totalPatterns: input.totalPatterns,
    reliablePatterns: input.reliablePatterns,
    totalFeatures: input.totalFeatures,
    strengths,
    weaknesses,
    recommendations,
    snapshotAt: new Date(),
  };
}
