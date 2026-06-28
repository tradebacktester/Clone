// ─── Recommendation Accuracy Tracker ─────────────────────────────────────────
// Phase 3: Measures the quality of advisory recommendations against outcomes.
// Tracks: Precision, Recall, F1, Accuracy, Brier Score, TIS calibration.
// Advisory only — no strategy modification.

import { randomUUID } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecommendationRecord {
  recommendationId: string;
  recommendedAction: "take" | "skip";  // advisory action recommended
  confidence: number;                  // 0–100 predicted confidence
  tisScore: number;                    // Trade Intelligence Score 0–100
  actualOutcome: "win" | "loss" | "break_even" | "skipped";
  pnl?: number;
  evaluatedAt: Date;
}

export interface AccuracyEvaluation {
  evaluationId: string;
  evaluationWindow: string;

  totalRecommendations: number;
  evaluated: number;

  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;

  precision: number;
  recall: number;
  f1Score: number;
  accuracy: number;
  brierScore: number;

  tisCorrelation: number;
  tisMae: number;
  tisBias: number;

  calibrationError: number;
  overconfidentPct: number;
  underconfidentPct: number;

  bucketBreakdown: CalibrationBucket[];
}

export interface CalibrationBucket {
  confidenceRange: string;    // e.g., "60-70%"
  count: number;
  actualWinRate: number;
  avgPredictedConfidence: number;
  calibrationError: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function meanVal(vals: number[]): number {
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function pearsonCorrelation(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 2) return 0;
  const mx = meanVal(xs);
  const my = meanVal(ys);
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const dx = Math.sqrt(xs.reduce((s, x) => s + Math.pow(x - mx, 2), 0));
  const dy = Math.sqrt(ys.reduce((s, y) => s + Math.pow(y - my, 2), 0));
  return dx > 0 && dy > 0 ? num / (dx * dy) : 0;
}

// ─── Calibration Buckets ──────────────────────────────────────────────────────
// Groups predictions by confidence bucket (0-10, 10-20, … 90-100) to measure
// how well the stated confidence matches actual win rates.

function buildCalibrationBuckets(records: RecommendationRecord[]): CalibrationBucket[] {
  const buckets: CalibrationBucket[] = [];

  for (let low = 0; low < 100; low += 10) {
    const high = low + 10;
    const slice = records.filter(r => r.confidence >= low && r.confidence < high);
    if (slice.length === 0) continue;

    const wins = slice.filter(r => r.actualOutcome === "win").length;
    const actualWinRate = wins / slice.length;
    const avgConf = meanVal(slice.map(r => r.confidence / 100));
    const calError = Math.abs(actualWinRate - avgConf);

    buckets.push({
      confidenceRange: `${low}-${high}%`,
      count: slice.length,
      actualWinRate,
      avgPredictedConfidence: avgConf,
      calibrationError: calError,
    });
  }

  return buckets;
}

// ─── Brier Score ──────────────────────────────────────────────────────────────
// Measures probabilistic accuracy: Σ(p - o)² / N
// 0 = perfect calibration, 1 = worst possible.

function computeBrierScore(records: RecommendationRecord[]): number {
  if (!records.length) return 0.5;
  const sum = records.reduce((s, r) => {
    const p = r.confidence / 100;
    const o = r.actualOutcome === "win" ? 1 : 0;
    return s + Math.pow(p - o, 2);
  }, 0);
  return sum / records.length;
}

// ─── TIS Accuracy ─────────────────────────────────────────────────────────────

function computeTISAccuracy(records: RecommendationRecord[]): {
  correlation: number;
  mae: number;
  bias: number;
} {
  const withOutcomes = records.filter(r => r.actualOutcome !== "skipped");
  if (withOutcomes.length < 3) return { correlation: 0, mae: 0, bias: 0 };

  const tis = withOutcomes.map(r => r.tisScore / 100);
  const outcomes = withOutcomes.map(r => (r.actualOutcome === "win" ? 1 : 0));

  const correlation = pearsonCorrelation(tis, outcomes);
  const mae = meanVal(tis.map((t, i) => Math.abs(t - outcomes[i])));
  const bias = meanVal(tis.map((t, i) => t - outcomes[i])); // positive = overconfident

  return { correlation, mae, bias };
}

// ─── Main Evaluator ───────────────────────────────────────────────────────────

export function evaluateRecommendationAccuracy(
  records: RecommendationRecord[],
  window: string = "all",
): AccuracyEvaluation {
  const evaluated = records.filter(r => r.actualOutcome !== "skipped");

  // Confusion matrix: "take" = positive class
  // TP: recommended take, outcome = win
  // FP: recommended take, outcome = loss
  // TN: recommended skip, outcome = loss (correct skip)
  // FN: recommended skip, outcome = win (missed opportunity)

  const truePositives = evaluated.filter(r => r.recommendedAction === "take" && r.actualOutcome === "win").length;
  const falsePositives = evaluated.filter(r => r.recommendedAction === "take" && r.actualOutcome === "loss").length;
  const trueNegatives = evaluated.filter(r => r.recommendedAction === "skip" && r.actualOutcome === "loss").length;
  const falseNegatives = evaluated.filter(r => r.recommendedAction === "skip" && r.actualOutcome === "win").length;

  const precision = truePositives + falsePositives > 0
    ? truePositives / (truePositives + falsePositives) : 0;
  const recall = truePositives + falseNegatives > 0
    ? truePositives / (truePositives + falseNegatives) : 0;
  const f1Score = precision + recall > 0
    ? 2 * precision * recall / (precision + recall) : 0;
  const accuracy = evaluated.length > 0
    ? (truePositives + trueNegatives) / evaluated.length : 0;

  const brierScore = computeBrierScore(evaluated);
  const { correlation: tisCorrelation, mae: tisMae, bias: tisBias } = computeTISAccuracy(evaluated);

  const bucketBreakdown = buildCalibrationBuckets(evaluated);
  const calibrationError = bucketBreakdown.length > 0
    ? meanVal(bucketBreakdown.map(b => b.calibrationError)) : 0;
  const overconfidentPct = evaluated.length > 0
    ? evaluated.filter(r => r.confidence / 100 > 0.5 && r.actualOutcome !== "win").length / evaluated.length * 100 : 0;
  const underconfidentPct = evaluated.length > 0
    ? evaluated.filter(r => r.confidence / 100 < 0.5 && r.actualOutcome === "win").length / evaluated.length * 100 : 0;

  return {
    evaluationId: randomUUID(),
    evaluationWindow: window,
    totalRecommendations: records.length,
    evaluated: evaluated.length,
    truePositives,
    falsePositives,
    trueNegatives,
    falseNegatives,
    precision,
    recall,
    f1Score,
    accuracy,
    brierScore,
    tisCorrelation,
    tisMae,
    tisBias,
    calibrationError,
    overconfidentPct,
    underconfidentPct,
    bucketBreakdown,
  };
}
