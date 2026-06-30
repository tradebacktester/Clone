// ─── AMD Intelligence Analyzer ───────────────────────────────────────────────
// Evaluates accumulation, manipulation, distribution quality, completeness,
// and confidence in the AMD sequence identification.
// Advisory only.

import { clamp, AMD_INTEL_WEIGHTS } from "./types.js";
import type { QualitySetup, AmdIntelligenceResult } from "./types.js";

function computeAccumulation(setup: QualitySetup): number {
  if (setup.accumulationQuality !== undefined) return clamp(setup.accumulationQuality, 0, 100);
  // Infer from supply/demand + liquidity: accumulation requires a valid base/zone
  return clamp((setup.supplyQuality * 0.35 + setup.demandQuality * 0.35 + setup.liquidityScore * 0.30), 0, 100);
}

function computeManipulation(setup: QualitySetup): number {
  if (setup.manipulationQuality !== undefined) return clamp(setup.manipulationQuality, 0, 100);
  // Manipulation = stop hunt + liquidity sweep quality
  return clamp(setup.amdScore * 0.95, 0, 100);
}

function computeDistribution(setup: QualitySetup): number {
  if (setup.distributionQuality !== undefined) return clamp(setup.distributionQuality, 0, 100);
  // Distribution quality ∝ confirmation quality + AMD score
  return clamp((setup.confirmationQuality * 0.5 + setup.amdScore * 0.5), 0, 100);
}

function computeCompleteness(setup: QualitySetup): number {
  if (setup.amdCompleteness !== undefined) return clamp(setup.amdCompleteness, 0, 100);
  // Infer: high AMD score + confirmation = complete AMD sequence
  const base = 40;
  let bonus = 0;
  if (setup.amdScore >= 75)           bonus += 30;
  else if (setup.amdScore >= 60)      bonus += 20;
  if (setup.confirmationQuality >= 70) bonus += 20;
  if (setup.liquidityScore >= 65)     bonus += 10;
  return clamp(base + bonus, 0, 100);
}

function computeAmdConfidence(setup: QualitySetup): number {
  if (setup.amdConfidence !== undefined) return clamp(setup.amdConfidence, 0, 100);
  // Overall AMD confidence from signal consistency
  return clamp(
    setup.amdScore * 0.50 +
    setup.setupScore * 0.30 +
    setup.tqi * 0.20,
    0, 100,
  );
}

export function analyzeAmdIntelligence(setup: QualitySetup): AmdIntelligenceResult {
  const accumulationScore  = computeAccumulation(setup);
  const manipulationScore  = computeManipulation(setup);
  const distributionScore  = computeDistribution(setup);
  const completenessScore  = computeCompleteness(setup);
  const amdConfidenceScore = computeAmdConfidence(setup);

  const amdIntelligenceScore = clamp(
    accumulationScore  * AMD_INTEL_WEIGHTS.accumulation +
    manipulationScore  * AMD_INTEL_WEIGHTS.manipulation +
    distributionScore  * AMD_INTEL_WEIGHTS.distribution +
    completenessScore  * AMD_INTEL_WEIGHTS.completeness +
    amdConfidenceScore * AMD_INTEL_WEIGHTS.confidence,
    0, 100,
  );

  const explanations: string[] = [
    `AMD Intelligence Score: ${amdIntelligenceScore.toFixed(1)}/100`,
    `Accumulation: ${accumulationScore.toFixed(0)} | Manipulation: ${manipulationScore.toFixed(0)} | Distribution: ${distributionScore.toFixed(0)}`,
    `Sequence Completeness: ${completenessScore.toFixed(0)} | AMD Confidence: ${amdConfidenceScore.toFixed(0)}`,
  ];
  if (completenessScore >= 80)  explanations.push("Full AMD sequence confirmed — high-confidence institutional pattern.");
  if (manipulationScore >= 80)  explanations.push("Strong manipulation phase — clear stop hunt detected.");
  if (amdIntelligenceScore < 50) explanations.push("⚠ Incomplete or unclear AMD sequence — proceed with caution.");

  return {
    accumulationScore,
    manipulationScore,
    distributionScore,
    completenessScore,
    amdConfidenceScore,
    amdIntelligenceScore,
    explanations,
  };
}
