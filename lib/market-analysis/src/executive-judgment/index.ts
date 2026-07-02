// ─── Executive Judgment & Decision Simulation Engine — Orchestrator ───────────
// Phase 7.3

import { randomUUID } from "crypto";
import {
  EJ_ENGINE_VERSION,
  type ExecutiveJudgment,
  type RunJudgmentInput,
} from "./types.js";
import { simulateAllDecisions } from "./decision-simulator.js";
import { analyzeOpportunityCost } from "./opportunity-cost.js";
import { rankDecisions } from "./ranking-engine.js";
import { buildJudgmentExplainability } from "./judgment-engine.js";
import { buildCounterfactualAnalysis } from "./counterfactual-engine.js";

// Re-exports
export { EJ_ENGINE_VERSION }                    from "./types.js";
export type {
  ExecutiveJudgment,
  RunJudgmentInput,
  DecisionSimulation,
  DecisionType,
  DecisionRanking,
  OpportunityCostAnalysis,
  OpportunityCostScenario,
  CounterfactualAnalysis,
  CounterfactualResult,
  JudgmentExplainability,
}                                               from "./types.js";
export { DECISION_TYPE_LABELS, DECISION_TYPE_DESCRIPTIONS } from "./types.js";
export { simulateAllDecisions, ALL_DECISION_TYPES } from "./decision-simulator.js";
export { analyzeOpportunityCost }               from "./opportunity-cost.js";
export { rankDecisions }                        from "./ranking-engine.js";
export { buildJudgmentExplainability }          from "./judgment-engine.js";
export { buildCounterfactualAnalysis }          from "./counterfactual-engine.js";

function n(v: unknown, fallback = 50): number {
  const num = Number(v);
  return isFinite(num) ? num : fallback;
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

export async function runExecutiveJudgment(
  input: RunJudgmentInput = {}
): Promise<ExecutiveJudgment> {
  const startedAt = Date.now();
  const {
    pair      = "EURUSD",
    timeframe = "15m",
    strategyResult = null,
    erbResult      = null,
    tradeId        = null,
  } = input;

  const judgmentId = `ej_${randomUUID().slice(0, 12)}`;

  // ── Extract intelligence scores from latest sub-system results ────────────
  const stratR = (strategyResult ?? {}) as Record<string, unknown>;
  const erbR   = (erbResult      ?? {}) as Record<string, unknown>;

  const executiveScore = n(stratR.executiveScore,      55);
  const strategyScore  = n(stratR.strategyStrength,    50);
  const riskScore      = n(erbR.overallRiskScore,      35);
  const marketScore    = n((erbR.market as any)?.healthScore, 55);
  const memoryWinRate  = n((stratR.memoryData as any)?.historicalWinRate, 52);
  const identityScore  = n((stratR.identityData as any)?.identitySimilarityScore, 60);
  const crisisStatus   = String(erbR.crisisStatus ?? "none");
  const survivalMode   = Boolean(erbR.survivalModeActive);

  const intelligenceSnapshot = {
    executiveScore,
    strategyScore,
    riskScore,
    marketScore,
    memoryWinRate,
    identityScore,
    crisisStatus,
    survivalMode,
  };

  // ── Stage 1: Simulate all 7 candidate decisions ───────────────────────────
  const simulations = simulateAllDecisions({
    executiveScore,
    strategyScore,
    riskScore,
    marketScore,
    memoryWinRate,
    identityScore,
    crisisStatus,
    survivalMode,
  });

  // ── Stage 2: Opportunity cost analysis ────────────────────────────────────
  const opportunityCost = analyzeOpportunityCost(simulations, executiveScore);

  // ── Stage 3: Rank all candidates ──────────────────────────────────────────
  const rankings = rankDecisions(simulations);

  // ── Stage 4: Extract top 3 ────────────────────────────────────────────────
  const [best, second, third] = rankings;
  if (!best || !second || !third) {
    throw new Error("Ranking engine returned fewer than 3 candidates");
  }

  // Emergency pause override: if crisis or survival mode, force emergency_pause
  let finalDecision = best.decisionType;
  if ((crisisStatus === "emergency" || survivalMode) && finalDecision === "execute_trade") {
    finalDecision = "emergency_pause";
  }

  const finalRanking  = rankings.find(r => r.decisionType === finalDecision) ?? best;
  const finalScore    = finalRanking.overallScore;
  const finalConf     = finalRanking.confidence;

  // ── Stage 4b: Explainability ──────────────────────────────────────────────
  const explainability = buildJudgmentExplainability({
    bestRanking:    best,
    allRankings:    rankings,
    simulations,
    opportunityCost,
    executiveScore,
    riskScore,
  });

  const durationMs = Date.now() - startedAt;

  return {
    judgmentId,
    evaluatedAt:     new Date().toISOString(),
    pair,
    timeframe,
    intelligenceSnapshot,
    simulations,
    opportunityCost,
    rankings,
    bestDecision:    best,
    secondBestDecision: second,
    thirdBestDecision:  third,
    finalDecision,
    finalDecisionLabel: (await import("./types.js")).DECISION_TYPE_LABELS[finalDecision],
    finalScore,
    finalConfidence: finalConf,
    explainability,
    counterfactual:  null,  // populated post-trade via buildCounterfactualAnalysis
    isAdvisoryOnly:  true,
    engineVersion:   EJ_ENGINE_VERSION,
    durationMs,
  };
}
