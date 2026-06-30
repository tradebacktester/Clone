// ─── Trader Identity — Report Generator ──────────────────────────────────────
// Builds narrative text for the trader identity report.

import type {
  IdentitySetup,
  IdentityStage,
  RuleSimilarityResult,
  HistoricalSimilarityResult,
  PreferenceAlignmentResult,
  IdentitySimilarityScore,
  ConsistencyResult,
  AdaptiveIdentityResult,
} from "./types.js";

// ─── Stage label ──────────────────────────────────────────────────────────────

export function stageLabel(stage: IdentityStage): string {
  return stage === "adaptive_identity"
    ? "Stage 2 — Adaptive Identity"
    : "Stage 1 — Rule Identity";
}

// ─── Full narrative ────────────────────────────────────────────────────────────

export function buildIdentityNarrative(
  setup:      IdentitySetup,
  similarity: IdentitySimilarityScore,
  consistency:ConsistencyResult,
  rule:       RuleSimilarityResult,
  historical: HistoricalSimilarityResult,
  preference: PreferenceAlignmentResult,
  adaptive:   AdaptiveIdentityResult,
): string {
  const lines: string[] = [];
  const stage = adaptive.stage === "adaptive_identity"
    ? "Stage 2 Adaptive Identity"
    : "Stage 1 Rule Identity";

  lines.push(
    `${consistency.label} — Identity Similarity: ${similarity.identitySimilarityScore.toFixed(1)}/100 [${stage}]`,
  );
  lines.push(
    `Setup: ${setup.pair} | ${setup.session} session | ${setup.regime} regime | ${setup.trend} trend | ${setup.volatility} volatility.`,
  );

  // Consistency verdict
  lines.push(consistency.reason);

  // Rule evidence
  lines.push(rule.summary);

  // Historical evidence
  if (historical.sampleSize > 0) {
    lines.push(historical.summary);
  }

  // Preference alignment
  if (adaptive.stage === "adaptive_identity") {
    lines.push(preference.summary);
    if (preference.aligned.length > 0) {
      lines.push(`Aligned with identity preferences: ${preference.aligned.slice(0, 3).join("; ")}.`);
    }
    if (preference.misaligned.length > 0) {
      lines.push(`Diverges from identity preferences: ${preference.misaligned.slice(0, 2).join("; ")}.`);
    }
  } else {
    const n = adaptive.sampleSize;
    const need = 20 - n;
    lines.push(
      `Adaptive identity not yet active. ${need > 0 ? `${need} more verified trades required to unlock Stage 2.` : "Sample size reached — updating to Stage 2."}`,
    );
  }

  // Statistical confidence note
  const conf = similarity.statisticalConfidence;
  if (conf < 40) {
    lines.push("Statistical confidence is low — conclusions are preliminary and will improve with more trade history.");
  } else if (conf < 70) {
    lines.push(`Statistical confidence: ${conf.toFixed(0)}% — moderate evidence base.`);
  } else {
    lines.push(`Statistical confidence: ${conf.toFixed(0)}% — well-supported conclusions.`);
  }

  lines.push("ADVISORY ONLY — This analysis is observational and does not modify the trading strategy.");

  return lines.join(" ");
}
