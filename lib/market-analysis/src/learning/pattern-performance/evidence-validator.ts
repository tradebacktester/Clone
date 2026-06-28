// ─── Evidence Validator ───────────────────────────────────────────────────────
// Enforces strict evidence rules:
//   • Every conclusion must show sample size, confidence, data quality, version
//   • If evidence is insufficient, returns isInsufficient=true with explanation
//   • Never guesses — never reports stats on insufficient evidence

import type { PatternStats, PatternEvidence } from "./types.js";
import { MIN_EVIDENCE_SAMPLE } from "./types.js";

const Z_90 = 1.645;

// ─── Wilson Score Lower Bound (90% CI) ───────────────────────────────────────

export function wilsonScore(wins: number, n: number): number {
  if (n < MIN_EVIDENCE_SAMPLE) return 0;
  const p = wins / n;
  const z2 = Z_90 * Z_90;
  const num = p + z2 / (2 * n) - Z_90 * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  const den = 1 + z2 / n;
  return Math.max(0, Math.min(1, num / den));
}

// ─── Composite Confidence Score ───────────────────────────────────────────────
// Weights: Wilson 60% + data quality 25% + sample adequacy 15%

export function compositeConfidence(
  wins: number,
  n: number,
  dataQuality: number,
): number {
  if (n < MIN_EVIDENCE_SAMPLE) return 0;
  const wilson = wilsonScore(wins, n) * 100;
  const quality = Math.max(0, Math.min(100, dataQuality));
  const adequacy = Math.min(100, (n / 30) * 100);
  return Math.round((wilson * 0.60 + quality * 0.25 + adequacy * 0.15) * 10) / 10;
}

// ─── Evidence Object ──────────────────────────────────────────────────────────

export function validateEvidence(
  stats: PatternStats,
  dataQuality: number,
  version: string,
): PatternEvidence {
  const isInsufficient = stats.sampleSize < MIN_EVIDENCE_SAMPLE;
  const confidence = isInsufficient
    ? 0
    : compositeConfidence(stats.wins, stats.sampleSize, dataQuality);

  return {
    evidenceCount: stats.sampleSize,
    statisticalConfidence: confidence,
    dataQualityScore: Math.round(dataQuality * 10) / 10,
    lastUpdated: new Date(),
    learningVersion: version,
    isInsufficient,
    insufficientReason: isInsufficient
      ? `Insufficient historical evidence. ${stats.sampleSize} trade(s) recorded — minimum required: ${MIN_EVIDENCE_SAMPLE}.`
      : undefined,
  };
}

export const INSUFFICIENT_MESSAGE = "Insufficient historical evidence." as const;
