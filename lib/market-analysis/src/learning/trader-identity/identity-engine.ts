// ─── Trader Identity Engine — Main Orchestrator ───────────────────────────────
// Advisory only. Never modifies the live trading strategy or execution logic.

import { randomUUID } from "crypto";
import { TI_ENGINE_VERSION } from "./types.js";
import { evaluateRuleIdentity }        from "./rule-identity.js";
import { analyzeAdaptiveIdentity }     from "./preference-analyzer.js";
import { computeRuleSimilarity, computeHistoricalSimilarity, computePreferenceAlignment, computeIdentitySimilarity } from "./similarity-calculator.js";
import { evaluateConsistency }         from "./consistency-evaluator.js";
import { detectDrift }                 from "./drift-detector.js";
import { buildIdentityNarrative, stageLabel } from "./report-generator.js";
import type {
  IdentitySetup,
  IdentityFeature,
  TraderIdentityReport,
  IdentityProfile,
  DriftReport,
  AdaptiveIdentityResult,
} from "./types.js";

// ─── Build identity profile ───────────────────────────────────────────────────

export function buildIdentityProfile(
  historicalTrades: IdentityFeature[],
): IdentityProfile {
  const adaptive   = analyzeAdaptiveIdentity(historicalTrades);
  const ruleResult = evaluateRuleIdentity({
    pair: "EURUSD", session: "london", regime: "trending", trend: "bullish",
    volatility: "medium", supplyQuality: 75, demandQuality: 75,
    liquidityScore: 75, amdScore: 75, confirmationQuality: 75,
    setupScore: 75, tqi: 75, rrPlanned: 2.0, spreadPips: 1.0,
  });

  return {
    profileId:       randomUUID(),
    version:         TI_ENGINE_VERSION,
    stage:           adaptive.stage,
    sampleSize:      adaptive.sampleSize,
    confidenceScore: adaptive.confidenceScore,
    ruleIdentity:    { ...ruleResult, ruleBaselineScore: 100 },
    adaptiveIdentity: adaptive.stage === "adaptive_identity" ? adaptive : null,
    isAdvisoryOnly:  true,
    createdAt:       new Date(),
  };
}

// ─── Run full engine for a setup ──────────────────────────────────────────────

export function runTraderIdentityEngine(
  setup:            IdentitySetup,
  historicalTrades: IdentityFeature[],
): TraderIdentityReport {
  const evaluatedAt = setup.evaluatedAt ?? new Date();

  // Step 1 — Rule identity evaluation
  const ruleIdentity   = evaluateRuleIdentity(setup);

  // Step 2 — Adaptive identity from historical trades
  const adaptive: AdaptiveIdentityResult = analyzeAdaptiveIdentity(historicalTrades);

  // Step 3 — Similarity components
  const ruleSim  = computeRuleSimilarity(ruleIdentity);
  const histSim  = computeHistoricalSimilarity(setup, historicalTrades);
  const prefAlign = computePreferenceAlignment(setup, adaptive);

  // Step 4 — Composite identity similarity
  const similarity = computeIdentitySimilarity(ruleSim, histSim, prefAlign, adaptive);

  // Step 5 — Consistency verdict
  const consistency = evaluateConsistency(similarity, ruleSim, histSim, prefAlign);

  // Step 6 — Narrative
  const narrative = buildIdentityNarrative(
    setup, similarity, consistency, ruleSim, histSim, prefAlign, adaptive,
  );

  // Profile ID for linking (generate deterministically per run)
  const profileId = randomUUID();

  return {
    reportId:        randomUUID(),
    version:         TI_ENGINE_VERSION,
    profileId,
    setup,
    identityStage:   adaptive.stage,
    stageLabel:      stageLabel(adaptive.stage),
    similarity,
    consistency,
    ruleEvaluation:      ruleSim,
    historicalSimilarity:histSim,
    preferenceAlignment: prefAlign,
    identityNarrative:   narrative,
    isAdvisoryOnly:      true,
    evaluatedAt,
  };
}

// ─── Re-export drift detector ─────────────────────────────────────────────────

export function runDriftAnalysis(
  trades:    IdentityFeature[],
  profileId: string,
): DriftReport {
  return detectDrift(trades, profileId);
}
