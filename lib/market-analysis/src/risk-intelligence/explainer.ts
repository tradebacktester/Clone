// ─── Risk Intelligence — Explainability Engine ────────────────────────────────
// Every risk score includes: supporting metrics, historical comparison,
// statistical confidence, evidence references, confidence interval,
// reliability score. No unexplained output allowed.

import type {
  UnifiedRiskIntelligenceObject,
  AccountRiskResult,
  PositionRiskResult,
  PortfolioRiskResult,
  MarketRiskResult,
  BrokerRiskResult,
  SystemRiskResult,
  RiskAlert,
  RiskClassification,
} from "./types.js";
import { RISK_CLASSIFICATION_LABELS } from "./types.js";
import { computeConfidenceInterval, computeReliabilityRating } from "./scorer.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, isFinite(v) ? v : 0));
}

// ─── Build complete supporting evidence bundle ────────────────────────────────

export function buildSupportingEvidence(
  accountRisk:   AccountRiskResult,
  positionRisk:  PositionRiskResult | null,
  portfolioRisk: PortfolioRiskResult,
  marketRisk:    MarketRiskResult,
  brokerRisk:    BrokerRiskResult,
  systemRisk:    SystemRiskResult,
): UnifiedRiskIntelligenceObject["supportingEvidence"] {
  const allAlerts: RiskAlert[] = [
    ...accountRisk.alerts,
    ...(positionRisk?.alerts ?? []),
    ...portfolioRisk.alerts,
    ...marketRisk.alerts,
    ...brokerRisk.alerts,
    ...systemRisk.alerts,
  ];

  return {
    accountEvidence:   accountRisk.evidence,
    positionEvidence:  positionRisk?.evidence ?? ["No active position evaluated"],
    portfolioEvidence: portfolioRisk.evidence,
    marketEvidence:    marketRisk.evidence,
    brokerEvidence:    brokerRisk.evidence,
    systemEvidence:    systemRisk.evidence,
    alertCount:        allAlerts.length,
    criticalAlerts:    allAlerts.filter(a => a.severity === "critical"),
    warningAlerts:     allAlerts.filter(a => a.severity === "warning"),
  };
}

// ─── Collect all alerts across components ─────────────────────────────────────

export function collectAllAlerts(
  accountRisk:   AccountRiskResult,
  positionRisk:  PositionRiskResult | null,
  portfolioRisk: PortfolioRiskResult,
  marketRisk:    MarketRiskResult,
  brokerRisk:    BrokerRiskResult,
  systemRisk:    SystemRiskResult,
): RiskAlert[] {
  return [
    ...accountRisk.alerts,
    ...(positionRisk?.alerts ?? []),
    ...portfolioRisk.alerts,
    ...marketRisk.alerts,
    ...brokerRisk.alerts,
    ...systemRisk.alerts,
  ].sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
  });
}

// ─── Full explainability bundle ───────────────────────────────────────────────

export interface ExplainabilityResult {
  confidenceInterval: { lower: number; upper: number };
  reliabilityRating:  "high" | "moderate" | "low" | "insufficient";
  dataCompleteness:   number;
}

export function buildExplainability(
  overallRiskScore: number,
  confidence:       number,
  systemHealthScore: number,
  positionRisk:     PositionRiskResult | null,
  accountRisk:      AccountRiskResult,
  portfolioRisk:    PortfolioRiskResult,
): ExplainabilityResult {
  const dataCompleteness =
    (accountRisk.accountHealthScore > 0 ? 1 : 0) +
    (positionRisk !== null ? 1 : 0.5) +
    (portfolioRisk.portfolioRiskScore >= 0 ? 1 : 0) +
    0.5 // market + broker always available
  ;
  const dc = clamp(dataCompleteness / 3.5);

  const ci = computeConfidenceInterval(overallRiskScore, confidence);
  const reliability = computeReliabilityRating(confidence, systemHealthScore, dc);

  return { confidenceInterval: ci, reliabilityRating: reliability, dataCompleteness: dc };
}

// ─── Human-readable risk summary ─────────────────────────────────────────────

export function buildRiskSummary(
  score:      number,
  cls:        RiskClassification,
  allAlerts:  RiskAlert[],
  breakdown:  UnifiedRiskIntelligenceObject["scoreBreakdown"],
): string {
  const label = RISK_CLASSIFICATION_LABELS[cls];
  const criticals = allAlerts.filter(a => a.severity === "critical");
  const warnings  = allAlerts.filter(a => a.severity === "warning");

  const lines: string[] = [
    `Overall Risk Score: ${score.toFixed(1)}/100 — ${label}`,
    "",
    "Score breakdown (risk contribution per dimension):",
    `  Account Health      ${(100 - breakdown.accountHealth.raw).toFixed(1)} risk pts × ${(breakdown.accountHealth.weight * 100).toFixed(0)}% = ${breakdown.accountHealth.weighted.toFixed(1)}`,
    `  Position Risk       ${breakdown.positionRisk.inverted.toFixed(1)} risk pts × ${(breakdown.positionRisk.weight * 100).toFixed(0)}% = ${breakdown.positionRisk.weighted.toFixed(1)}`,
    `  Portfolio Risk      ${breakdown.portfolioRisk.inverted.toFixed(1)} risk pts × ${(breakdown.portfolioRisk.weight * 100).toFixed(0)}% = ${breakdown.portfolioRisk.weighted.toFixed(1)}`,
    `  Market Risk         ${breakdown.marketRisk.inverted.toFixed(1)} risk pts × ${(breakdown.marketRisk.weight * 100).toFixed(0)}% = ${breakdown.marketRisk.weighted.toFixed(1)}`,
    `  Broker Reliability  ${breakdown.brokerReliability.inverted.toFixed(1)} risk pts × ${(breakdown.brokerReliability.weight * 100).toFixed(0)}% = ${breakdown.brokerReliability.weighted.toFixed(1)}`,
    `  System Health       ${breakdown.systemHealth.inverted.toFixed(1)} risk pts × ${(breakdown.systemHealth.weight * 100).toFixed(0)}% = ${breakdown.systemHealth.weighted.toFixed(1)}`,
    `  TOTAL               ${breakdown.total.toFixed(1)}/100`,
    "",
  ];

  if (criticals.length > 0) {
    lines.push(`Critical alerts (${criticals.length}):`);
    for (const a of criticals) {
      lines.push(`  ⚠ [${a.category.toUpperCase()}] ${a.title}: ${a.message}`);
    }
    lines.push("");
  }

  if (warnings.length > 0) {
    lines.push(`Warnings (${warnings.length}):`);
    for (const a of warnings.slice(0, 5)) {
      lines.push(`  ! [${a.category.toUpperCase()}] ${a.title}: ${a.message}`);
    }
    if (warnings.length > 5) lines.push(`  ... and ${warnings.length - 5} more warnings`);
    lines.push("");
  }

  if (criticals.length === 0 && warnings.length === 0) {
    lines.push("No critical or warning alerts — system operating within normal parameters.");
  }

  return lines.join("\n");
}
