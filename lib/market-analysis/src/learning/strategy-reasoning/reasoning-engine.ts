// ─── Strategy Reasoning Engine — Main Orchestrator ────────────────────────────
// Runs the full 10-step reasoning pipeline for a given strategy setup:
//   1. Rule Validation
//   2. Historical Pattern Lookup
//   3. Market Intelligence Review
//   4. Feature Importance Analysis
//   5. Historical Similarity Search
//   6. Context Evaluation
//   7. Strength Assessment
//   8. Confidence Calculation
//   9. Reasoning Report
//  10. Recommendation
//
// Advisory only — NEVER modifies the live strategy or executes trades.

import { randomUUID } from "crypto";
import type { ExtractedFeature } from "../learning-core/types.js";
import { evaluateRules } from "./rule-evaluator.js";
import { findSimilarHistoricalTrades } from "./historical-reasoner.js";
import { analyzeMarketSupport } from "./market-support-analyzer.js";
import { analyzePatternStrength } from "./pattern-strength-analyzer.js";
import { analyzeContextStrength } from "./context-strength-analyzer.js";
import { calculateStrategyStrength } from "./strength-calculator.js";
import {
  extractSupportingFactors,
  computeStatisticalExpectancy,
  assessRisks,
  buildReasoningNarrative,
} from "./report-generator.js";
import type { StrategySetup, StrategyReasoningReport } from "./types.js";
import { SR_ENGINE_VERSION, REASONING_RECOMMENDATION_LABELS } from "./types.js";

// ─── Main reasoning pipeline ──────────────────────────────────────────────────

export function runStrategyReasoning(
  setup: StrategySetup,
  historicalFeatures: ExtractedFeature[],
): StrategyReasoningReport {
  const reportId   = randomUUID();
  const evaluatedAt = setup.evaluatedAt ?? new Date();

  // Step 1: Rule Validation
  const ruleEvaluation = evaluateRules(setup);

  // Step 2 & 5: Historical Pattern Lookup + Similarity Search
  const historicalEvidence = findSimilarHistoricalTrades(setup, historicalFeatures);

  // Step 3: Market Intelligence Review
  const marketSupport = analyzeMarketSupport(setup);

  // Step 4: Feature Importance / Pattern Strength
  const patternStrength = analyzePatternStrength(setup);

  // Step 6: Context Evaluation
  const contextStrength = analyzeContextStrength(setup, historicalFeatures);

  // Step 7 & 8: Strength Assessment + Confidence Calculation
  const strategyStrength = calculateStrategyStrength(
    ruleEvaluation,
    historicalEvidence,
    marketSupport,
    patternStrength,
    contextStrength,
  );

  // Insights
  const { strongest: strongestFactors, weakest: weakestFactors } = extractSupportingFactors(
    ruleEvaluation,
    historicalEvidence,
    marketSupport,
    patternStrength,
    contextStrength,
    strategyStrength,
  );

  // Statistical expectancy
  const statisticalExpectancy = computeStatisticalExpectancy(
    historicalEvidence.winRate,
    historicalEvidence.averageRR,
    historicalEvidence.evidenceCount,
  );

  // Risk assessment
  const { riskAssessment, potentialRisks } = assessRisks(
    setup,
    ruleEvaluation,
    historicalEvidence,
    marketSupport,
  );

  // Step 9: Reasoning Report
  const reasoning = buildReasoningNarrative(
    setup,
    ruleEvaluation,
    historicalEvidence,
    marketSupport,
    patternStrength,
    contextStrength,
    strategyStrength,
    statisticalExpectancy,
  );

  // Step 10: Final Recommendation
  const recommendation      = strategyStrength.recommendation;
  const recommendationLabel = REASONING_RECOMMENDATION_LABELS[recommendation];
  const recommendationRationale = buildRecommendationRationale(
    recommendation,
    strategyStrength.strategyStrengthScore,
    strategyStrength.confidenceScore,
    historicalEvidence,
    ruleEvaluation,
  );

  return {
    reportId,
    version:      SR_ENGINE_VERSION,
    setup,
    evaluatedAt,
    ruleEvaluation,
    historicalEvidence,
    marketSupport,
    patternStrength,
    contextStrength,
    strategyStrength,
    strongestFactors,
    weakestFactors,
    statisticalExpectancy,
    riskAssessment,
    potentialRisks,
    reasoning,
    recommendation,
    recommendationLabel,
    recommendationRationale,
    isAdvisoryOnly: true,
  };
}

// ─── Recommendation rationale ─────────────────────────────────────────────────

function buildRecommendationRationale(
  recommendation: string,
  score: number,
  confidence: number,
  evidence: ReturnType<typeof findSimilarHistoricalTrades>,
  rules: ReturnType<typeof evaluateRules>,
): string {
  const parts: string[] = [];

  parts.push(`Score ${score.toFixed(1)}/100 with ${confidence.toFixed(1)}% confidence.`);

  if (evidence.evidenceCount >= 5) {
    parts.push(
      `Based on ${evidence.evidenceCount} similar historical trades with ${(evidence.winRate * 100).toFixed(1)}% win rate and ${evidence.profitFactor.toFixed(2)} profit factor.`,
    );
  } else {
    parts.push(`Limited historical evidence (${evidence.evidenceCount} trades) — treat with caution.`);
  }

  if (rules.failedRules > 0) {
    parts.push(`${rules.failedRules} rule(s) not met — reduces overall quality.`);
  } else if (rules.exceptionalRules >= 3) {
    parts.push(`${rules.exceptionalRules} rules achieved exceptional quality — high structural confidence.`);
  }

  switch (recommendation) {
    case "exceptional":
      parts.push("All indicators align strongly — this represents a rare high-probability configuration.");
      break;
    case "very_strong":
      parts.push("Strong multi-factor alignment with solid historical backing.");
      break;
    case "strong":
      parts.push("Good quality setup with sufficient supporting evidence.");
      break;
    case "average":
      parts.push("Mixed signals — some factors support while others limit confidence.");
      break;
    case "weak":
      parts.push("Multiple factors below target quality — marginal opportunity.");
      break;
    case "avoid":
      parts.push("Setup does not meet minimum quality standards — avoid entry.");
      break;
  }

  parts.push("This is an advisory recommendation only. All execution decisions remain with the deterministic strategy.");
  return parts.join(" ");
}
