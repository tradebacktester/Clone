// ─── Recommendation Engine ────────────────────────────────────────────────────
// Orchestrates the full decision pipeline for a single setup.
// Produces a Trade Intelligence Report with a fully explainable recommendation.
// Advisory only — no trade execution, no strategy modification.

import { randomUUID } from "crypto";
import { clamp } from "../learning-validation/data-validator.js";
import type { ExtractedFeature } from "../learning-core/types.js";
import { findSimilarExperiences } from "./historical-matcher.js";
import { computeTis } from "./setup-scorer.js";
import { extractFactors } from "./factor-analyzer.js";
import { computeRecommendationConfidence } from "./confidence-calculator.js";
import type {
  CurrentSetup,
  TradeIntelligenceReport,
} from "./types.js";
import {
  DI_ENGINE_VERSION,
  tisToLevel,
  RECOMMENDATION_LEVELS,
  computeUncertaintyLevel,
  computeReliabilityRating,
  MIN_EVIDENCE_FOR_RECOMMENDATION,
} from "./types.js";

// ─── Reasoning builder ────────────────────────────────────────────────────────

function buildReasoning(
  setup: CurrentSetup,
  tisScore: number,
  level: string,
  label: string,
  confidence: number,
  evidence: number,
  winRate: number,
  positiveFactors: Array<{ name: string; impact: number }>,
  negativeFactors: Array<{ name: string; impact: number }>,
): string {
  const lines: string[] = [];

  lines.push(`KRYTOS Decision Intelligence — ${label}`);
  lines.push(`Setup: ${setup.pair} | ${setup.session} session | ${setup.regime} regime | ${setup.volatility} volatility`);
  lines.push(`Trade Intelligence Score: ${tisScore.toFixed(1)}/100`);
  lines.push(`Confidence: ${confidence.toFixed(1)}% | Evidence: ${evidence} similar setups`);

  if (evidence >= MIN_EVIDENCE_FOR_RECOMMENDATION) {
    lines.push(`Historical win rate across similar setups: ${(winRate * 100).toFixed(1)}%`);
  } else {
    lines.push(`⚠ Insufficient evidence (${evidence} similar setups) — treat as indicative only.`);
  }

  if (positiveFactors.length > 0) {
    lines.push(`Strengths: ${positiveFactors.map(f => f.name).join(", ")}`);
  }
  if (negativeFactors.length > 0) {
    lines.push(`Concerns: ${negativeFactors.map(f => f.name).join(", ")}`);
  }

  lines.push(`This is an advisory recommendation only. KRYTOS does not execute trades automatically.`);
  return lines.join("\n");
}

// ─── Main recommendation pipeline ────────────────────────────────────────────

export function evaluateSetup(
  setup: CurrentSetup,
  historicalFeatures: ExtractedFeature[],
): TradeIntelligenceReport {
  const recommendationId = randomUUID();
  const evaluatedAt      = setup.evaluatedAt ?? new Date();

  // Step 1: Historical pattern lookup & similarity matching
  const match = findSimilarExperiences(setup, historicalFeatures);

  // Step 2: Compute Trade Intelligence Score
  const tisResult = computeTis(setup, historicalFeatures, match);

  // Step 3: Extract factors
  const { positive: positiveFactors, negative: negativeFactors } = extractFactors(
    setup,
    historicalFeatures,
    match,
    tisResult.components,
  );

  // Step 4: Compute confidence
  const confidenceResult = computeRecommendationConfidence(
    setup,
    tisResult,
    match,
    positiveFactors,
    negativeFactors,
  );

  // Step 5: Determine recommendation level
  const recommendationLevel = tisToLevel(tisResult.tisScore);
  const levelMeta           = RECOMMENDATION_LEVELS[recommendationLevel];
  const recommendationLabel = levelMeta.label;

  // Step 6: Uncertainty and reliability
  const uncertaintyLevel  = computeUncertaintyLevel(
    confidenceResult.confidenceScore,
    match.evidenceCount,
    confidenceResult.hasConflictingEvidence,
  );
  const reliabilityRating = computeReliabilityRating(
    confidenceResult.confidenceScore,
    match.evidenceCount,
  );

  // Step 7: Build reasoning
  const reasoning = buildReasoning(
    setup,
    tisResult.tisScore,
    recommendationLevel,
    recommendationLabel,
    confidenceResult.confidenceScore,
    match.evidenceCount,
    match.historicalWinRate,
    positiveFactors,
    negativeFactors,
  );

  // Step 8: Assemble full report
  const report: TradeIntelligenceReport = {
    recommendationId,
    version: DI_ENGINE_VERSION,
    evaluatedAt,

    setup,

    tisScore:             tisResult.tisScore,
    tisComponents:        tisResult.components,
    recommendationLevel,
    recommendationLabel,
    confidenceScore:      confidenceResult.confidenceScore,
    uncertaintyLevel,
    reliabilityRating,
    isLowConfidence:      confidenceResult.isLowConfidence,
    hasConflictingEvidence: confidenceResult.hasConflictingEvidence,
    reasoning,

    historicalEvidenceCount: match.evidenceCount,
    similarWinCount:         match.similarWins.length,
    similarLossCount:        match.similarLosses.length,
    historicalWinRate:       match.historicalWinRate,
    statisticalExpectancy:   match.statisticalExpectancy,

    positiveFactors,
    negativeFactors,

    similarWinningExperiences: match.similarWins,
    similarLosingExperiences:  match.similarLosses,

    validationFlags: confidenceResult.validationFlags,
    isAdvisoryOnly:  true,
  };

  return report;
}

// ─── Statistical expectancy helper ───────────────────────────────────────────

export function describeExpectancy(expectancy: number, winRate: number): string {
  if (winRate === 0) return "No data — expectancy cannot be calculated";
  const positive = expectancy > 0;
  const strength = Math.abs(expectancy) > 100 ? "strong"
    : Math.abs(expectancy) > 30 ? "moderate" : "marginal";
  return `${positive ? "Positive" : "Negative"} ${strength} expectancy: ${expectancy >= 0 ? "+" : ""}${expectancy.toFixed(2)} avg per similar trade`;
}
