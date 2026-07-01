// ─── Executive Risk Brain — Recommender ───────────────────────────────────────
// Converts the Overall Risk Score into a 7-level recommendation with full
// evidence, supporting metrics, historical comparison, and expected benefit/risk.
// Advisory only. NEVER modifies strategy or enforces any trade action directly.

import type {
  ErbRecommendation,
  ErbRecommendationDetail,
  ErbHistoricalComparison,
  ErbScoreBreakdown,
  ErbAccountIntelligence,
  ErbCrisisIntelligence,
  ErbAdaptiveIntelligence,
} from "./types.js";
import {
  ERB_RECOMMENDATION_THRESHOLDS,
  ERB_RECOMMENDATION_LABELS,
  ERB_RECOMMENDATION_DESCRIPTIONS,
} from "./types.js";

// ─── Score → Recommendation ───────────────────────────────────────────────────

export function scoreToRecommendation(overallRiskScore: number): ErbRecommendation {
  if (overallRiskScore >= ERB_RECOMMENDATION_THRESHOLDS.emergency_stop)  return "emergency_stop";
  if (overallRiskScore >= ERB_RECOMMENDATION_THRESHOLDS.survival_mode)   return "survival_mode";
  if (overallRiskScore >= ERB_RECOMMENDATION_THRESHOLDS.defensive_mode)  return "defensive_mode";
  if (overallRiskScore >= ERB_RECOMMENDATION_THRESHOLDS.observation_mode) return "observation_mode";
  if (overallRiskScore >= ERB_RECOMMENDATION_THRESHOLDS.restrict_exposure) return "restrict_exposure";
  if (overallRiskScore >= ERB_RECOMMENDATION_THRESHOLDS.reduced_risk)    return "reduced_risk";
  return "trade_normally";
}

// ─── Evidence builder ──────────────────────────────────────────────────────────

function buildEvidence(
  overallRiskScore: number,
  rec:              ErbRecommendation,
  breakdown:        ErbScoreBreakdown,
  account:          ErbAccountIntelligence,
  crisis:           ErbCrisisIntelligence,
  adaptive:         ErbAdaptiveIntelligence,
  allScores:        Record<string, number>,
): string[] {
  const evidence: string[] = [
    `Overall Risk Score: ${overallRiskScore.toFixed(1)}/100 → "${ERB_RECOMMENDATION_LABELS[rec]}"`,
    `Capital Health: ${allScores.capitalHealthScore?.toFixed(1) ?? "N/A"}/100 | Survival Score: ${allScores.survivalScore?.toFixed(1) ?? "N/A"}/100`,
    `Account Health: ${account.accountHealthScore.toFixed(1)}/100 | Drawdown: ${account.drawdownPct.toFixed(2)}%`,
    `Crisis Status: ${crisis.crisisStatus} | Severity: ${crisis.crisisSeverity} | Survival Mode: ${crisis.survivalModeActive ? "ACTIVE" : "inactive"}`,
    `Adaptive Profile: ${adaptive.currentRiskProfile} → recommended: ${adaptive.recommendedRiskProfile} (confidence: ${adaptive.confidence.toFixed(0)}%)`,
  ];

  // Add top risk contributors
  const dims = [
    { name: "Account Health",      score: breakdown.accountHealth.raw },
    { name: "Position Risk",       score: breakdown.positionRisk.raw },
    { name: "Portfolio Stability", score: breakdown.portfolioStability.raw },
    { name: "Market Risk",         score: breakdown.marketRisk.raw },
    { name: "Broker Reliability",  score: breakdown.brokerReliability.raw },
    { name: "System Health",       score: breakdown.systemHealth.raw },
    { name: "Crisis Score",        score: breakdown.crisisScore.raw },
    { name: "Adaptive Risk",       score: breakdown.adaptiveRisk.raw },
  ].sort((a, b) => b.score - a.score);

  evidence.push(`Top risk contributors: ${dims.slice(0, 3).map(d => `${d.name} (${d.score.toFixed(1)})`).join(", ")}`);

  if (account.dailyPnl !== 0) {
    evidence.push(`Daily P/L: ${account.dailyPnl >= 0 ? "+" : ""}${account.dailyPnl.toFixed(2)}`);
  }

  return evidence;
}

// ─── Supporting metrics ───────────────────────────────────────────────────────

function buildSupportingMetrics(
  breakdown:  ErbScoreBreakdown,
  allScores:  Record<string, number>,
  account:    ErbAccountIntelligence,
  crisis:     ErbCrisisIntelligence,
): Record<string, number | string> {
  return {
    overallRiskScore:        breakdown.total,
    survivalScore:           allScores.survivalScore ?? 0,
    capitalHealthScore:      allScores.capitalHealthScore ?? 0,
    infrastructureScore:     allScores.infrastructureScore ?? 0,
    brokerReliabilityScore:  allScores.brokerReliabilityScore ?? 0,
    portfolioStabilityScore: allScores.portfolioStabilityScore ?? 0,
    recoveryConfidenceScore: allScores.recoveryConfidenceScore ?? 0,
    accountHealthScore:      account.accountHealthScore,
    drawdownPct:             account.drawdownPct,
    marginLevel:             account.marginLevel,
    crisisRiskContribution:  breakdown.crisisScore.raw,
    accountRiskContribution: breakdown.accountHealth.raw,
    marketRiskContribution:  breakdown.marketRisk.raw,
    crisisStatus:            crisis.crisisStatus,
    survivalModeActive:      crisis.survivalModeActive ? 1 : 0,
  };
}

// ─── Expected benefit/risk statements ────────────────────────────────────────

function buildExpectedBenefit(rec: ErbRecommendation): string {
  switch (rec) {
    case "trade_normally":
      return "Normal operations maintain full profit potential while all risk metrics remain within safe thresholds.";
    case "reduced_risk":
      return "Reducing position sizes by 25-50% limits potential loss exposure while elevated conditions persist, preserving capital for optimal conditions.";
    case "restrict_exposure":
      return "Restricting new entries prevents compounding losses during elevated risk, protecting the account from further drawdown.";
    case "observation_mode":
      return "Pausing new entries removes exposure during uncertain conditions, allowing risk metrics to stabilise before resuming.";
    case "defensive_mode":
      return "Closing marginal positions and tightening stops materially reduces portfolio risk in high-risk conditions.";
    case "survival_mode":
      return "Emergency position reduction preserves critical capital, preventing catastrophic drawdown that would prevent future recovery.";
    case "emergency_stop":
      return "Immediate halt prevents further capital destruction under extreme conditions until human review resolves root causes.";
  }
}

function buildExpectedRisk(rec: ErbRecommendation): string {
  switch (rec) {
    case "trade_normally":
      return "Normal trading risk applies. Monitor for deterioration in risk metrics.";
    case "reduced_risk":
      return "Reduced profit opportunity during restriction period. Risk of missing optimal entries.";
    case "restrict_exposure":
      return "Missed opportunities if conditions reverse quickly. Existing positions remain exposed.";
    case "observation_mode":
      return "Zero new profit while observing. Opportunity cost during observation period.";
    case "defensive_mode":
      return "Premature position closure may crystallise losses that could have recovered.";
    case "survival_mode":
      return "Forced position reduction may cause slippage and lock in losses. Depends on broker execution quality.";
    case "emergency_stop":
      return "Complete halt means zero profit. Extended stops may affect trading continuity and relationships.";
  }
}

// ─── Confidence from score ────────────────────────────────────────────────────

function computeConfidence(
  overallRiskScore: number,
  rec:              ErbRecommendation,
  account:          ErbAccountIntelligence,
  crisis:           ErbCrisisIntelligence,
): number {
  let base = 70;

  // Higher confidence near clear boundaries
  const distances = Object.entries(ERB_RECOMMENDATION_THRESHOLDS)
    .map(([, threshold]) => Math.abs(overallRiskScore - threshold))
    .sort((a, b) => a - b);

  const minDist = distances[0] ?? 0;
  if (minDist > 10) base += 15;
  else if (minDist < 3) base -= 10;

  // Crisis adds confidence to high-risk recs
  if (crisis.survivalModeActive && (rec === "survival_mode" || rec === "emergency_stop")) {
    base += 10;
  }

  // Very healthy account adds confidence to trade_normally
  if (account.accountHealthScore > 85 && rec === "trade_normally") {
    base += 10;
  }

  return Math.min(98, Math.max(40, base));
}

// ─── Historical comparison builder ───────────────────────────────────────────

export function buildHistoricalComparison(
  historicalRows: Array<{ overallRiskScore?: unknown; survivalScore?: unknown; recommendation?: unknown }>,
  currentRisk:    number,
  currentSurvival: number,
): ErbHistoricalComparison | null {
  if (historicalRows.length < 2) return null;

  const risks    = historicalRows.map(r => Number(r.overallRiskScore ?? 0));
  const survivals = historicalRows.map(r => Number(r.survivalScore ?? 0));
  const avgRisk    = risks.reduce((a, b) => a + b, 0) / risks.length;
  const avgSurvival = survivals.reduce((a, b) => a + b, 0) / survivals.length;
  const prevRec    = String(historicalRows[historicalRows.length - 1]?.recommendation ?? "unknown");
  const changeFromPrev = currentRisk - (risks[risks.length - 1] ?? currentRisk);

  const trend: ErbHistoricalComparison["trend"] =
    changeFromPrev > 5  ? "deteriorating" :
    changeFromPrev < -5 ? "improving"     : "stable";

  return {
    period:             "24h",
    avgOverallRisk:     Math.round(avgRisk * 10) / 10,
    avgSurvivalScore:   Math.round(avgSurvival * 10) / 10,
    prevRecommendation: prevRec,
    trend,
    changeFromPrev:     Math.round(changeFromPrev * 10) / 10,
  };
}

// ─── Master recommendation builder ───────────────────────────────────────────

export function buildRecommendationDetail(
  overallRiskScore: number,
  breakdown:        ErbScoreBreakdown,
  account:          ErbAccountIntelligence,
  crisis:           ErbCrisisIntelligence,
  adaptive:         ErbAdaptiveIntelligence,
  allScores:        Record<string, number>,
  historicalRows:   Array<Record<string, unknown>>,
): ErbRecommendationDetail {
  const rec         = scoreToRecommendation(overallRiskScore);
  const label       = ERB_RECOMMENDATION_LABELS[rec];
  const description = ERB_RECOMMENDATION_DESCRIPTIONS[rec];
  const confidence  = computeConfidence(overallRiskScore, rec, account, crisis);

  const evidence = buildEvidence(overallRiskScore, rec, breakdown, account, crisis, adaptive, allScores);
  const supportingMetrics = buildSupportingMetrics(breakdown, allScores, account, crisis);
  const historicalComparison = buildHistoricalComparison(historicalRows, overallRiskScore, allScores.survivalScore ?? 50);

  return {
    recommendation: rec,
    label,
    description,
    confidence,
    evidence,
    supportingMetrics,
    historicalComparison,
    expectedBenefit: buildExpectedBenefit(rec),
    expectedRisk:    buildExpectedRisk(rec),
  };
}
