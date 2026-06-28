// ─── Confidence Calculator ────────────────────────────────────────────────────
// Multi-factor confidence for a trade recommendation.
// Distinct from TIS: confidence measures HOW SURE we are about the TIS,
// while TIS measures HOW GOOD the setup looks.
// Advisory only — no trade execution.

import { clamp } from "../learning-validation/data-validator.js";
import { wilsonLowerBound } from "../learning-confidence/confidence-engine.js";
import type { CurrentSetup, ValidationFlag, EvidenceFactor } from "./types.js";
import {
  LOW_CONFIDENCE_THRESHOLD,
  MIN_EVIDENCE_FOR_RECOMMENDATION,
} from "./types.js";
import type { TisResult } from "./setup-scorer.js";
import type { MatchResult } from "./historical-matcher.js";

// ─── Confidence factors ───────────────────────────────────────────────────────

interface ConfidenceFactor {
  name: string;
  value: number;   // 0–1
  weight: number;  // 0–1
  explanation: string;
}

// ─── Compute confidence (0–100) ───────────────────────────────────────────────

export interface ConfidenceResult {
  confidenceScore: number;
  isLowConfidence: boolean;
  hasConflictingEvidence: boolean;
  validationFlags: ValidationFlag[];
  factors: ConfidenceFactor[];
}

export function computeRecommendationConfidence(
  setup: CurrentSetup,
  tisResult: TisResult,
  match: MatchResult,
  positiveFactors: EvidenceFactor[],
  negativeFactors: EvidenceFactor[],
): ConfidenceResult {
  const factors: ConfidenceFactor[] = [];
  const flags: ValidationFlag[] = [];

  // ── Factor 1: Evidence quantity (Wilson lower bound on similar set) ──
  const n       = match.evidenceCount;
  const nWins   = match.similarWins.length;
  const wilson  = n >= 3 ? wilsonLowerBound(nWins, n) : 0;
  const evidenceF: ConfidenceFactor = {
    name: "Historical Evidence",
    value: clamp(Math.min(n / 30, 1) * 0.7 + wilson * 0.3, 0, 1),
    weight: 0.30,
    explanation: `${n} similar setups found; Wilson lower bound ${(wilson*100).toFixed(1)}%`,
  };
  factors.push(evidenceF);

  // ── Factor 2: TIS score stability (how many components scored high) ──
  const sufficientComponents = tisResult.components.filter(c => !c.isInsufficient);
  const highComponents       = sufficientComponents.filter(c => c.score >= 55);
  const stabilityValue = sufficientComponents.length > 0
    ? highComponents.length / sufficientComponents.length
    : 0;
  factors.push({
    name: "TIS Stability",
    value: stabilityValue,
    weight: 0.25,
    explanation: `${highComponents.length}/${sufficientComponents.length} TIS components scored above 55`,
  });

  // ── Factor 3: Factor agreement (do pos/neg factors agree with recommendation?) ──
  const totalPositiveImpact = positiveFactors.reduce((s, f) => s + f.impact, 0);
  const totalNegativeImpact = negativeFactors.reduce((s, f) => s + Math.abs(f.impact), 0);
  const factorBalance = totalPositiveImpact + totalNegativeImpact > 0
    ? totalPositiveImpact / (totalPositiveImpact + totalNegativeImpact)
    : 0.5;
  const hasConflict = positiveFactors.length > 0 && negativeFactors.length > 0 &&
    totalNegativeImpact > totalPositiveImpact * 0.8;

  factors.push({
    name: "Factor Agreement",
    value: factorBalance,
    weight: 0.20,
    explanation: `Positive impact: ${totalPositiveImpact.toFixed(0)}, negative: ${totalNegativeImpact.toFixed(0)}`,
  });

  // ── Factor 4: Setup quality consistency ──
  const qualityScores = [
    setup.supplyQuality || setup.demandQuality,
    setup.liquidityScore,
    setup.amdScore,
    setup.confirmationQuality,
  ];
  const avgQ    = qualityScores.reduce((s, v) => s + v, 0) / qualityScores.length;
  const maxDiff = Math.max(...qualityScores) - Math.min(...qualityScores);
  const consistency = clamp(1 - maxDiff / 100, 0, 1);
  factors.push({
    name: "Setup Consistency",
    value: consistency,
    weight: 0.15,
    explanation: `Avg quality ${avgQ.toFixed(1)}, spread ${maxDiff.toFixed(0)} pts — consistency ${(consistency*100).toFixed(0)}%`,
  });

  // ── Factor 5: RR adequacy ──
  const rrValue = clamp((setup.rrPlanned - 0.5) / 3.5, 0, 1);
  factors.push({
    name: "Risk:Reward Adequacy",
    value: rrValue,
    weight: 0.10,
    explanation: `Planned RR ${setup.rrPlanned.toFixed(1)}:1 — ${rrValue >= 0.6 ? "adequate" : rrValue >= 0.3 ? "moderate" : "insufficient"}`,
  });

  // ── Compute raw confidence ──
  const rawScore = factors.reduce((s, f) => s + f.value * f.weight, 0);
  const confidenceScore = clamp(Math.round(rawScore * 100 * 10) / 10, 0, 100);

  // ── Validation flags ──
  if (n < MIN_EVIDENCE_FOR_RECOMMENDATION) {
    flags.push({
      type: "insufficient_evidence",
      message: `Only ${n} similar historical setups — recommendation based on limited evidence`,
      severity: n === 0 ? "error" : "warning",
    });
  }

  if (confidenceScore < LOW_CONFIDENCE_THRESHOLD) {
    flags.push({
      type: "low_confidence",
      message: `Confidence score ${confidenceScore.toFixed(1)}% is below the ${LOW_CONFIDENCE_THRESHOLD}% threshold`,
      severity: "warning",
    });
  }

  if (hasConflict) {
    flags.push({
      type: "conflicting_evidence",
      message: `Positive and negative factors are nearly balanced — conflicting evidence detected`,
      severity: "warning",
    });
  }

  const unstableComponents = tisResult.components.filter(
    c => !c.isInsufficient && c.score < 25,
  );
  if (unstableComponents.length >= 3) {
    flags.push({
      type: "unstable_features",
      message: `${unstableComponents.length} TIS components are extremely low — setup may be unreliable`,
      severity: "warning",
    });
  }

  const highUncertainty = n < 5 || confidenceScore < 30;
  if (highUncertainty) {
    flags.push({
      type: "high_uncertainty",
      message: "High uncertainty: either limited evidence or low confidence — treat recommendation as indicative only",
      severity: "warning",
    });
  }

  return {
    confidenceScore,
    isLowConfidence: confidenceScore < LOW_CONFIDENCE_THRESHOLD,
    hasConflictingEvidence: hasConflict,
    validationFlags: flags,
    factors,
  };
}
