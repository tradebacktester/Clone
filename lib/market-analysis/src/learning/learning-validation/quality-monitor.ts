// ─── Learning Quality Monitor ─────────────────────────────────────────────────
// Phase 4 Enhancement: Continuously monitors learning system data quality.
// ADVISORY ONLY — alerts never change trading behavior.
//
// Dimensions monitored:
//   1. Data Completeness (missing features, context, screenshots, duplicates)
//   2. Sample Size (minimum thresholds for statistical validity)
//   3. Confidence Stability (CV of confidence scores over time)
//   4. Pattern Stability (consistency of pattern win rates)
//   5. Recommendation Stability (how stable advisory outputs are)
//   6. Calibration Status (from calibration engine)
//   7. Learning Drift (from drift detector)
//   8. Validation Success Rate (% of cycles passing validation)
//
// Alert types:
//   low_sample | confidence_decline | poor_calibration | missing_data |
//   excessive_uncertainty | significant_drift | duplicate_data | validation_failure

import { randomUUID } from "crypto";
import type { ExtractedFeature } from "../learning-core/types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type QualityAlertType =
  | "low_sample"
  | "confidence_decline"
  | "poor_calibration"
  | "missing_data"
  | "excessive_uncertainty"
  | "significant_drift"
  | "duplicate_data"
  | "validation_failure"
  | "pattern_instability"
  | "recommendation_instability";

export type AlertSeverity = "low" | "medium" | "high" | "critical";

export interface QualityAlert {
  alertId: string;
  alertType: QualityAlertType;
  severity: AlertSeverity;
  dimension: string;
  value: number;
  threshold: number;
  delta?: number;
  title: string;
  description: string;
  recommendation: string;
  affectedEntity?: string;
}

export interface QualityDimension {
  name: string;
  score: number;        // 0–100
  grade: "A" | "B" | "C" | "D" | "F";
  weight: number;       // equal weighting → 1/8 each
  detail: string;
}

export interface QualitySnapshot {
  snapshotId: string;
  qualityScore: number;   // 0–100 composite
  qualityGrade: "A" | "B" | "C" | "D" | "F";
  dimensions: QualityDimension[];

  // Raw counts
  totalTrades: number;
  tradesWithContext: number;
  tradesWithScreenshot: number;
  duplicateRecords: number;
  missingOutcomes: number;
  missingFeatures: number;

  // Alert summary
  activeAlerts: QualityAlert[];
  criticalAlerts: number;

  // Narrative
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

// External inputs for quality computation
export interface QualityInput {
  features: ExtractedFeature[];
  tradesWithContext?: number;
  tradesWithScreenshot?: number;
  duplicateRecords?: number;
  missingOutcomes?: number;
  // Historical data for stability
  historicalConfidences?: number[];          // per-cycle mean confidence
  historicalWinRates?: number[];             // per-cycle win rate
  historicalRecommendations?: number[];      // per-cycle recommendation count
  // From other engines
  calibrationECE?: number;                  // 0–1 from calibrator
  activeDriftAlerts?: number;
  criticalDriftAlerts?: number;
  passedValidations?: number;
  totalValidations?: number;
}

// ─── Grade Helper ─────────────────────────────────────────────────────────────

function grade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

// ─── Math Helpers ──────────────────────────────────────────────────────────────

function mean(vals: number[]): number {
  if (!vals.length) return 0;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function stdDev(vals: number[]): number {
  if (vals.length < 2) return 0;
  const m = mean(vals);
  return Math.sqrt(vals.reduce((s, v) => s + Math.pow(v - m, 2), 0) / vals.length);
}

function cv(vals: number[]): number {
  const m = mean(vals);
  return m > 0 ? stdDev(vals) / m : 0;
}

// ─── Dimension 1: Data Completeness ──────────────────────────────────────────

function scoreDataCompleteness(input: QualityInput): { score: number; detail: string; alerts: QualityAlert[] } {
  const { features } = input;
  const alerts: QualityAlert[] = [];

  if (features.length === 0) {
    return { score: 0, detail: "No trade data available", alerts };
  }

  const CRITICAL_FIELDS = ["pair", "session", "outcome", "pnl"] as const;
  let missingCount = 0;
  let totalFields = 0;

  for (const f of features) {
    for (const field of CRITICAL_FIELDS) {
      totalFields++;
      const v = (f as Record<string, unknown>)[field];
      if (v === null || v === undefined || (typeof v === "number" && isNaN(v as number))) {
        missingCount++;
      }
    }
  }

  const missingPct = totalFields > 0 ? (missingCount / totalFields) * 100 : 0;
  const completenessScore = Math.max(0, 100 - missingPct * 3);

  // Duplicate records
  const dupPenalty = Math.min(30, (input.duplicateRecords ?? 0) / features.length * 100);
  const missingOutcomesPenalty = Math.min(20, ((input.missingOutcomes ?? 0) / features.length) * 100);

  const score = Math.max(0, Math.round(completenessScore - dupPenalty - missingOutcomesPenalty));

  if (missingPct > 20) {
    alerts.push({
      alertId: randomUUID(),
      alertType: "missing_data",
      severity: missingPct > 40 ? "critical" : missingPct > 30 ? "high" : "medium",
      dimension: "data_completeness",
      value: missingPct,
      threshold: 20,
      title: "High Missing Data Rate",
      description: `${missingPct.toFixed(1)}% of critical fields are missing across ${features.length} trades.`,
      recommendation: "Review data pipeline. Ensure pair, session, outcome, and pnl are populated for every closed trade.",
    });
  }

  if ((input.duplicateRecords ?? 0) > 0) {
    alerts.push({
      alertId: randomUUID(),
      alertType: "duplicate_data",
      severity: (input.duplicateRecords ?? 0) > 10 ? "high" : "low",
      dimension: "data_completeness",
      value: input.duplicateRecords ?? 0,
      threshold: 0,
      title: "Duplicate Trade Records Detected",
      description: `${input.duplicateRecords} duplicate trade records found. These inflate sample size artificially.`,
      recommendation: "Deduplicate trade records by trade_id before running learning cycles.",
    });
  }

  const contextPct = features.length > 0 ? ((input.tradesWithContext ?? 0) / features.length) * 100 : 0;
  const detail = `${missingPct.toFixed(1)}% fields missing, ${contextPct.toFixed(0)}% trades with context, ${(input.duplicateRecords ?? 0)} duplicates`;

  return { score, detail, alerts };
}

// ─── Dimension 2: Sample Size ─────────────────────────────────────────────────

function scoreSampleSize(input: QualityInput): { score: number; detail: string; alerts: QualityAlert[] } {
  const n = input.features.length;
  const alerts: QualityAlert[] = [];

  let score: number;
  if (n >= 200) score = 100;
  else if (n >= 100) score = 80;
  else if (n >= 50) score = 65;
  else if (n >= 30) score = 50;
  else if (n >= 15) score = 35;
  else score = Math.round((n / 15) * 30);

  if (n < 30) {
    alerts.push({
      alertId: randomUUID(),
      alertType: "low_sample",
      severity: n < 10 ? "critical" : n < 20 ? "high" : "medium",
      dimension: "sample_size",
      value: n,
      threshold: 30,
      title: `Insufficient Sample Size (n=${n})`,
      description: `Only ${n} closed trades available. Statistical conclusions require n ≥ 30 minimum.`,
      recommendation: `Accumulate at least ${30 - n} more closed trades before treating learning outputs as reliable.`,
    });
  }

  const detail = `${n} trades (target: ≥100 for high confidence, ≥30 minimum)`;
  return { score, detail, alerts };
}

// ─── Dimension 3: Confidence Stability ───────────────────────────────────────

function scoreConfidenceStability(input: QualityInput): { score: number; detail: string; alerts: QualityAlert[] } {
  const alerts: QualityAlert[] = [];
  const hist = input.historicalConfidences ?? [];

  if (hist.length < 2) {
    return { score: 50, detail: "Insufficient history for stability measurement", alerts };
  }

  const cvVal = cv(hist);
  const score = Math.max(0, Math.round(100 - cvVal * 150));

  // Also check for declining trend
  if (hist.length >= 3) {
    const recent = hist.slice(-3);
    const older = hist.slice(0, -3);
    const recentMean = mean(recent);
    const olderMean = mean(older);
    const decline = olderMean - recentMean;

    if (decline > 10) {
      alerts.push({
        alertId: randomUUID(),
        alertType: "confidence_decline",
        severity: decline > 20 ? "high" : "medium",
        dimension: "confidence_stability",
        value: recentMean,
        threshold: olderMean - 5,
        delta: -decline,
        title: "Confidence Score Declining",
        description: `Mean confidence dropped ${decline.toFixed(1)} pts over recent cycles (${recentMean.toFixed(0)} vs ${olderMean.toFixed(0)} baseline).`,
        recommendation: "Investigate what is driving confidence decline. Check data quality, drift status, and validation results.",
      });
    }
  }

  if (cvVal > 0.25) {
    alerts.push({
      alertId: randomUUID(),
      alertType: "excessive_uncertainty",
      severity: cvVal > 0.40 ? "high" : "medium",
      dimension: "confidence_stability",
      value: cvVal,
      threshold: 0.25,
      title: "High Confidence Instability",
      description: `Confidence scores vary significantly across cycles (CV=${(cvVal * 100).toFixed(0)}%). This indicates inconsistent learning.`,
      recommendation: "Consider increasing minimum sample size or reducing cycle frequency to allow convergence.",
    });
  }

  const detail = `CV=${(cvVal * 100).toFixed(0)}% across ${hist.length} cycles, mean=${mean(hist).toFixed(0)}/100`;
  return { score, detail, alerts };
}

// ─── Dimension 4: Pattern Stability ──────────────────────────────────────────

function scorePatternStability(input: QualityInput): { score: number; detail: string; alerts: QualityAlert[] } {
  const alerts: QualityAlert[] = [];
  const hist = input.historicalWinRates ?? [];

  if (hist.length < 2) {
    return { score: 50, detail: "Insufficient history for pattern stability", alerts };
  }

  const cvVal = cv(hist);
  const score = Math.max(0, Math.round(100 - cvVal * 200));

  if (cvVal > 0.20) {
    alerts.push({
      alertId: randomUUID(),
      alertType: "pattern_instability",
      severity: cvVal > 0.35 ? "high" : "medium",
      dimension: "pattern_stability",
      value: cvVal,
      threshold: 0.20,
      title: "Pattern Win Rate Unstable",
      description: `Win rates vary significantly across cycles (CV=${(cvVal * 100).toFixed(0)}%). Pattern conclusions may not be reliable.`,
      recommendation: "Extend observation periods. Avoid drawing strong conclusions from volatile patterns.",
    });
  }

  const detail = `Win rate CV=${(cvVal * 100).toFixed(0)}% across ${hist.length} cycles`;
  return { score, detail, alerts };
}

// ─── Dimension 5: Recommendation Stability ───────────────────────────────────

function scoreRecommendationStability(input: QualityInput): { score: number; detail: string; alerts: QualityAlert[] } {
  const alerts: QualityAlert[] = [];
  const hist = input.historicalRecommendations ?? [];

  if (hist.length < 2) {
    return { score: 50, detail: "Insufficient history for recommendation stability", alerts };
  }

  const cvVal = cv(hist);
  const score = Math.max(0, Math.round(100 - cvVal * 150));

  if (cvVal > 0.30) {
    alerts.push({
      alertId: randomUUID(),
      alertType: "recommendation_instability",
      severity: "medium",
      dimension: "recommendation_stability",
      value: cvVal,
      threshold: 0.30,
      title: "Recommendation Count Unstable",
      description: `Advisory recommendation count varies significantly (CV=${(cvVal * 100).toFixed(0)}%). System outputs may be inconsistent.`,
      recommendation: "Review what is causing large swings in recommendation output between cycles.",
    });
  }

  const detail = `Recommendation CV=${(cvVal * 100).toFixed(0)}% across ${hist.length} cycles`;
  return { score, detail, alerts };
}

// ─── Dimension 6: Calibration Status ─────────────────────────────────────────

function scoreCalibration(input: QualityInput): { score: number; detail: string; alerts: QualityAlert[] } {
  const alerts: QualityAlert[] = [];
  const ece = input.calibrationECE;

  if (ece === undefined || ece === null) {
    return { score: 50, detail: "No calibration data available", alerts };
  }

  // ECE: 0 = perfect, 0.3+ = very poor
  const score = Math.max(0, Math.round(100 - ece * 333));

  if (ece > 0.10) {
    alerts.push({
      alertId: randomUUID(),
      alertType: "poor_calibration",
      severity: ece > 0.20 ? "high" : "medium",
      dimension: "calibration",
      value: ece,
      threshold: 0.10,
      title: "Poor Confidence Calibration",
      description: `Expected Calibration Error (ECE) = ${(ece * 100).toFixed(1)}%. Confidence scores do not accurately reflect actual outcomes.`,
      recommendation: "Review the confidence calibration report. Predicted confidence buckets deviate significantly from actual win rates.",
    });
  }

  const detail = `ECE=${(ece * 100).toFixed(1)}% (target < 10%)`;
  return { score, detail, alerts };
}

// ─── Dimension 7: Drift Status ────────────────────────────────────────────────

function scoreDrift(input: QualityInput): { score: number; detail: string; alerts: QualityAlert[] } {
  const alerts: QualityAlert[] = [];
  const active = input.activeDriftAlerts ?? 0;
  const critical = input.criticalDriftAlerts ?? 0;

  const score = Math.max(0, 100 - critical * 25 - (active - critical) * 10);

  if (critical > 0) {
    alerts.push({
      alertId: randomUUID(),
      alertType: "significant_drift",
      severity: "critical",
      dimension: "drift",
      value: critical,
      threshold: 0,
      title: `${critical} Critical Drift Alert${critical > 1 ? "s" : ""} Active`,
      description: `${critical} critical drift event(s) are active. Learning conclusions from drifted periods may be unreliable.`,
      recommendation: "Resolve critical drift alerts before trusting advisory outputs. Review drift report.",
    });
  } else if (active > 2) {
    alerts.push({
      alertId: randomUUID(),
      alertType: "significant_drift",
      severity: "medium",
      dimension: "drift",
      value: active,
      threshold: 2,
      title: `${active} Drift Alerts Active`,
      description: `Multiple drift alerts are active. Market conditions may have changed from the learning period.`,
      recommendation: "Review and resolve drift alerts. Run a fresh learning cycle to update conclusions.",
    });
  }

  const detail = `${active} active alert${active !== 1 ? "s" : ""} (${critical} critical)`;
  return { score, detail, alerts };
}

// ─── Dimension 8: Validation Success Rate ────────────────────────────────────

function scoreValidationSuccess(input: QualityInput): { score: number; detail: string; alerts: QualityAlert[] } {
  const alerts: QualityAlert[] = [];
  const passed = input.passedValidations ?? 0;
  const total = input.totalValidations ?? 0;

  if (total === 0) {
    return { score: 30, detail: "No validation runs recorded", alerts };
  }

  const successRate = passed / total;
  const score = Math.round(successRate * 100);

  if (successRate < 0.5) {
    alerts.push({
      alertId: randomUUID(),
      alertType: "validation_failure",
      severity: successRate < 0.25 ? "critical" : "high",
      dimension: "validation_success",
      value: successRate,
      threshold: 0.5,
      title: `Low Validation Success Rate (${(successRate * 100).toFixed(0)}%)`,
      description: `Only ${passed}/${total} learning cycles passed statistical validation. Advisory conclusions may be unreliable.`,
      recommendation: "Investigate why validation cycles are failing. Check sample size, data quality, and statistical significance.",
    });
  }

  const detail = `${passed}/${total} cycles passed (${(successRate * 100).toFixed(0)}%)`;
  return { score, detail, alerts };
}

// ─── Main Quality Monitor ─────────────────────────────────────────────────────

export function computeQualitySnapshot(input: QualityInput): QualitySnapshot {
  const snapshotId = randomUUID();

  const d1 = scoreDataCompleteness(input);
  const d2 = scoreSampleSize(input);
  const d3 = scoreConfidenceStability(input);
  const d4 = scorePatternStability(input);
  const d5 = scoreRecommendationStability(input);
  const d6 = scoreCalibration(input);
  const d7 = scoreDrift(input);
  const d8 = scoreValidationSuccess(input);

  const dimensionData = [
    { name: "Data Completeness",        score: d1.score, detail: d1.detail },
    { name: "Sample Size",              score: d2.score, detail: d2.detail },
    { name: "Confidence Stability",     score: d3.score, detail: d3.detail },
    { name: "Pattern Stability",        score: d4.score, detail: d4.detail },
    { name: "Recommendation Stability", score: d5.score, detail: d5.detail },
    { name: "Calibration Status",       score: d6.score, detail: d6.detail },
    { name: "Drift Status",             score: d7.score, detail: d7.detail },
    { name: "Validation Success",       score: d8.score, detail: d8.detail },
  ];

  const weight = 1 / dimensionData.length;
  const dimensions: QualityDimension[] = dimensionData.map(d => ({
    ...d,
    grade: grade(d.score),
    weight,
  }));

  const qualityScore = Math.round(dimensions.reduce((s, d) => s + d.score * d.weight, 0));
  const qualityGrade = grade(qualityScore);

  const allAlerts = [
    ...d1.alerts, ...d2.alerts, ...d3.alerts, ...d4.alerts,
    ...d5.alerts, ...d6.alerts, ...d7.alerts, ...d8.alerts,
  ];

  // Deduplicate alerts by type (keep highest severity)
  const seen = new Map<string, QualityAlert>();
  const sevOrder = { low: 0, medium: 1, high: 2, critical: 3 };
  for (const alert of allAlerts) {
    const key = `${alert.alertType}::${alert.dimension}`;
    const existing = seen.get(key);
    if (!existing || sevOrder[alert.severity] > sevOrder[existing.severity]) {
      seen.set(key, alert);
    }
  }
  const activeAlerts = [...seen.values()];
  const criticalAlerts = activeAlerts.filter(a => a.severity === "critical").length;

  // Strengths / weaknesses
  const strengths  = dimensions.filter(d => d.score >= 70).map(d => `${d.name}: ${d.detail}`);
  const weaknesses = dimensions.filter(d => d.score < 55).map(d => `${d.name}: ${d.detail}`);
  const recommendations: string[] = [];

  if (qualityScore < 55) {
    recommendations.push("Quality score below acceptable threshold. Suspend use of advisory outputs until score exceeds 55.");
  }
  for (const dim of dimensions.filter(d => d.score < 40)) {
    recommendations.push(`Improve ${dim.name}: ${dim.detail}`);
  }
  for (const alert of activeAlerts.filter(a => a.severity === "critical")) {
    recommendations.push(`Critical: ${alert.recommendation}`);
  }

  return {
    snapshotId,
    qualityScore,
    qualityGrade,
    dimensions,
    totalTrades: input.features.length,
    tradesWithContext: input.tradesWithContext ?? 0,
    tradesWithScreenshot: input.tradesWithScreenshot ?? 0,
    duplicateRecords: input.duplicateRecords ?? 0,
    missingOutcomes: input.missingOutcomes ?? 0,
    missingFeatures: input.features.filter(f => !f.pair || !f.session).length,
    activeAlerts,
    criticalAlerts,
    strengths,
    weaknesses,
    recommendations,
  };
}
