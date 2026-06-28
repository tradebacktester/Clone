// ─── Confidence Engine ──────────────────────────────────────────────────────
// Generates explainable confidence scores using statistical methods only.
// NO neural networks. NO reinforcement learning. NO automatic optimization.
//
// Method: Wilson Score lower bound (90% CI) × consistency factor × data quality factor
//
// Wilson lower bound formula:
//   p̂ = observed success rate (wins / n)
//   z = 1.645  (90% CI z-score)
//   lower = (p̂ + z²/2n − z·√((p̂(1−p̂) + z²/4n)/n)) / (1 + z²/n)
//
// This gives a conservative estimate that:
//   - Increases with more evidence
//   - Decreases with uncertainty
//   - Accounts for sample size automatically

import type {
  ExtractedFeature,
  SegmentMetrics,
  ConfidenceReport,
  SegmentConfidence,
  ConfidenceFactor,
  DataValidationResult,
} from "../learning-core/types.js";
import { safeDivide, clamp } from "../learning-validation/data-validator.js";
import { mean, stdDev, segmentBy } from "../learning-metrics/metrics-calculator.js";

const Z_90 = 1.645;           // 90% confidence interval
const MIN_SAMPLE = 5;          // minimum for any confidence estimate
const SUFFICIENT_SAMPLE = 30;  // sufficient for "high" tier

export type ConfidenceTier = "insufficient" | "low" | "moderate" | "high" | "very_high";

// ─── Wilson Score Lower Bound ─────────────────────────────────────────────────

export function wilsonLowerBound(wins: number, n: number, z: number = Z_90): number {
  if (n === 0) return 0;
  const p = wins / n;
  const z2 = z * z;
  const numerator = p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  const denominator = 1 + z2 / n;
  return clamp(numerator / denominator, 0, 1);
}

// ─── Consistency Factor ───────────────────────────────────────────────────────
// Measures how stable performance is across sub-segments.
// Lower std = more consistent = higher factor (0–1).

export function consistencyFactor(winRates: number[]): number {
  if (winRates.length < 2) return 0.8;  // single segment = moderate consistency
  const sd = stdDev(winRates);
  // SD of 0 → factor=1; SD of 0.5 → factor≈0 (max possible SD for rates)
  return clamp(1 - sd * 2, 0.1, 1.0);
}

// ─── Data Quality Factor ──────────────────────────────────────────────────────
// Penalises low data completeness from the validator.

export function dataQualityFactor(completenessScore: number): number {
  // completenessScore is 0–100
  // Maps linearly: 100→1.0, 50→0.5, 0→0
  return clamp(completenessScore / 100, 0, 1);
}

// ─── Single Segment Confidence ────────────────────────────────────────────────

export function computeSegmentConfidence(
  label: string,
  features: ExtractedFeature[],
  allFeatures: ExtractedFeature[],
  dataQuality: number,  // 0–100
): SegmentConfidence {
  const n = features.length;
  const wins = features.filter(f => f.outcome === "win").length;
  const observedRate = safeDivide(wins, n);

  if (n < MIN_SAMPLE) {
    return {
      label,
      sampleSize: n,
      observedSuccessRate: observedRate,
      wilsonLowerBound: 0,
      dataQualityFactor: dataQualityFactor(dataQuality),
      consistencyFactor: 0,
      finalConfidence: 0,
      confidenceTier: "insufficient",
      factors: [
        { name: "Sample Size", value: 0, weight: 1, explanation: `Only ${n} samples — minimum ${MIN_SAMPLE} required` },
      ],
      explanation: `Insufficient data (${n} samples). Minimum ${MIN_SAMPLE} required for any confidence estimate.`,
    };
  }

  const wilson = wilsonLowerBound(wins, n);
  const dqFactor = dataQualityFactor(dataQuality);

  // Cross-segment consistency: compare this label's win rate to all segments of same dimension
  const wr = observedRate;
  const allWr = allFeatures.length > 0 ? safeDivide(allFeatures.filter(f => f.outcome === "win").length, allFeatures.length) : wr;
  const consFactor = consistencyFactor([wr, allWr]);

  // Sample size bonus: asymptotically approaches 1 as n grows
  const sampleBonus = clamp(n / SUFFICIENT_SAMPLE, 0, 1);

  const factors: ConfidenceFactor[] = [
    {
      name: "Wilson Lower Bound",
      value: wilson,
      weight: 0.50,
      explanation: `Conservative 90% CI lower bound: ${(wilson * 100).toFixed(1)}% — accounts for sample size (n=${n})`,
    },
    {
      name: "Data Quality",
      value: dqFactor,
      weight: 0.25,
      explanation: `Data completeness: ${dataQuality.toFixed(0)}% — affects reliability of all metrics`,
    },
    {
      name: "Consistency",
      value: consFactor,
      weight: 0.15,
      explanation: `Performance consistency vs overall: ${(consFactor * 100).toFixed(0)}% — higher = more stable results`,
    },
    {
      name: "Sample Adequacy",
      value: sampleBonus,
      weight: 0.10,
      explanation: `Sample adequacy: ${n} / ${SUFFICIENT_SAMPLE} target — more trades = higher reliability`,
    },
  ];

  const rawScore = factors.reduce((s, f) => s + f.value * f.weight, 0);
  const finalConfidence = clamp(rawScore * 100, 0, 100);
  const tier = confidenceTier(finalConfidence, n);

  return {
    label,
    sampleSize: n,
    observedSuccessRate: observedRate,
    wilsonLowerBound: wilson,
    dataQualityFactor: dqFactor,
    consistencyFactor: consFactor,
    finalConfidence,
    confidenceTier: tier,
    factors,
    explanation: buildExplanation(label, n, observedRate, wilson, finalConfidence, tier),
  };
}

// ─── Full Confidence Report ───────────────────────────────────────────────────

export function computeConfidenceReport(
  features: ExtractedFeature[],
  validation: DataValidationResult,
): ConfidenceReport {
  const dq = validation.completenessScore;
  const n = features.length;
  const wins = features.filter(f => f.outcome === "win").length;
  const wilson = n >= MIN_SAMPLE ? wilsonLowerBound(wins, n) : 0;
  const dqF = dataQualityFactor(dq);
  const sampleBonus = clamp(n / SUFFICIENT_SAMPLE, 0, 1);

  const overallRaw = n >= MIN_SAMPLE
    ? (wilson * 0.50 + dqF * 0.25 + sampleBonus * 0.25) * 100
    : 0;
  const overallConfidence = clamp(overallRaw, 0, 100);
  const overallTier = confidenceTier(overallConfidence, n);

  const pairGroups = segmentBy(features, f => f.pair);
  const sessionGroups = segmentBy(features, f => f.session);
  const regimeGroups = segmentBy(features, f => f.marketRegime);
  const amdGroups = segmentBy(features, f => f.marketRegime); // reuse for AMD

  const byPair = computeGroupConfidence(features, f => f.pair, dq);
  const bySession = computeGroupConfidence(features, f => f.session, dq);
  const byRegime = computeGroupConfidence(features, f => f.marketRegime, dq);
  const byAmdPattern = computeGroupConfidence(features, f => f.marketRegime, dq);

  return {
    overallConfidence,
    overallTier,
    minSampleReached: n >= MIN_SAMPLE,
    byPair,
    bySession,
    byRegime,
    byAmdPattern,
    dataQuality: dq,
    sampleSize: n,
    methodology: buildMethodologyDescription(),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeGroupConfidence(
  features: ExtractedFeature[],
  keyFn: (f: ExtractedFeature) => string,
  dataQuality: number,
): Record<string, SegmentConfidence> {
  const groups: Record<string, ExtractedFeature[]> = {};
  for (const f of features) {
    const k = keyFn(f) || "unknown";
    (groups[k] ??= []).push(f);
  }
  const result: Record<string, SegmentConfidence> = {};
  for (const [label, group] of Object.entries(groups)) {
    result[label] = computeSegmentConfidence(label, group, features, dataQuality);
  }
  return result;
}

export function confidenceTier(score: number, n: number): ConfidenceTier {
  if (n < MIN_SAMPLE) return "insufficient";
  if (score < 30) return "low";
  if (score < 50) return "moderate";
  if (score < 75) return "high";
  return "very_high";
}

function buildExplanation(
  label: string,
  n: number,
  rate: number,
  wilson: number,
  final: number,
  tier: ConfidenceTier,
): string {
  return (
    `[${label}] n=${n} trades, observed win rate=${(rate * 100).toFixed(1)}%, ` +
    `Wilson lower bound=${(wilson * 100).toFixed(1)}%, ` +
    `final confidence=${final.toFixed(1)}% (${tier}). ` +
    `Confidence will increase as more trades are logged.`
  );
}

function buildMethodologyDescription(): string {
  return (
    "Confidence uses the Wilson score lower bound (90% CI) as the primary estimate, " +
    "multiplied by a data quality factor (completeness %) and a consistency factor " +
    "(stability of win rate across sub-segments). This gives conservative, " +
    "sample-size-aware confidence scores that automatically increase with more evidence " +
    "and decrease with sparse or inconsistent data. No neural networks or ML models are used."
  );
}
