// ─── Executive Risk Brain — Explainability Engine ─────────────────────────────
// Every recommendation must be explainable. No unexplained output is permitted.
// Advisory only. NEVER modifies strategy or safety limits.

import type {
  ErbExplainability,
  ErbScoreBreakdown,
  ErbAccountIntelligence,
  ErbPortfolioIntelligence,
  ErbMarketIntelligence,
  ErbBrokerIntelligence,
  ErbInfrastructureIntelligence,
  ErbCrisisIntelligence,
  ErbAdaptiveIntelligence,
  ErbRecommendation,
} from "./types.js";
import { ERB_RECOMMENDATION_LABELS } from "./types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number): number { return Math.max(0, Math.min(100, isFinite(v) ? v : 0)); }

// ─── Triggering metrics collector ─────────────────────────────────────────────

export function identifyTriggeringMetrics(
  breakdown:   ErbScoreBreakdown,
  account:     ErbAccountIntelligence,
  crisis:      ErbCrisisIntelligence,
  overallRisk: number,
): string[] {
  const triggers: string[] = [];

  // Score thresholds that raise concern
  if (breakdown.accountHealth.raw > 50)
    triggers.push(`Account health degraded (risk contribution: ${breakdown.accountHealth.raw.toFixed(1)}/100)`);
  if (breakdown.positionRisk.raw > 60)
    triggers.push(`Position risk elevated (risk contribution: ${breakdown.positionRisk.raw.toFixed(1)}/100)`);
  if (breakdown.portfolioStability.raw > 50)
    triggers.push(`Portfolio instability (risk contribution: ${breakdown.portfolioStability.raw.toFixed(1)}/100)`);
  if (breakdown.marketRisk.raw > 55)
    triggers.push(`Market conditions deteriorated (risk contribution: ${breakdown.marketRisk.raw.toFixed(1)}/100)`);
  if (breakdown.brokerReliability.raw > 40)
    triggers.push(`Broker reliability concern (risk contribution: ${breakdown.brokerReliability.raw.toFixed(1)}/100)`);
  if (breakdown.systemHealth.raw > 40)
    triggers.push(`Infrastructure health degraded (risk contribution: ${breakdown.systemHealth.raw.toFixed(1)}/100)`);
  if (breakdown.crisisScore.raw > 30)
    triggers.push(`Crisis conditions detected (risk contribution: ${breakdown.crisisScore.raw.toFixed(1)}/100)`);

  // Specific account metrics
  if (account.drawdownPct > 5)
    triggers.push(`Drawdown exceeds 5% threshold (current: ${account.drawdownPct.toFixed(2)}%)`);
  if (account.marginLevel > 0 && account.marginLevel < 150)
    triggers.push(`Margin level approaching warning threshold (${account.marginLevel.toFixed(0)}%)`);
  if (account.dailyPnl < 0 && Math.abs(account.dailyPnl) > account.balance * 0.02)
    triggers.push(`Daily loss exceeds 2% of balance (${account.dailyPnl.toFixed(2)})`);

  // Crisis-specific
  if (crisis.survivalModeActive)
    triggers.push("Survival mode is currently active");
  if (crisis.crisisSeverity === "high" || crisis.crisisSeverity === "critical" || crisis.crisisSeverity === "extreme")
    triggers.push(`Crisis severity at "${crisis.crisisSeverity}" level`);

  // Overall
  if (overallRisk > 65)
    triggers.push(`Overall risk score ${overallRisk.toFixed(1)} exceeds defensive threshold (65)`);
  else if (overallRisk > 55)
    triggers.push(`Overall risk score ${overallRisk.toFixed(1)} exceeds observation threshold (55)`);

  return triggers.length > 0 ? triggers : ["No critical thresholds breached — conditions within normal parameters"];
}

// ─── Active protections ───────────────────────────────────────────────────────

export function identifyActiveProtections(
  crisis:   ErbCrisisIntelligence,
  adaptive: ErbAdaptiveIntelligence,
  account:  ErbAccountIntelligence,
  rec:      ErbRecommendation,
): string[] {
  const protections: string[] = [];

  if (crisis.survivalModeActive)
    protections.push("Survival mode active — new trade entry halted");
  if (crisis.recoveryStage !== "none" && crisis.recoveryStage !== "")
    protections.push(`Recovery protocol active: stage "${crisis.recoveryStage}" (${crisis.recoveryProgress.toFixed(0)}% complete)`);
  if (adaptive.currentRiskProfile !== "balanced" && adaptive.currentRiskProfile !== "aggressive")
    protections.push(`Risk profile set to "${adaptive.currentRiskProfile}" (reduced from baseline)`);
  if (account.drawdownPct > 3)
    protections.push("Drawdown protection monitoring active");

  switch (rec) {
    case "reduced_risk":
      protections.push("Position size reduction active (25-50% of normal)");
      break;
    case "restrict_exposure":
      protections.push("New position restriction active");
      break;
    case "observation_mode":
      protections.push("Trade entry suspended — observation mode");
      break;
    case "defensive_mode":
      protections.push("Defensive mode — existing positions under tight management");
      break;
    case "survival_mode":
      protections.push("Capital preservation protocol — position reduction in progress");
      break;
    case "emergency_stop":
      protections.push("Emergency stop — all trading operations halted");
      break;
  }

  return protections.length > 0 ? protections : ["Standard risk monitoring active"];
}

// ─── Top contributing subsystem ───────────────────────────────────────────────

export function identifyTopContributor(breakdown: ErbScoreBreakdown): {
  subsystem: string;
  weight:    number;
} {
  const dims = [
    { subsystem: "Account Health",      weight: breakdown.accountHealth.weighted,      raw: breakdown.accountHealth.raw },
    { subsystem: "Position Risk",       weight: breakdown.positionRisk.weighted,       raw: breakdown.positionRisk.raw },
    { subsystem: "Portfolio Stability", weight: breakdown.portfolioStability.weighted, raw: breakdown.portfolioStability.raw },
    { subsystem: "Market Risk",         weight: breakdown.marketRisk.weighted,         raw: breakdown.marketRisk.raw },
    { subsystem: "Broker Reliability",  weight: breakdown.brokerReliability.weighted,  raw: breakdown.brokerReliability.raw },
    { subsystem: "System Health",       weight: breakdown.systemHealth.weighted,       raw: breakdown.systemHealth.raw },
    { subsystem: "Crisis Score",        weight: breakdown.crisisScore.weighted,        raw: breakdown.crisisScore.raw },
    { subsystem: "Adaptive Risk",       weight: breakdown.adaptiveRisk.weighted,       raw: breakdown.adaptiveRisk.raw },
  ];
  return dims.sort((a, b) => b.weight - a.weight)[0] ?? { subsystem: "Account Health", weight: 0 };
}

// ─── Confidence interval ──────────────────────────────────────────────────────

export function computeConfidenceInterval(
  overallRiskScore: number,
  account:          ErbAccountIntelligence,
  crisis:           ErbCrisisIntelligence,
): { lower: number; upper: number } {
  // Spread widens with uncertainty (crisis, incomplete data)
  const baseSpreads = crisis.survivalModeActive ? 12 :
                      crisis.crisisSeverity !== "none" ? 8 : 5;
  const dataUncertainty = account.accountHealthScore < 50 ? 4 : 0;
  const spread = baseSpreads + dataUncertainty;

  return {
    lower: clamp(overallRiskScore - spread),
    upper: clamp(overallRiskScore + spread),
  };
}

// ─── Reliability rating ───────────────────────────────────────────────────────

export function computeReliabilityRating(
  account:  ErbAccountIntelligence,
  crisis:   ErbCrisisIntelligence,
  adaptive: ErbAdaptiveIntelligence,
): "high" | "moderate" | "low" | "insufficient" {
  if (crisis.crisisSeverity === "extreme") return "low";
  if (adaptive.confidence < 30) return "insufficient";
  if (account.accountHealthScore > 70 && adaptive.confidence > 60) return "high";
  if (account.accountHealthScore > 50) return "moderate";
  return "low";
}

// ─── Historical context ───────────────────────────────────────────────────────

export function buildHistoricalContext(
  historicalRows: Array<Record<string, unknown>>,
  currentRisk:    number,
): string {
  if (historicalRows.length === 0) {
    return "No historical comparison available — first evaluation in the current session.";
  }

  const risks = historicalRows.map(r => Number(r.overallRiskScore ?? 0));
  const avg = risks.reduce((a, b) => a + b, 0) / risks.length;
  const trend = currentRisk > avg + 5 ? "deteriorating" :
                currentRisk < avg - 5 ? "improving"     : "stable";

  return `Based on ${historicalRows.length} prior evaluations (avg risk: ${avg.toFixed(1)}): ` +
         `current risk is ${trend} (current: ${currentRisk.toFixed(1)}, avg: ${avg.toFixed(1)}).`;
}

// ─── Subsystem contribution summary ──────────────────────────────────────────

export function buildSubsystemContributions(breakdown: ErbScoreBreakdown): Array<{
  subsystem: string;
  score:     number;
  weight:    number;
  impact:    string;
}> {
  const dims = [
    { subsystem: "Account Health",      score: breakdown.accountHealth.raw,      weight: breakdown.accountHealth.weight,      weighted: breakdown.accountHealth.weighted },
    { subsystem: "Position Risk",       score: breakdown.positionRisk.raw,       weight: breakdown.positionRisk.weight,       weighted: breakdown.positionRisk.weighted },
    { subsystem: "Portfolio Stability", score: breakdown.portfolioStability.raw, weight: breakdown.portfolioStability.weight, weighted: breakdown.portfolioStability.weighted },
    { subsystem: "Market Risk",         score: breakdown.marketRisk.raw,         weight: breakdown.marketRisk.weight,         weighted: breakdown.marketRisk.weighted },
    { subsystem: "Broker Reliability",  score: breakdown.brokerReliability.raw,  weight: breakdown.brokerReliability.weight,  weighted: breakdown.brokerReliability.weighted },
    { subsystem: "System Health",       score: breakdown.systemHealth.raw,       weight: breakdown.systemHealth.weight,       weighted: breakdown.systemHealth.weighted },
    { subsystem: "Crisis Score",        score: breakdown.crisisScore.raw,        weight: breakdown.crisisScore.weight,        weighted: breakdown.crisisScore.weighted },
    { subsystem: "Adaptive Risk",       score: breakdown.adaptiveRisk.raw,       weight: breakdown.adaptiveRisk.weight,       weighted: breakdown.adaptiveRisk.weighted },
  ];

  return dims.sort((a, b) => b.weighted - a.weighted).map(d => ({
    subsystem: d.subsystem,
    score:     Math.round(d.score * 10) / 10,
    weight:    Math.round(d.weight * 100),
    impact:    d.score > 70 ? "High Risk" : d.score > 40 ? "Moderate Risk" : "Low Risk",
  }));
}

// ─── Why-this-recommendation narrative ───────────────────────────────────────

export function buildWhyNarrative(
  overallRiskScore: number,
  rec:              ErbRecommendation,
  breakdown:        ErbScoreBreakdown,
  account:          ErbAccountIntelligence,
  crisis:           ErbCrisisIntelligence,
  portfolio:        ErbPortfolioIntelligence,
  market:           ErbMarketIntelligence,
): string {
  const label = ERB_RECOMMENDATION_LABELS[rec];
  const topDim = identifyTopContributor(breakdown);

  const lines: string[] = [
    `Overall Risk Score ${overallRiskScore.toFixed(1)}/100 triggers "${label}".`,
    `Primary driver: ${topDim.subsystem} contributing ${topDim.weight.toFixed(1)} risk points.`,
  ];

  if (account.drawdownPct > 5) {
    lines.push(`Account drawdown at ${account.drawdownPct.toFixed(2)}% exceeds the 5% protective threshold.`);
  }
  if (crisis.survivalModeActive) {
    lines.push(`Crisis engine has activated survival mode — ${crisis.crisisSeverity} severity.`);
  }
  if (portfolio.openTrades > 3) {
    lines.push(`Portfolio has ${portfolio.openTrades} open trades with correlation exposure of ${portfolio.correlationExposure.toFixed(1)}%.`);
  }
  if (market.marketRiskScore > 60) {
    lines.push(`Market risk score elevated at ${market.marketRiskScore.toFixed(1)}/100 in ${market.marketRegime} regime.`);
  }

  lines.push(`Score breakdown: Account ${breakdown.accountHealth.weighted.toFixed(1)} + Portfolio ${breakdown.portfolioStability.weighted.toFixed(1)} + Market ${breakdown.marketRisk.weighted.toFixed(1)} + Crisis ${breakdown.crisisScore.weighted.toFixed(1)} + others = ${overallRiskScore.toFixed(1)}.`);

  return lines.join(" ");
}

// ─── Master explainability builder ───────────────────────────────────────────

export function buildExplainability(
  overallRiskScore: number,
  rec:              ErbRecommendation,
  breakdown:        ErbScoreBreakdown,
  account:          ErbAccountIntelligence,
  portfolio:        ErbPortfolioIntelligence,
  market:           ErbMarketIntelligence,
  broker:           ErbBrokerIntelligence,
  infra:            ErbInfrastructureIntelligence,
  crisis:           ErbCrisisIntelligence,
  adaptive:         ErbAdaptiveIntelligence,
  historicalRows:   Array<Record<string, unknown>>,
): ErbExplainability {
  const top = identifyTopContributor(breakdown);

  return {
    whyThisRecommendation:    buildWhyNarrative(overallRiskScore, rec, breakdown, account, crisis, portfolio, market),
    topContributingSubsystem: top.subsystem,
    topContributionWeight:    Math.round(top.weight * 10) / 10,
    triggeringMetrics:        identifyTriggeringMetrics(breakdown, account, crisis, overallRiskScore),
    activeProtections:        identifyActiveProtections(crisis, adaptive, account, rec),
    historicalContext:        buildHistoricalContext(historicalRows, overallRiskScore),
    confidenceInterval:       computeConfidenceInterval(overallRiskScore, account, crisis),
    reliabilityRating:        computeReliabilityRating(account, crisis, adaptive),
    subsystemContributions:   buildSubsystemContributions(breakdown),
  };
}
