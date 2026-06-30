// ─── Structural Quality Analyzer ─────────────────────────────────────────────
// Evaluates HTF alignment, S/R strength, premium/discount positioning,
// supply/demand quality, zone freshness/respect, and market structure cleanliness.
// Advisory only.

import { clamp, STRUCTURAL_WEIGHTS } from "./types.js";
import type { QualitySetup, StructuralQualityResult } from "./types.js";

// ─── HTF alignment ────────────────────────────────────────────────────────────
// If not provided, we infer from regime + trend coherence.
function computeHtfAlignment(setup: QualitySetup): number {
  if (setup.htfAlignment !== undefined) return clamp(setup.htfAlignment, 0, 100);
  // Infer: trending regime with clear trend direction → strong HTF alignment
  const regime = setup.regime.toLowerCase();
  const trend  = setup.trend.toLowerCase();
  let score = 50; // neutral baseline
  if (regime === "trending") score += 25;
  if (regime === "ranging")  score -= 10;
  if (trend === "bullish" || trend === "bearish") score += 15;
  if (trend === "unknown")   score -= 15;
  if (setup.tqi >= 70)       score += 10;
  return clamp(score, 0, 100);
}

// ─── S/R strength ─────────────────────────────────────────────────────────────
function computeSrStrength(setup: QualitySetup): number {
  if (setup.srStrength !== undefined) return clamp(setup.srStrength, 0, 100);
  // Infer from zone quality: strong supply/demand implies strong S/R
  const zoneAvg = (setup.supplyQuality + setup.demandQuality) / 2;
  return clamp(zoneAvg * 0.9 + setup.setupScore * 0.1, 0, 100);
}

// ─── Premium/discount positioning ────────────────────────────────────────────
function computePremiumDiscount(setup: QualitySetup): number {
  if (setup.premiumDiscountBias !== undefined) return clamp(setup.premiumDiscountBias, 0, 100);
  // Infer: amd score reflects manipulation (which defines discount entry)
  const base = 50;
  const amdBonus = (setup.amdScore - 50) * 0.5;
  return clamp(base + amdBonus, 0, 100);
}

// ─── Supply/demand composite ──────────────────────────────────────────────────
function computeSupplyDemand(setup: QualitySetup): number {
  return clamp((setup.supplyQuality * 0.5 + setup.demandQuality * 0.5), 0, 100);
}

// ─── Zone freshness ───────────────────────────────────────────────────────────
function computeZoneFreshness(setup: QualitySetup): number {
  if (setup.zoneFreshness !== undefined) return clamp(setup.zoneFreshness, 0, 100);
  // No direct input — use regime + setup score as proxy
  // Fresh zones tend to occur after clean MSB in trending markets
  let score = 55;
  if (setup.regime === "trending")  score += 15;
  if (setup.setupScore >= 75)       score += 15;
  if (setup.liquidityScore >= 70)   score += 10;
  if (setup.regime === "ranging")   score -= 10;
  return clamp(score, 0, 100);
}

// ─── Zone respect ─────────────────────────────────────────────────────────────
function computeZoneRespect(setup: QualitySetup): number {
  if (setup.zoneRespect !== undefined) return clamp(setup.zoneRespect, 0, 100);
  // Infer from supply/demand quality: high quality zones are well-respected
  const zoneAvg = (setup.supplyQuality + setup.demandQuality) / 2;
  return clamp(zoneAvg * 0.8 + 20, 0, 100);
}

// ─── Market structure cleanliness ─────────────────────────────────────────────
function computeCleanliness(setup: QualitySetup): number {
  if (setup.marketStructureCleanliness !== undefined) return clamp(setup.marketStructureCleanliness, 0, 100);
  // Infer: low volatility extreme + trending regime = cleaner structure
  let score = 55;
  if (setup.regime === "trending")   score += 20;
  if (setup.volatility === "medium") score += 10;
  if (setup.volatility === "extreme") score -= 20;
  if (setup.tqi >= 70)              score += 10;
  return clamp(score, 0, 100);
}

// ─── Main analyzer ────────────────────────────────────────────────────────────

export function analyzeStructuralQuality(setup: QualitySetup): StructuralQualityResult {
  const htfAlignmentScore   = computeHtfAlignment(setup);
  const srStrengthScore     = computeSrStrength(setup);
  const premiumDiscountScore = computePremiumDiscount(setup);
  const supplyDemandScore   = computeSupplyDemand(setup);
  const zoneFreshnessScore  = computeZoneFreshness(setup);
  const zoneRespectScore    = computeZoneRespect(setup);
  const cleanlinessScore    = computeCleanliness(setup);

  const structuralQualityScore = clamp(
    htfAlignmentScore   * STRUCTURAL_WEIGHTS.htfAlignment +
    srStrengthScore     * STRUCTURAL_WEIGHTS.srStrength +
    premiumDiscountScore * STRUCTURAL_WEIGHTS.premiumDiscount +
    supplyDemandScore   * STRUCTURAL_WEIGHTS.supplyDemand +
    zoneFreshnessScore  * STRUCTURAL_WEIGHTS.zoneFreshness +
    zoneRespectScore    * STRUCTURAL_WEIGHTS.zoneRespect +
    cleanlinessScore    * STRUCTURAL_WEIGHTS.cleanliness,
    0, 100,
  );

  const explanations: string[] = [
    `Structural Quality Score: ${structuralQualityScore.toFixed(1)}/100`,
    `HTF Alignment: ${htfAlignmentScore.toFixed(0)} | S/R Strength: ${srStrengthScore.toFixed(0)} | Premium/Discount: ${premiumDiscountScore.toFixed(0)}`,
    `Supply/Demand: ${supplyDemandScore.toFixed(0)} | Zone Freshness: ${zoneFreshnessScore.toFixed(0)} | Zone Respect: ${zoneRespectScore.toFixed(0)}`,
    `Market Structure Cleanliness: ${cleanlinessScore.toFixed(0)}`,
  ];
  if (htfAlignmentScore >= 80) explanations.push("Strong HTF structure alignment detected.");
  if (zoneFreshnessScore >= 80) explanations.push("Fresh zone — first test expected.");
  if (supplyDemandScore < 55) explanations.push("⚠ Below-average supply/demand quality.");

  return {
    htfAlignmentScore,
    srStrengthScore,
    premiumDiscountScore,
    supplyDemandScore,
    zoneFreshnessScore,
    zoneRespectScore,
    cleanlinessScore,
    structuralQualityScore,
    explanations,
  };
}
