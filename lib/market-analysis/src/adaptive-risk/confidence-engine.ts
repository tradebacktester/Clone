// ─── Confidence Engine ────────────────────────────────────────────────────────
// Computes confidence score, statistical significance, and reliability rating.
// Rejects recommendations with insufficient evidence.

import type { ConfidenceResult, TradeRecord, EvidenceItem } from "./types.js";
import { MIN_SAMPLE_SIZE, MIN_CONFIDENT_SAMPLE } from "./types.js";
import { statisticalSignificance, wilsonLowerBound } from "./stats-util.js";

export function computeConfidence(
  trades: TradeRecord[],
  evidenceItems: EvidenceItem[],
): ConfidenceResult {
  const n = trades.length;

  if (n < MIN_SAMPLE_SIZE) {
    return {
      score: Math.round((n / MIN_SAMPLE_SIZE) * 20),
      label: "insufficient",
      sampleSize: n,
      statisticalSignificance: 0,
      reliabilityRating: "insufficient",
      hasMinimumEvidence: false,
    };
  }

  const sig = statisticalSignificance(trades);

  // Win rate & evidence quality
  const wins    = trades.filter(t => t.pnl > 0).length;
  const winRate = wins / n;
  const wilsonLb = wilsonLowerBound(wins, n);

  // Evidence breadth — how many dimension have evidence
  const evidenceDimensions = new Set(evidenceItems.map(e => e.dimension)).size;
  const breadthBonus = Math.min(20, evidenceDimensions * 5);

  // Sample size score
  const sampleScore = Math.min(40, (n / MIN_CONFIDENT_SAMPLE) * 40);

  // Statistical significance contribution
  const sigScore = sig * 25;

  // Win rate (wilson lower bound to be conservative)
  const winScore = wilsonLb > 0.4 ? (wilsonLb - 0.4) * 30 : 0;

  const raw = sampleScore + sigScore + winScore + breadthBonus;
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  const label = score >= 85 ? "very_high"
              : score >= 70 ? "high"
              : score >= 50 ? "moderate"
              : score >= 30 ? "low"
              : n >= MIN_SAMPLE_SIZE ? "very_low"
              : "insufficient";

  const reliabilityRating = score >= 85 ? "institutional"
                          : score >= 70 ? "strong"
                          : score >= 50 ? "moderate"
                          : score >= 30 ? "weak"
                          : "insufficient";

  return {
    score,
    label: label as ConfidenceResult["label"],
    sampleSize: n,
    statisticalSignificance: Math.round(sig * 1000) / 1000,
    reliabilityRating: reliabilityRating as ConfidenceResult["reliabilityRating"],
    hasMinimumEvidence: n >= MIN_SAMPLE_SIZE,
  };
}

// Gate: return true if a recommendation should be issued
export function hasEnoughEvidence(confidence: ConfidenceResult): boolean {
  return confidence.hasMinimumEvidence && confidence.score >= 20;
}

// Collect evidence items from environment stats
export function buildEvidenceItems(
  allStats: Array<{ environment: string; environmentKey: string; riskScore: number; sampleSize: number; winRate: number; expectancy: number }>,
): EvidenceItem[] {
  return allStats
    .filter(s => s.sampleSize >= MIN_SAMPLE_SIZE)
    .map(s => ({
      dimension:  s.environment,
      key:        s.environmentKey,
      stat:       `Win ${(s.winRate * 100).toFixed(1)}% | E:${s.expectancy.toFixed(2)}R`,
      value:      s.riskScore,
      riskRating: s.riskScore >= 70 ? "favorable" : s.riskScore >= 50 ? "neutral" : s.riskScore >= 30 ? "unfavorable" : "avoid",
      sampleSize: s.sampleSize,
      weight:     Math.min(1, s.sampleSize / MIN_CONFIDENT_SAMPLE),
    }));
}
