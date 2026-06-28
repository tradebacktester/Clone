// ─── Feature Importance Validator ─────────────────────────────────────────────
// Safeguards: rejects conclusions from insufficient data, detects contradictions,
// flags unstable importance, identifies overfitting risk.
// Advisory only — never modifies trading behavior.

import type { FeatureImportanceResult, InteractionResult, ValidationFlags } from "./types.js";
import { MIN_SAMPLE_SIZE, SUFFICIENT_SAMPLE_SIZE } from "./types.js";

// ─── Validation note builder ──────────────────────────────────────────────────

export interface FeatureValidationReport {
  totalFeatures: number;
  sufficientFeatures: number;
  insufficientFeatures: number;
  featuresWithContradictions: number;
  unstableFeatures: number;
  overfittingRisk: { none: number; low: number; medium: number; high: number };
  globalNotes: string[];
  isValid: boolean;
  overallDataQuality: "good" | "moderate" | "poor";
}

// ─── Validate individual feature ──────────────────────────────────────────────

export function validateFeature(f: FeatureImportanceResult): ValidationFlags {
  // Contradiction: strong correlation in one direction but win rate disagrees
  const hasContradiction = (
    (f.correlationCoeff > 0.35 && f.winRate < 0.35) ||
    (f.correlationCoeff < -0.35 && f.winRate > 0.65)
  );
  const contradictionNote = hasContradiction
    ? `Correlation direction (${f.correlationCoeff > 0 ? "positive" : "negative"} r=${f.correlationCoeff.toFixed(2)}) contradicts win rate ${(f.winRate * 100).toFixed(1)}%`
    : undefined;

  // Instability: check if already flagged or predictive value flipped
  const isUnstable = f.isUnstable || (f.predictiveValue > 70 && f.sampleSize < 10);
  const instabilityNote = isUnstable
    ? (f.instabilityNote ?? `High apparent predictive value with small sample (n=${f.sampleSize}) — likely unstable`)
    : undefined;

  // Overfitting
  let overfittingRisk = f.overfittingRisk;
  if (f.sampleSize < 5 && f.predictiveValue > 50) overfittingRisk = "high";
  else if (f.sampleSize < 10 && f.predictiveValue > 65) overfittingRisk = "medium";
  else if (f.sampleSize < SUFFICIENT_SAMPLE_SIZE && f.predictiveValue > 80) overfittingRisk = "low";

  // Insufficient data
  const isInsufficient = f.sampleSize < MIN_SAMPLE_SIZE;
  const insufficientReason = isInsufficient
    ? `Sample size ${f.sampleSize} is below the minimum threshold of ${MIN_SAMPLE_SIZE}`
    : undefined;

  return {
    isInsufficient,
    insufficientReason,
    hasContradiction,
    contradictionNote,
    isUnstable,
    instabilityNote,
    overfittingRisk,
  };
}

// ─── Validate a full feature set ──────────────────────────────────────────────

export function validateFeatureSet(
  features: FeatureImportanceResult[],
  sampleSize: number,
): FeatureValidationReport {
  const notes: string[] = [];

  const sufficient = features.filter(f => !f.isInsufficient);
  const insufficient = features.filter(f => f.isInsufficient);
  const contradicted = features.filter(f => f.hasContradiction);
  const unstable = features.filter(f => f.isUnstable);

  const riskCounts = { none: 0, low: 0, medium: 0, high: 0 };
  for (const f of features) riskCounts[f.overfittingRisk]++;

  // Global data quality
  if (sampleSize < MIN_SAMPLE_SIZE) {
    notes.push(`Critical: total sample size (${sampleSize}) is below minimum ${MIN_SAMPLE_SIZE}. No reliable conclusions possible.`);
  } else if (sampleSize < SUFFICIENT_SAMPLE_SIZE) {
    notes.push(`Warning: sample size (${sampleSize}) is below recommended ${SUFFICIENT_SAMPLE_SIZE}. Treat all conclusions with caution.`);
  }

  if (insufficient.length > features.length * 0.6) {
    notes.push(`Warning: ${insufficient.length}/${features.length} features have insufficient data.`);
  }

  if (contradicted.length > 0) {
    notes.push(`Warning: ${contradicted.length} feature(s) show contradictory evidence — correlation contradicts win rate.`);
  }

  if (unstable.length > 0) {
    notes.push(`Warning: ${unstable.length} feature(s) show high result variability — may not be reliable.`);
  }

  if (riskCounts.high > 0) {
    notes.push(`Warning: ${riskCounts.high} feature(s) have HIGH overfitting risk — conclusions based on tiny samples.`);
  }

  const sufficientRatio = sufficient.length / Math.max(features.length, 1);
  let overallDataQuality: "good" | "moderate" | "poor" = "good";
  if (sufficientRatio < 0.4 || sampleSize < MIN_SAMPLE_SIZE) overallDataQuality = "poor";
  else if (sufficientRatio < 0.7 || sampleSize < SUFFICIENT_SAMPLE_SIZE) overallDataQuality = "moderate";

  const isValid = sampleSize >= MIN_SAMPLE_SIZE && sufficient.length > 0;

  return {
    totalFeatures: features.length,
    sufficientFeatures: sufficient.length,
    insufficientFeatures: insufficient.length,
    featuresWithContradictions: contradicted.length,
    unstableFeatures: unstable.length,
    overfittingRisk: riskCounts,
    globalNotes: notes,
    isValid,
    overallDataQuality,
  };
}

// ─── Validate interactions ────────────────────────────────────────────────────

export function validateInteractions(interactions: InteractionResult[]): string[] {
  const notes: string[] = [];
  const sufficient = interactions.filter(i => !i.isInsufficient);
  const synergistic = interactions.filter(i => i.isSynergistic);

  if (sufficient.length === 0) {
    notes.push("No interaction has sufficient data to draw conclusions.");
  } else {
    notes.push(`${sufficient.length}/${interactions.length} interactions have sufficient data.`);
    if (synergistic.length > 0) {
      notes.push(`${synergistic.length} synergistic combination(s) identified.`);
    }
  }

  // Detect if all synergy is driven by one dominant pair
  const domination = interactions.filter(i => i.synergyScore > 70 && !i.isInsufficient);
  if (domination.length === 1 && sufficient.length > 3) {
    notes.push(`Only one interaction shows high synergy — may reflect sampling bias rather than genuine interaction.`);
  }

  return notes;
}
