// ─── Executive AI Core — Orchestrator ────────────────────────────────────────
// Phase 7 · Single entry point for the Executive Decision Engine.

import { randomUUID } from "crypto";
import {
  EAI_ENGINE_VERSION,
  EAI_DECISION_VERSION,
  DEFAULT_EAI_WEIGHTS,
  DECISION_LABELS,
  DECISION_DESCRIPTIONS,
  type ExecutiveDecision,
  type RunEaiInput,
  type EaiVersionInfo,
} from "./types.js";
import {
  buildStrategyIntelligence,
  buildMarketIntelligence,
  buildRiskIntelligence,
  buildMemoryIntelligence,
  buildLearningIntelligence,
  buildIdentityIntelligence,
  buildResearchIntelligence,
} from "./intelligence-aggregator.js";
import { buildWeights, WEIGHTS_VERSION } from "./weighting-engine.js";
import { computeConfidence }             from "./confidence-engine.js";
import { resolveAllConflicts }           from "./conflict-resolver.js";
import {
  computeDimensionScores,
  applyVetoes,
  scoreToDecision,
  buildScoreBreakdown,
  buildContributions,
} from "./decision-engine.js";
import { buildExplainability }           from "./explainer.js";

// Re-exports
export { EAI_ENGINE_VERSION, EAI_DECISION_VERSION }                from "./types.js";
export { DECISION_LABELS, DECISION_DESCRIPTIONS, DECISION_THRESHOLD, DEFAULT_EAI_WEIGHTS } from "./types.js";
export type {
  ExecutiveDecision,
  RunEaiInput,
  EaiDecisionType,
  EaiConfidence,
  EaiConflict,
  EaiContribution,
  EaiExplainability,
  EaiScoreBreakdown,
  EaiWeights,
  EaiVersionInfo,
  StrategyIntelligence,
  MarketIntelligence,
  RiskIntelligence,
  MemoryIntelligence,
  LearningIntelligence,
  IdentityIntelligence,
  ResearchIntelligence,
  EaiIntelligenceInput,
} from "./types.js";
export type { DimensionScores, DimensionScores as EaiDimensionScores } from "./decision-engine.js";
export { buildWeights, WEIGHTS_VERSION, describeWeights }          from "./weighting-engine.js";
export { computeConfidence as eaiComputeConfidence }               from "./confidence-engine.js";
export { resolveAllConflicts, resolveAllConflicts as eaiResolveAllConflicts } from "./conflict-resolver.js";
export {
  computeDimensionScores,
  scoreToDecision,
  applyVetoes,
  buildScoreBreakdown,
  buildContributions,
}                                                                  from "./decision-engine.js";
export {
  buildStrategyIntelligence,
  buildMarketIntelligence,
  buildRiskIntelligence,
  buildMemoryIntelligence,
  buildLearningIntelligence,
  buildIdentityIntelligence,
  buildResearchIntelligence,
}                                                                  from "./intelligence-aggregator.js";
export { buildExplainability as eaiBuildExplainability }           from "./explainer.js";

// ─── Main orchestrator ────────────────────────────────────────────────────────

export async function runExecutiveAI(input: RunEaiInput = {}): Promise<ExecutiveDecision> {
  const {
    pair       = "EURUSD",
    timeframe  = "15m",
    weights: weightOverrides,
  } = input;

  // 1 — Build intelligence objects from raw results
  const strategy = buildStrategyIntelligence(
    (input.strategyResult as Record<string, unknown>) ?? null
  );
  const market   = buildMarketIntelligence(
    (input.marketResult as Record<string, unknown>) ?? null
  );
  const risk     = buildRiskIntelligence(
    (input.erbResult ?? input.riResult as Record<string, unknown>) ?? null
  );
  const memory   = buildMemoryIntelligence(
    (input.memoryResult as Record<string, unknown>) ?? null
  );
  const learning = buildLearningIntelligence(
    (input.learningResult as Record<string, unknown>) ?? null
  );
  const identity = buildIdentityIntelligence(
    (input.identityResult as Record<string, unknown>) ?? null
  );
  const research = buildResearchIntelligence(
    (input.researchResult as Record<string, unknown>) ?? null
  );

  const intel = { pair, timeframe, strategy, market, risk, memory, learning, identity, research };

  // 2 — Build and normalise weights
  const weights = buildWeights(weightOverrides);

  // 3 — Compute dimension scores (all 0-100, higher = better)
  const dims = computeDimensionScores(strategy, market, risk, memory, learning, identity, research);

  // 4 — Compute raw composite (weighted sum)
  const rawComposite =
    dims.strategy * weights.strategy +
    dims.market   * weights.market   +
    dims.risk     * weights.risk     +
    dims.memory   * weights.memory   +
    dims.learning * weights.learning +
    dims.identity * weights.identity +
    dims.research * weights.research;

  // 5 — Detect conflicts
  const conflicts = resolveAllConflicts({
    strategyScore:    dims.strategy,
    marketScore:      dims.market,
    riskSafetyScore:  dims.risk,
    memoryScore:      dims.memory,
    learningScore:    dims.learning,
    identityScore:    dims.identity,
    risk,
    market,
    learningDrift:    learning.performanceDrift,
    memoryWinRate:    memory.historicalWinRate,
    learningConfidence: learning.overallConfidence,
  });

  // 6 — Apply vetoes
  const { vetoed, vetoReason, adjustedScore } = applyVetoes(rawComposite, risk, conflicts);
  const finalScore = Math.max(0, Math.min(100, Math.round(adjustedScore * 10) / 10));

  // 7 — Map to decision
  const decision = scoreToDecision(finalScore);

  // 8 — Compute confidence
  const confidence = computeConfidence(intel, finalScore);

  // 9 — Build score breakdown + contributions
  const breakdown     = buildScoreBreakdown(dims, weights, [], rawComposite, vetoed, vetoReason);
  const contributions = buildContributions(dims, weights, finalScore);

  // 10 — Build explainability
  const explainability = buildExplainability({
    decision,
    compositeScore: finalScore,
    contributions,
    conflicts,
    confidence,
    vetoApplied: vetoed,
    vetoReason,
  });

  // 11 — Version info
  const versionInfo: EaiVersionInfo = {
    engineVersion:   EAI_ENGINE_VERSION,
    decisionVersion: EAI_DECISION_VERSION,
    strategyVersion: "1.0.0",
    riskVersion:     "1.0.0",
    marketVersion:   "1.0.0",
    weightsVersion:  WEIGHTS_VERSION,
  };

  return {
    decisionId:          `eai_${Date.now()}_${randomUUID().slice(0, 8)}`,
    timestamp:            new Date().toISOString(),
    pair,
    timeframe,
    decision,
    decisionLabel:        DECISION_LABELS[decision],
    decisionDescription:  DECISION_DESCRIPTIONS[decision],
    executiveScore:       finalScore,
    executiveConfidence:  confidence,
    scoreBreakdown:       breakdown,
    contributingSystems:  contributions,
    conflicts,
    hasConflicts:         conflicts.length > 0,
    explainability,
    marketRegime:         market.regime,
    riskState:            risk.recommendation,
    crisisStatus:         risk.crisisStatus,
    versionInfo,
    isAdvisoryOnly:       true,
  };
}
