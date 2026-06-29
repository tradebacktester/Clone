// ─── Pattern Strength Analyzer ────────────────────────────────────────────────
// Evaluates Supply/Demand quality, Liquidity Sweep quality, AMD quality,
// and Confirmation quality to produce a Pattern Strength Score (0–100).
// Advisory only.

import { clamp } from "../learning-validation/data-validator.js";
import type { StrategySetup, PatternStrengthResult } from "./types.js";
import { PATTERN_STRENGTH_WEIGHTS } from "./types.js";

// ─── Individual pattern dimension scorers ─────────────────────────────────────

function scoreZone(supply: number, demand: number): { score: number; detail: string } {
  // Use the best available zone
  const best  = Math.max(supply, demand);
  const worst = Math.min(supply, demand);
  // Reward having both zones strong, penalise divergence
  const composite = clamp(best * 0.70 + worst * 0.30, 0, 100);
  let quality: string;
  if (composite >= 80) quality = "institutional grade";
  else if (composite >= 65) quality = "strong";
  else if (composite >= 50) quality = "adequate";
  else quality = "weak";
  return {
    score: composite,
    detail: `Zone quality: ${quality} — supply ${supply.toFixed(1)}, demand ${demand.toFixed(1)}, composite ${composite.toFixed(1)}/100`,
  };
}

function scoreLiquiditySweep(liquidityScore: number): { score: number; detail: string } {
  const score = clamp(liquidityScore, 0, 100);
  let quality: string;
  if (score >= 75) quality = "clean institutional sweep";
  else if (score >= 60) quality = "valid sweep with structure";
  else if (score >= 45) quality = "marginal sweep";
  else quality = "weak or absent sweep";
  return {
    score,
    detail: `Liquidity sweep: ${quality} (${score.toFixed(1)}/100)`,
  };
}

function scoreAMD(amdScore: number): { score: number; detail: string } {
  const score = clamp(amdScore, 0, 100);
  let phase: string;
  if (score >= 75) phase = "clearly defined — textbook AMD";
  else if (score >= 60) phase = "identifiable AMD cycle";
  else if (score >= 45) phase = "partial AMD evidence";
  else phase = "AMD not confirmed";
  return {
    score,
    detail: `AMD structure: ${phase} (${score.toFixed(1)}/100)`,
  };
}

function scoreConfirmation(confirmationQuality: number): { score: number; detail: string } {
  const score = clamp(confirmationQuality, 0, 100);
  let quality: string;
  if (score >= 80) quality = "multi-confluence confirmation";
  else if (score >= 65) quality = "strong confirmation";
  else if (score >= 50) quality = "adequate confirmation";
  else quality = "weak or insufficient confirmation";
  return {
    score,
    detail: `Entry confirmation: ${quality} (${score.toFixed(1)}/100)`,
  };
}

// ─── Composite pattern strength score ────────────────────────────────────────

export function analyzePatternStrength(setup: StrategySetup): PatternStrengthResult {
  const zone        = scoreZone(setup.supplyQuality, setup.demandQuality);
  const sweepResult = scoreLiquiditySweep(setup.liquidityScore);
  const amdResult   = scoreAMD(setup.amdScore);
  const confirmResult = scoreConfirmation(setup.confirmationQuality);

  const patternStrengthScore = clamp(
    zone.score         * PATTERN_STRENGTH_WEIGHTS.zone         +
    sweepResult.score  * PATTERN_STRENGTH_WEIGHTS.liquiditySweep +
    amdResult.score    * PATTERN_STRENGTH_WEIGHTS.amd          +
    confirmResult.score * PATTERN_STRENGTH_WEIGHTS.confirmation,
    0, 100,
  );

  return {
    supplyScore:          clamp(setup.supplyQuality, 0, 100),
    demandScore:          clamp(setup.demandQuality, 0, 100),
    zoneScore:            zone.score,
    liquiditySweepScore:  sweepResult.score,
    amdScore:             amdResult.score,
    confirmationScore:    confirmResult.score,
    patternStrengthScore,
    explanations: [
      zone.detail,
      sweepResult.detail,
      amdResult.detail,
      confirmResult.detail,
      `Pattern Strength Score: ${patternStrengthScore.toFixed(1)}/100`,
    ],
  };
}
