// ─── Trader Identity — Consistency Evaluator ─────────────────────────────────
// Maps similarity scores to a consistency verdict with measurable evidence.

import {
  clamp,
  consistencyFromScore,
  CONSISTENCY_LABELS,
} from "./types.js";
import type {
  IdentitySimilarityScore,
  RuleSimilarityResult,
  HistoricalSimilarityResult,
  PreferenceAlignmentResult,
  ConsistencyResult,
} from "./types.js";

export function evaluateConsistency(
  similarity:  IdentitySimilarityScore,
  rule:        RuleSimilarityResult,
  historical:  HistoricalSimilarityResult,
  preference:  PreferenceAlignmentResult,
): ConsistencyResult {
  const score = clamp(similarity.identitySimilarityScore);
  const level = consistencyFromScore(score);
  const label = CONSISTENCY_LABELS[level];

  const evidence: string[] = [];

  // Rule evidence
  const ruleScore = rule.score;
  if (ruleScore >= 85) {
    evidence.push(`Rule adherence ${ruleScore.toFixed(0)}/100 — all core strategy rules satisfied.`);
  } else if (ruleScore >= 70) {
    evidence.push(`Rule adherence ${ruleScore.toFixed(0)}/100 — most strategy rules met.`);
  } else if (ruleScore >= 55) {
    evidence.push(`Rule adherence ${ruleScore.toFixed(0)}/100 — partial compliance with core rules.`);
  } else {
    evidence.push(`Rule adherence ${ruleScore.toFixed(0)}/100 — significant rule violations.`);
  }

  // Historical evidence
  if (historical.sampleSize >= 10) {
    const histScore = historical.score;
    evidence.push(
      `Historical similarity ${histScore.toFixed(0)}/100 from ${historical.sampleSize} comparable trades.`,
    );
  } else if (historical.sampleSize > 0) {
    evidence.push(`Historical sample limited (${historical.sampleSize} trades) — similarity estimate is early-stage.`);
  } else {
    evidence.push("No historical data yet — consistency is purely rule-based.");
  }

  // Preference evidence
  if (preference.aligned.length > 0 || preference.misaligned.length > 0) {
    const prefScore = preference.score;
    if (prefScore >= 75) {
      evidence.push(`Preference alignment ${prefScore.toFixed(0)}/100 — setup closely matches identity preferences.`);
    } else if (prefScore >= 55) {
      evidence.push(`Preference alignment ${prefScore.toFixed(0)}/100 — mixed preference fit.`);
    } else {
      evidence.push(`Preference alignment ${prefScore.toFixed(0)}/100 — setup diverges from discovered preferences.`);
    }
  }

  // Specific failing rules
  const failedRules = rule.details.filter(c => !c.passed).map(c => c.name);
  if (failedRules.length > 0 && failedRules.length <= 3) {
    evidence.push(`Failed rules: ${failedRules.join(", ")}.`);
  }

  // Consistency reason
  const reason = buildReason(level, score, rule.score, historical.score, preference.score);

  return { level, label, reason, evidence };
}

function buildReason(
  level:      string,
  score:      number,
  ruleScore:  number,
  histScore:  number,
  prefScore:  number,
): string {
  switch (level) {
    case "fully_consistent":
      return `Identity similarity ${score.toFixed(0)}/100. All major dimensions align with the trader identity — rules, historical patterns, and preferences are in harmony.`;
    case "mostly_consistent":
      return `Identity similarity ${score.toFixed(0)}/100. Strong identity alignment with minor deviations. Rule score ${ruleScore.toFixed(0)}, historical ${histScore.toFixed(0)}, preference ${prefScore.toFixed(0)}.`;
    case "partially_consistent":
      return `Identity similarity ${score.toFixed(0)}/100. Mixed identity alignment. Some core elements present but notable gaps reduce consistency. Weakest dimension: ${weakestDim(ruleScore, histScore, prefScore)}.`;
    case "weakly_consistent":
      return `Identity similarity ${score.toFixed(0)}/100. Weak identity alignment. The setup shares some characteristics with the identity but diverges significantly on key dimensions.`;
    default:
      return `Identity similarity ${score.toFixed(0)}/100. The setup is not consistent with the established trader identity. Multiple core dimensions diverge from expected patterns.`;
  }
}

function weakestDim(r: number, h: number, p: number): string {
  const min = Math.min(r, h, p);
  if (min === r) return "rule adherence";
  if (min === h) return "historical similarity";
  return "preference alignment";
}
