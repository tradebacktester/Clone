// ─── Confidence Calibration Engine ───────────────────────────────────────────
// Phase 4 Enhancement: Verifies whether confidence scores reflect reality.
// ADVISORY ONLY — never modifies trading behavior or confidence calculation.
//
// Metrics computed:
//   - Brier Score (lower = better probabilistic forecaster)
//   - ECE  — Expected Calibration Error (weighted avg bucket error)
//   - MCE  — Maximum Calibration Error (worst bucket)
//   - ACE  — Average Calibration Error (unweighted)
//   - Reliability diagram data (10 buckets)
//   - Overconfidence / underconfidence classification
//   - Calibration trend (comparing historical snapshots)

import { randomUUID } from "crypto";
import type { ExtractedFeature } from "../learning-core/types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReliabilityBucket {
  bucketLabel: string;       // "0-10%", "10-20%", etc.
  confidenceLow: number;     // 0.0
  confidenceHigh: number;    // 0.1
  count: number;             // trades in this bucket
  predictedAvg: number;      // mean confidence (0–1) of trades in bucket
  actualRate: number;        // actual win rate of trades in bucket (0–1)
  calibrationError: number;  // |predictedAvg - actualRate|
  status: "overconfident" | "underconfident" | "well_calibrated" | "empty";
}
/** @deprecated alias kept for compatibility */
export type CalibrationBucket = ReliabilityBucket;

export interface CalibrationResult {
  calibrationId: string;
  evaluationWindow: string;
  totalSamples: number;

  // Core metrics
  brierScore: number;        // 0 (perfect) to 1 (worst)
  ece: number;               // Expected Calibration Error
  mce: number;               // Maximum Calibration Error
  ace: number;               // Average Calibration Error (unweighted)
  calibrationError: number;  // Overall mean calibration error

  // Status counts
  overconfidentBuckets: number;
  underconfidentBuckets: number;
  wellCalibratedBuckets: number;
  overconfidentPct: number;
  underconfidentPct: number;

  // Reliability diagram data
  buckets: ReliabilityBucket[];

  // Summary
  calibrationGrade: "A" | "B" | "C" | "D" | "F";
  calibrationStatus: "well_calibrated" | "overconfident" | "underconfident" | "mixed" | "uncalibrated";
  calibrationTrend: "improving" | "stable" | "degrading";
  summary: string;
}

// Historical snapshot for trend comparison
export interface CalibrationSnapshot {
  evaluatedAt: Date;
  brierScore: number;
  ece: number;
  calibrationStatus: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Maps a confidence score (0–100) to a fraction (0–1).
// Confidence scores in KRYTOS range 0–100; normalize to 0–1 probability.
function normConf(c: number): number {
  return Math.min(1, Math.max(0, c / 100));
}

// ─── Brier Score ──────────────────────────────────────────────────────────────
// Mean squared error between predicted probability and actual outcome.
// Perfect = 0. Worst = 1. Random = 0.25.

function computeBrierScore(features: ExtractedFeature[]): number {
  if (features.length === 0) return 0.25; // default to "random"
  const mse = features.reduce((sum, f) => {
    const p = normConf(f.confidence);
    const o = f.outcome === "win" ? 1 : 0;
    return sum + Math.pow(p - o, 2);
  }, 0) / features.length;
  return Math.round(mse * 1_000_000) / 1_000_000;
}

// ─── Reliability Diagram ──────────────────────────────────────────────────────
// 10 equal-width buckets in [0, 1] confidence space.
// For each bucket: compute mean predicted confidence and actual win rate.

function computeReliabilityBuckets(features: ExtractedFeature[]): ReliabilityBucket[] {
  const NUM_BUCKETS = 10;
  const buckets: ReliabilityBucket[] = [];

  for (let i = 0; i < NUM_BUCKETS; i++) {
    const low  = i / NUM_BUCKETS;       // 0.0, 0.1, ..., 0.9
    const high = (i + 1) / NUM_BUCKETS; // 0.1, 0.2, ..., 1.0

    const inBucket = features.filter(f => {
      const p = normConf(f.confidence);
      return p >= low && (i === NUM_BUCKETS - 1 ? p <= high : p < high);
    });

    if (inBucket.length === 0) {
      buckets.push({
        bucketLabel: `${Math.round(low * 100)}-${Math.round(high * 100)}%`,
        confidenceLow: low,
        confidenceHigh: high,
        count: 0,
        predictedAvg: (low + high) / 2,
        actualRate: 0,
        calibrationError: 0,
        status: "empty",
      });
      continue;
    }

    const predictedAvg = inBucket.reduce((s, f) => s + normConf(f.confidence), 0) / inBucket.length;
    const wins = inBucket.filter(f => f.outcome === "win").length;
    const actualRate = wins / inBucket.length;
    const calibrationError = Math.abs(predictedAvg - actualRate);

    let status: CalibrationBucket["status"];
    if (calibrationError < 0.05) status = "well_calibrated";
    else if (predictedAvg > actualRate) status = "overconfident";
    else status = "underconfident";

    buckets.push({
      bucketLabel: `${Math.round(low * 100)}-${Math.round(high * 100)}%`,
      confidenceLow: low,
      confidenceHigh: high,
      count: inBucket.length,
      predictedAvg,
      actualRate,
      calibrationError,
      status,
    });
  }

  return buckets;
}

// ─── ECE Computation ─────────────────────────────────────────────────────────
// Expected Calibration Error = Σ (|bucket| / n) × |conf - accuracy|

function computeECE(buckets: ReliabilityBucket[], totalN: number): number {
  if (totalN === 0) return 0;
  return buckets
    .filter(b => b.status !== "empty")
    .reduce((sum, b) => sum + (b.count / totalN) * b.calibrationError, 0);
}

// MCE = max bucket calibration error among non-empty buckets

function computeMCE(buckets: ReliabilityBucket[]): number {
  const nonEmpty = buckets.filter(b => b.status !== "empty");
  if (nonEmpty.length === 0) return 0;
  return Math.max(...nonEmpty.map(b => b.calibrationError));
}

// ACE = simple mean of bucket errors (unweighted)

function computeACE(buckets: ReliabilityBucket[]): number {
  const nonEmpty = buckets.filter(b => b.status !== "empty");
  if (nonEmpty.length === 0) return 0;
  return nonEmpty.reduce((s, b) => s + b.calibrationError, 0) / nonEmpty.length;
}

// ─── Grade & Status ───────────────────────────────────────────────────────────

function gradeFromECE(ece: number): "A" | "B" | "C" | "D" | "F" {
  if (ece < 0.03) return "A";
  if (ece < 0.06) return "B";
  if (ece < 0.10) return "C";
  if (ece < 0.15) return "D";
  return "F";
}

function statusFromBuckets(buckets: ReliabilityBucket[]): CalibrationResult["calibrationStatus"] {
  const nonEmpty = buckets.filter(b => b.status !== "empty");
  if (nonEmpty.length === 0) return "uncalibrated";
  const over  = nonEmpty.filter(b => b.status === "overconfident").length;
  const under = nonEmpty.filter(b => b.status === "underconfident").length;
  const well  = nonEmpty.filter(b => b.status === "well_calibrated").length;
  if (well === nonEmpty.length) return "well_calibrated";
  if (over > under && over > well) return "overconfident";
  if (under > over && under > well) return "underconfident";
  return "mixed";
}

// ─── Calibration Trend ────────────────────────────────────────────────────────

function computeCalibrationTrend(
  historicalSnapshots: CalibrationSnapshot[],
): CalibrationResult["calibrationTrend"] {
  if (historicalSnapshots.length < 2) return "stable";

  const sorted = [...historicalSnapshots].sort((a, b) =>
    a.evaluatedAt.getTime() - b.evaluatedAt.getTime(),
  );

  // Compare last two snapshots
  const prev = sorted[sorted.length - 2];
  const curr = sorted[sorted.length - 1];
  const eceDelta = curr.ece - prev.ece;

  if (eceDelta < -0.01) return "improving";
  if (eceDelta > 0.01) return "degrading";
  return "stable";
}

// ─── Main Calibration Engine ──────────────────────────────────────────────────

export function runCalibration(
  features: ExtractedFeature[],
  options: {
    evaluationWindow?: string;
    historicalSnapshots?: CalibrationSnapshot[];
  } = {},
): CalibrationResult {
  const calibrationId = randomUUID();
  const { evaluationWindow = "all", historicalSnapshots = [] } = options;

  const brierScore = computeBrierScore(features);
  const buckets = computeReliabilityBuckets(features);
  const totalSamples = features.length;

  const ece = computeECE(buckets, totalSamples);
  const mce = computeMCE(buckets);
  const ace = computeACE(buckets);
  const calibrationError = ece; // primary metric

  const overconfidentBuckets = buckets.filter(b => b.status === "overconfident").length;
  const underconfidentBuckets = buckets.filter(b => b.status === "underconfident").length;
  const wellCalibratedBuckets = buckets.filter(b => b.status === "well_calibrated").length;
  const nonEmptyCount = buckets.filter(b => b.status !== "empty").length;

  const overconfidentPct  = nonEmptyCount > 0 ? Math.round((overconfidentBuckets / nonEmptyCount) * 100)  : 0;
  const underconfidentPct = nonEmptyCount > 0 ? Math.round((underconfidentBuckets / nonEmptyCount) * 100) : 0;

  const calibrationGrade = gradeFromECE(ece);
  const calibrationStatus = statusFromBuckets(buckets);
  const calibrationTrend = computeCalibrationTrend(historicalSnapshots);

  let summary: string;
  if (totalSamples < 30) {
    summary = `Insufficient data for reliable calibration (${totalSamples} samples, need ≥ 30).`;
  } else if (calibrationStatus === "well_calibrated") {
    summary = `Excellent calibration (ECE=${(ece * 100).toFixed(1)}%, grade ${calibrationGrade}). Confidence scores accurately reflect actual outcomes.`;
  } else if (calibrationStatus === "overconfident") {
    summary = `System is OVERCONFIDENT (ECE=${(ece * 100).toFixed(1)}%, ${overconfidentBuckets} buckets over-predicting). Predicted probabilities exceed actual win rates.`;
  } else if (calibrationStatus === "underconfident") {
    summary = `System is UNDERCONFIDENT (ECE=${(ece * 100).toFixed(1)}%, ${underconfidentBuckets} buckets under-predicting). Actual win rates exceed predicted probabilities.`;
  } else {
    summary = `Mixed calibration (ECE=${(ece * 100).toFixed(1)}%, grade ${calibrationGrade}). Some buckets over-predict, others under-predict.`;
  }

  return {
    calibrationId,
    evaluationWindow,
    totalSamples,
    brierScore,
    ece,
    mce,
    ace,
    calibrationError,
    overconfidentBuckets,
    underconfidentBuckets,
    wellCalibratedBuckets,
    overconfidentPct,
    underconfidentPct,
    buckets,
    calibrationGrade,
    calibrationStatus,
    calibrationTrend,
    summary,
  };
}

// ─── Window Filter Helper ─────────────────────────────────────────────────────

export function filterByWindow(features: ExtractedFeature[], windowDays: number | null): ExtractedFeature[] {
  if (!windowDays) return features;
  const cutoff = new Date(Date.now() - windowDays * 24 * 3600 * 1000);
  return features.filter(f => f.openedAt >= cutoff);
}
