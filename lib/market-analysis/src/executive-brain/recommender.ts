// ─── Executive Strategy Brain — Recommender ───────────────────────────────────
// Converts the Executive Score into a labelled recommendation with full
// measurable evidence. No unexplained score is allowed.

import type {
  EsbRecommendation,
  EsbScoreBreakdown,
  RuleEngineSummary,
  StrategyReasoningSummary,
  StrategyQualitySummary,
  TraderIdentitySummary,
  HistoricalIntelligence,
  MarketIntelligenceSummary,
  ResearchIntelligenceSummary,
} from "./types.js";

import {
  RECOMMENDATION_THRESHOLDS,
  RECOMMENDATION_LABELS,
} from "./types.js";

// ─── Recommendation from score ────────────────────────────────────────────────

export function scoreToRecommendation(score: number): EsbRecommendation {
  if (score >= RECOMMENDATION_THRESHOLDS.elite)       return "elite";
  if (score >= RECOMMENDATION_THRESHOLDS.very_strong) return "very_strong";
  if (score >= RECOMMENDATION_THRESHOLDS.strong)      return "strong";
  if (score >= RECOMMENDATION_THRESHOLDS.acceptable)  return "acceptable";
  if (score >= RECOMMENDATION_THRESHOLDS.borderline)  return "borderline";
  if (score >= RECOMMENDATION_THRESHOLDS.weak)        return "weak";
  return "reject";
}

export function recommendationLabel(rec: EsbRecommendation): string {
  return RECOMMENDATION_LABELS[rec];
}

// ─── Rationale builder ────────────────────────────────────────────────────────

export function buildRationale(
  score: number,
  rec:   EsbRecommendation,
  breakdown: EsbScoreBreakdown,
  rule:      RuleEngineSummary,
  reasoning: StrategyReasoningSummary,
  quality:   StrategyQualitySummary,
  ti:        TraderIdentitySummary,
  hist:      HistoricalIntelligence,
  mkt:       MarketIntelligenceSummary,
  research:  ResearchIntelligenceSummary,
): string {
  const label = RECOMMENDATION_LABELS[rec];
  const lines: string[] = [
    `Executive Score: ${score.toFixed(1)}/100 → ${label}.`,
    "",
    "Score breakdown:",
    `  Rule Quality         ${breakdown.ruleQuality.raw.toFixed(1)} × ${(breakdown.ruleQuality.weight * 100).toFixed(0)}% = ${breakdown.ruleQuality.weighted.toFixed(1)}`,
    `  Strategy Strength    ${breakdown.strategyStrength.raw.toFixed(1)} × ${(breakdown.strategyStrength.weight * 100).toFixed(0)}% = ${breakdown.strategyStrength.weighted.toFixed(1)}`,
    `  Historical Evidence  ${breakdown.historicalEvidence.raw.toFixed(1)} × ${(breakdown.historicalEvidence.weight * 100).toFixed(0)}% = ${breakdown.historicalEvidence.weighted.toFixed(1)}`,
    `  Market Intelligence  ${breakdown.marketIntelligence.raw.toFixed(1)} × ${(breakdown.marketIntelligence.weight * 100).toFixed(0)}% = ${breakdown.marketIntelligence.weighted.toFixed(1)}`,
    `  Trader Identity      ${breakdown.traderIdentity.raw.toFixed(1)} × ${(breakdown.traderIdentity.weight * 100).toFixed(0)}% = ${breakdown.traderIdentity.weighted.toFixed(1)}`,
    `  Confidence           ${breakdown.confidence.raw.toFixed(1)} × ${(breakdown.confidence.weight * 100).toFixed(0)}% = ${breakdown.confidence.weighted.toFixed(1)}`,
    `  Data Quality         ${breakdown.dataQuality.raw.toFixed(1)} × ${(breakdown.dataQuality.weight * 100).toFixed(0)}% = ${breakdown.dataQuality.weighted.toFixed(1)}`,
    "",
    "Supporting evidence:",
    `  Rules: ${rule.passingRules}/${rule.totalRules} passing (${rule.rulePassRate.toFixed(1)}%), integrity ${rule.ruleIntegrity.toFixed(1)}/100.`,
    `  Strategy strength: ${reasoning.strategyStrength.toFixed(1)}/100 (tier: ${reasoning.strengthTier}), confidence ${reasoning.confidence.toFixed(1)}%.`,
    `  Quality score: ${quality.overallQualityScore.toFixed(1)}/100 (${quality.classification}).`,
    `  Structural: ${quality.structuralQuality.toFixed(1)}, Liquidity: ${quality.liquidityQuality.toFixed(1)}, AMD: ${quality.amdQuality.toFixed(1)}, Confirmation: ${quality.confirmationQuality.toFixed(1)}.`,
    `  Historical: ${hist.sampleSize} similar trades — win rate ${(hist.historicalWinRate * 100).toFixed(1)}%, PF ${hist.profitFactor.toFixed(2)}, avg RR ${hist.averageRR.toFixed(2)}, expectancy ${hist.historicalExpectancy.toFixed(3)}.`,
    `  Market: health ${mkt.marketHealth.toFixed(1)}/100, opportunity ${mkt.opportunityScore.toFixed(1)}/100, regime "${mkt.marketRegime}", stability ${mkt.stability.toFixed(1)}/100.`,
    `  Trader identity: similarity ${ti.identitySimilarity.toFixed(1)}%, alignment ${ti.preferenceAlignment.toFixed(1)}%, drift: ${ti.driftStatus}.`,
  ];

  if (research.activeHypotheses > 0) {
    lines.push(`  Research: ${research.activeHypotheses} active hypotheses, ${research.pendingDeploymentRequests} pending deployments.`);
  }

  lines.push("");
  lines.push(rationaleSummary(rec, breakdown, rule, hist, mkt, ti));
  return lines.join("\n");
}

function rationaleSummary(
  rec:       EsbRecommendation,
  breakdown: EsbScoreBreakdown,
  rule:      RuleEngineSummary,
  hist:      HistoricalIntelligence,
  mkt:       MarketIntelligenceSummary,
  ti:        TraderIdentitySummary,
): string {
  const weakDims = identifyWeakestDimensions(breakdown);
  const strongDims = identifyStrongestDimensions(breakdown);

  switch (rec) {
    case "elite":
      return `All dimensions exceed institutional thresholds. Strongest: ${strongDims.join(", ")}. Proceed with standard position sizing.`;
    case "very_strong":
      return `Strong across all dimensions. Minor gaps in: ${weakDims.join(", ")}. High confidence entry.`;
    case "strong":
      return `Solid setup with good evidence. Watch: ${weakDims.join(", ")}. Standard entry acceptable.`;
    case "acceptable":
      return `Acceptable setup — below elite thresholds but statistically valid. Weaker dimensions: ${weakDims.join(", ")}. Consider reduced position size.`;
    case "borderline":
      return `Borderline setup. Key weaknesses: ${weakDims.join(", ")}. Recommend waiting for better alignment or reducing size materially.`;
    case "weak":
      return `Weak setup — ${weakDims.join(", ")} are below minimum thresholds. Only execute with strict risk controls and smallest position.`;
    case "reject":
      return `Setup rejected. Critical failures in: ${weakDims.join(", ")}. Historical win rate ${(hist.historicalWinRate * 100).toFixed(1)}%, market health ${mkt.marketHealth.toFixed(1)}/100. Do not execute.`;
  }
}

function identifyWeakestDimensions(breakdown: EsbScoreBreakdown): string[] {
  const dims = [
    { name: "Rule Quality",        score: breakdown.ruleQuality.raw },
    { name: "Strategy Strength",   score: breakdown.strategyStrength.raw },
    { name: "Historical Evidence", score: breakdown.historicalEvidence.raw },
    { name: "Market Intelligence", score: breakdown.marketIntelligence.raw },
    { name: "Trader Identity",     score: breakdown.traderIdentity.raw },
    { name: "Confidence",          score: breakdown.confidence.raw },
    { name: "Data Quality",        score: breakdown.dataQuality.raw },
  ];
  return dims.sort((a, b) => a.score - b.score).slice(0, 3).map(d => d.name);
}

function identifyStrongestDimensions(breakdown: EsbScoreBreakdown): string[] {
  const dims = [
    { name: "Rule Quality",        score: breakdown.ruleQuality.raw },
    { name: "Strategy Strength",   score: breakdown.strategyStrength.raw },
    { name: "Historical Evidence", score: breakdown.historicalEvidence.raw },
    { name: "Market Intelligence", score: breakdown.marketIntelligence.raw },
    { name: "Trader Identity",     score: breakdown.traderIdentity.raw },
    { name: "Confidence",          score: breakdown.confidence.raw },
    { name: "Data Quality",        score: breakdown.dataQuality.raw },
  ];
  return dims.sort((a, b) => b.score - a.score).slice(0, 3).map(d => d.name);
}
