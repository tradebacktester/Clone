// ─── Confirmation Intelligence Analyzer ──────────────────────────────────────
// Evaluates candle strength, momentum, body ratio, break strength, displacement,
// and follow-through probability.
// Advisory only.

import { clamp, CONFIRMATION_INTEL_WEIGHTS } from "./types.js";
import type { QualitySetup, ConfirmationIntelligenceResult } from "./types.js";

function computeCandleStrength(setup: QualitySetup): number {
  if (setup.candleStrength !== undefined) return clamp(setup.candleStrength, 0, 100);
  return clamp(setup.confirmationQuality * 0.90, 0, 100);
}

function computeMomentum(setup: QualitySetup): number {
  if (setup.momentum !== undefined) return clamp(setup.momentum, 0, 100);
  return clamp((setup.confirmationQuality * 0.6 + setup.tqi * 0.4), 0, 100);
}

function computeBodyRatio(setup: QualitySetup): number {
  if (setup.candleBodyRatio !== undefined) return clamp(setup.candleBodyRatio, 0, 100);
  // Proxy: strong confirmation quality implies large body candle
  return clamp(setup.confirmationQuality * 0.85 + 8, 0, 100);
}

function computeBreakStrength(setup: QualitySetup): number {
  if (setup.breakStrength !== undefined) return clamp(setup.breakStrength, 0, 100);
  return clamp((setup.confirmationQuality * 0.5 + setup.amdScore * 0.3 + setup.tqi * 0.2), 0, 100);
}

function computeDisplacement(setup: QualitySetup): number {
  if (setup.displacement !== undefined) return clamp(setup.displacement, 0, 100);
  // High AMD + confirmation = strong displacement
  return clamp((setup.amdScore * 0.6 + setup.confirmationQuality * 0.4), 0, 100);
}

function computeFollowThrough(setup: QualitySetup): number {
  if (setup.followThroughProb !== undefined) return clamp(setup.followThroughProb, 0, 100);
  // RR-based inference: higher planned RR in trending markets → better follow through
  const rrScore  = clamp((setup.rrPlanned / 4.0) * 70, 0, 70);
  const regBonus = setup.regime === "trending" ? 20 : setup.regime === "ranging" ? 5 : 10;
  return clamp(rrScore + regBonus, 0, 100);
}

export function analyzeConfirmationIntelligence(setup: QualitySetup): ConfirmationIntelligenceResult {
  const candleStrengthScore = computeCandleStrength(setup);
  const momentumScore       = computeMomentum(setup);
  const bodyRatioScore      = computeBodyRatio(setup);
  const breakStrengthScore  = computeBreakStrength(setup);
  const displacementScore   = computeDisplacement(setup);
  const followThroughScore  = computeFollowThrough(setup);

  const confirmationIntelligenceScore = clamp(
    candleStrengthScore * CONFIRMATION_INTEL_WEIGHTS.candleStrength +
    momentumScore       * CONFIRMATION_INTEL_WEIGHTS.momentum +
    bodyRatioScore      * CONFIRMATION_INTEL_WEIGHTS.bodyRatio +
    breakStrengthScore  * CONFIRMATION_INTEL_WEIGHTS.breakStrength +
    displacementScore   * CONFIRMATION_INTEL_WEIGHTS.displacement +
    followThroughScore  * CONFIRMATION_INTEL_WEIGHTS.followThrough,
    0, 100,
  );

  const explanations: string[] = [
    `Confirmation Intelligence Score: ${confirmationIntelligenceScore.toFixed(1)}/100`,
    `Candle Strength: ${candleStrengthScore.toFixed(0)} | Momentum: ${momentumScore.toFixed(0)} | Body Ratio: ${bodyRatioScore.toFixed(0)}`,
    `Break Strength: ${breakStrengthScore.toFixed(0)} | Displacement: ${displacementScore.toFixed(0)} | Follow-Through: ${followThroughScore.toFixed(0)}`,
  ];
  if (displacementScore >= 80 && breakStrengthScore >= 80) {
    explanations.push("Strong displacement + break — institutional execution confirmed.");
  }
  if (confirmationIntelligenceScore < 50) {
    explanations.push("⚠ Weak confirmation — entry signal lacks conviction.");
  }

  return {
    candleStrengthScore,
    momentumScore,
    bodyRatioScore,
    breakStrengthScore,
    displacementScore,
    followThroughScore,
    confirmationIntelligenceScore,
    explanations,
  };
}
