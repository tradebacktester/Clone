// ─── Liquidity Intelligence Analyzer ─────────────────────────────────────────
// Evaluates sweep size, clarity, stop-hunt quality, manipulation, distribution.
// Advisory only.

import { clamp, LIQUIDITY_INTEL_WEIGHTS } from "./types.js";
import type { QualitySetup, LiquidityIntelligenceResult } from "./types.js";

function computeSweepSize(setup: QualitySetup): number {
  if (setup.liquiditySweepSize !== undefined) return clamp(setup.liquiditySweepSize, 0, 100);
  // Infer from liquidityScore: higher base score → meaningful sweep
  return clamp(setup.liquidityScore * 0.85 + 10, 0, 100);
}

function computeSweepClarity(setup: QualitySetup): number {
  if (setup.liquiditySweepClarity !== undefined) return clamp(setup.liquiditySweepClarity, 0, 100);
  // Infer: high AMD + confirmation quality suggests a clear, readable sweep
  return clamp((setup.amdScore * 0.4 + setup.liquidityScore * 0.4 + setup.confirmationQuality * 0.2), 0, 100);
}

function computeStopHunt(setup: QualitySetup): number {
  if (setup.stopHuntQuality !== undefined) return clamp(setup.stopHuntQuality, 0, 100);
  // Infer from AMD + liquidity composite
  return clamp((setup.amdScore * 0.5 + setup.liquidityScore * 0.5), 0, 100);
}

function computeManipulation(setup: QualitySetup): number {
  if (setup.manipulationClarity !== undefined) return clamp(setup.manipulationClarity, 0, 100);
  // Infer from amdScore (manipulation is the M in AMD)
  return clamp(setup.amdScore * 0.9, 0, 100);
}

function computeDistribution(setup: QualitySetup): number {
  if (setup.distributionStrength !== undefined) return clamp(setup.distributionStrength, 0, 100);
  // Infer from AMD + supply quality
  return clamp((setup.amdScore * 0.6 + setup.supplyQuality * 0.4), 0, 100);
}

export function analyzeLiquidityIntelligence(setup: QualitySetup): LiquidityIntelligenceResult {
  const sweepSizeScore    = computeSweepSize(setup);
  const sweepClarityScore = computeSweepClarity(setup);
  const stopHuntScore     = computeStopHunt(setup);
  const manipulationScore = computeManipulation(setup);
  const distributionScore = computeDistribution(setup);

  const liquidityIntelligenceScore = clamp(
    sweepSizeScore    * LIQUIDITY_INTEL_WEIGHTS.sweepSize +
    sweepClarityScore * LIQUIDITY_INTEL_WEIGHTS.sweepClarity +
    stopHuntScore     * LIQUIDITY_INTEL_WEIGHTS.stopHunt +
    manipulationScore * LIQUIDITY_INTEL_WEIGHTS.manipulation +
    distributionScore * LIQUIDITY_INTEL_WEIGHTS.distribution,
    0, 100,
  );

  const explanations: string[] = [
    `Liquidity Intelligence Score: ${liquidityIntelligenceScore.toFixed(1)}/100`,
    `Sweep Size: ${sweepSizeScore.toFixed(0)} | Sweep Clarity: ${sweepClarityScore.toFixed(0)} | Stop Hunt: ${stopHuntScore.toFixed(0)}`,
    `Manipulation: ${manipulationScore.toFixed(0)} | Distribution Strength: ${distributionScore.toFixed(0)}`,
  ];
  if (sweepClarityScore >= 80) explanations.push("Highly visible liquidity sweep — institutional footprint clear.");
  if (liquidityIntelligenceScore < 50) explanations.push("⚠ Weak liquidity intelligence — sweep quality below standard.");

  return {
    sweepSizeScore,
    sweepClarityScore,
    stopHuntScore,
    manipulationScore,
    distributionScore,
    liquidityIntelligenceScore,
    explanations,
  };
}
