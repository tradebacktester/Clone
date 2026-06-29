// ─── Strategy Strength Calculator ────────────────────────────────────────────
// Combines all 5 component scores into the unified Strategy Strength Score
// (0–100) with transparent weighting and a final recommendation.
// Advisory only.

import { clamp } from "../learning-validation/data-validator.js";
import type {
  RuleEvaluationResult,
  HistoricalEvidenceResult,
  MarketSupportResult,
  PatternStrengthResult,
  ContextStrengthResult,
  StrategyStrengthResult,
  StrengthComponent,
  StrengthTier,
} from "./types.js";
import {
  STRENGTH_WEIGHTS,
  MIN_EVIDENCE_FOR_REASONING,
  strengthToRecommendation,
  REASONING_RECOMMENDATION_LABELS,
  scoreToTier,
} from "./types.js";

// ─── Confidence calculation ───────────────────────────────────────────────────
// Confidence reflects how reliable the evidence base is; it does NOT modify
// the score, but informs the recommendation label.

function computeConfidence(
  evidence: HistoricalEvidenceResult,
  ruleResult: RuleEvaluationResult,
  strengthScore: number,
): number {
  // Base confidence from score
  let conf = clamp(strengthScore, 0, 100);

  // Penalise insufficient evidence
  if (evidence.evidenceCount < MIN_EVIDENCE_FOR_REASONING) {
    conf = clamp(conf * 0.65, 0, 100);
  } else if (evidence.evidenceCount < 10) {
    conf = clamp(conf * 0.80, 0, 100);
  }

  // Penalise failed rules
  if (ruleResult.failedRules > 0) {
    conf = clamp(conf - ruleResult.failedRules * 5, 0, 100);
  }

  // Bonus for high evidence + good win rate
  if (evidence.evidenceCount >= 20 && evidence.winRate >= 0.60) {
    conf = clamp(conf + 5, 0, 100);
  }

  return conf;
}

// ─── Composite strength calculation ──────────────────────────────────────────

export function calculateStrategyStrength(
  ruleResult:     RuleEvaluationResult,
  evidence:       HistoricalEvidenceResult,
  marketSupport:  MarketSupportResult,
  patternStrength: PatternStrengthResult,
  contextStrength: ContextStrengthResult,
): StrategyStrengthResult {
  const components: StrengthComponent[] = [
    {
      name:         "Rule Quality",
      score:        ruleResult.ruleQualityScore,
      weight:       STRENGTH_WEIGHTS.ruleQuality,
      contribution: ruleResult.ruleQualityScore * STRENGTH_WEIGHTS.ruleQuality,
      tier:         scoreToTier(ruleResult.ruleQualityScore),
    },
    {
      name:         "Historical Evidence",
      score:        evidence.evidenceScore,
      weight:       STRENGTH_WEIGHTS.historicalEvidence,
      contribution: evidence.evidenceScore * STRENGTH_WEIGHTS.historicalEvidence,
      tier:         scoreToTier(evidence.evidenceScore),
    },
    {
      name:         "Market Support",
      score:        marketSupport.marketSupportScore,
      weight:       STRENGTH_WEIGHTS.marketSupport,
      contribution: marketSupport.marketSupportScore * STRENGTH_WEIGHTS.marketSupport,
      tier:         scoreToTier(marketSupport.marketSupportScore),
    },
    {
      name:         "Pattern Strength",
      score:        patternStrength.patternStrengthScore,
      weight:       STRENGTH_WEIGHTS.patternStrength,
      contribution: patternStrength.patternStrengthScore * STRENGTH_WEIGHTS.patternStrength,
      tier:         scoreToTier(patternStrength.patternStrengthScore),
    },
    {
      name:         "Context Strength",
      score:        contextStrength.contextStrengthScore,
      weight:       STRENGTH_WEIGHTS.contextStrength,
      contribution: contextStrength.contextStrengthScore * STRENGTH_WEIGHTS.contextStrength,
      tier:         scoreToTier(contextStrength.contextStrengthScore),
    },
  ];

  const strategyStrengthScore = clamp(
    components.reduce((sum, c) => sum + c.contribution, 0),
    0, 100,
  );

  const confidenceScore = computeConfidence(evidence, ruleResult, strategyStrengthScore);
  const recommendation  = strengthToRecommendation(strategyStrengthScore);
  const recommendationLabel = REASONING_RECOMMENDATION_LABELS[recommendation];
  const strengthTier: StrengthTier = scoreToTier(strategyStrengthScore);

  const lines: string[] = [
    `Strategy Strength Score: ${strategyStrengthScore.toFixed(1)}/100 (${strengthTier})`,
    `Confidence: ${confidenceScore.toFixed(1)}/100`,
    `Recommendation: ${recommendationLabel}`,
    `Components: ${components.map(c => `${c.name} ${c.score.toFixed(1)} (w=${c.weight})`).join(" | ")}`,
  ];

  return {
    components,
    strategyStrengthScore,
    confidenceScore,
    recommendation,
    recommendationLabel,
    strengthTier,
    explanation: lines.join("\n"),
  };
}
