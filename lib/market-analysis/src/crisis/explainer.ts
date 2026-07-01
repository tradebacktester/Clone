// ─── Crisis Explainability ────────────────────────────────────────────────────

import {
  CrisisClassification,
  SurvivalModeState,
  RecoveryState,
  CrisisExplainability,
  CrisisSeverity,
  SurvivalMode,
} from "./types.js";

const PROTECTIVE_ACTIONS: Record<SurvivalMode, string[]> = {
  normal:      ["Continue standard monitoring", "Maintain normal risk parameters"],
  caution:     ["Increase monitoring frequency to every 5 minutes", "Activate alert systems", "Review open positions"],
  defensive:   ["Reduce maximum exposure by 50%", "Apply higher confirmation for new entries", "Tighten stop-loss management"],
  observation: ["Suspend all new trade entries immediately", "Continue managing open positions with tightened stops", "Monitor broker and market continuously"],
  survival:    ["No new positions under any circumstances", "Protect all open positions with emergency stops", "Continuous diagnostics every minute"],
  emergency:   ["Halt all automated trading immediately", "Monitor markets, broker, infrastructure in real-time", "Maintain complete logs", "Alert operator for manual review"],
};

const RISKS_IF_IGNORED: Record<CrisisSeverity, string[]> = {
  normal:       ["No significant risks — normal conditions"],
  minor:        ["Slightly elevated loss probability", "Minor execution degradation"],
  moderate:     ["Meaningful capital loss potential", "Strategy performance degradation", "Execution quality reduction"],
  major:        ["Significant drawdown risk", "Multiple simultaneous losses", "Broker or data failure amplification"],
  critical:     ["Catastrophic loss events", "Complete drawdown", "Broker disconnection during open trades"],
  catastrophic: ["Total capital loss risk", "Unrecoverable drawdown", "System integrity failure"],
};

export function buildExplainability(
  classification: CrisisClassification,
  modeState:      SurvivalModeState,
  recovery:       RecoveryState,
): CrisisExplainability {
  const whatHappened   = buildWhatHappened(classification);
  const whyDetected    = buildWhyDetected(classification);
  const protectiveActions = PROTECTIVE_ACTIONS[modeState.currentMode];
  const risksIfIgnored = RISKS_IF_IGNORED[classification.overallSeverity];
  const expectedBenefits = buildExpectedBenefits(modeState.currentMode);
  const recoveryRequirements = recovery.nextStageRequirements.length > 0
    ? recovery.nextStageRequirements
    : ["All systems stable — ready for de-escalation"];

  const narrative = buildNarrative(classification, modeState, recovery);

  return {
    whatHappened,
    whyDetected,
    supportingEvidence: classification.supportingEvidence,
    protectiveActions,
    expectedBenefits,
    risksIfIgnored,
    recoveryRequirements,
    narrative,
  };
}

function buildWhatHappened(c: CrisisClassification): string {
  if (c.overallSeverity === "normal") {
    return "All systems operating within normal parameters. No crisis detected.";
  }
  const dominant = c.dominantCrisisType?.replace("_", " ") ?? "composite";
  return `${c.overallSeverity.charAt(0).toUpperCase() + c.overallSeverity.slice(1)} crisis detected (composite score ${c.overallScore}/100). Dominant factor: ${dominant} crisis. ${c.supportingEvidence.length} evidence item(s) gathered.`;
}

function buildWhyDetected(c: CrisisClassification): string {
  const scores: string[] = [
    `Market: ${c.marketSignal.crisisScore}/100`,
    `Broker: ${c.brokerSignal.crisisScore}/100`,
    `Infrastructure: ${c.infrastructureSignal.crisisScore}/100`,
    `Data Integrity: ${c.dataIntegritySignal.crisisScore}/100`,
    `Strategy: ${c.strategySignal.crisisScore}/100`,
  ];
  return `Weighted composite scoring across 5 dimensions detected ${c.overallSeverity} conditions. Scores — ${scores.join(", ")}. Confidence: ${c.confidence}%.`;
}

function buildExpectedBenefits(mode: SurvivalMode): string[] {
  const base = ["Prevents capital loss during crisis conditions", "Maintains explainability and auditability"];
  switch (mode) {
    case "emergency":   return [...base, "Halts all automated risk exposure", "Ensures manual review before resumption"];
    case "survival":    return [...base, "Protects open positions from adverse conditions", "Prevents new losses during instability"];
    case "observation": return [...base, "Suspends new risk while conditions monitored", "Continues managing existing trades safely"];
    case "defensive":   return [...base, "Reduces exposure by 50%", "Higher confirmation reduces false entries"];
    case "caution":     return [...base, "Early warning allows proactive risk reduction"];
    default:            return [...base, "Normal operation continues with full monitoring"];
  }
}

function buildNarrative(
  c: CrisisClassification,
  m: SurvivalModeState,
  r: RecoveryState,
): string {
  const lines: string[] = [
    `The Crisis Intelligence Engine detected a ${c.overallSeverity} severity event (composite score ${c.overallScore}/100) at ${c.timestamp}.`,
  ];

  if (c.dominantCrisisType) {
    lines.push(`The dominant crisis type is ${c.dominantCrisisType.replace("_", " ")}, supported by ${c.supportingEvidence.length} evidence item(s).`);
  }

  lines.push(`The system has transitioned to ${m.currentMode.toUpperCase()} mode. ${m.description}`);

  if (m.activeAlerts.length > 0) {
    lines.push(`Active alerts: ${m.activeAlerts.join(" | ")}`);
  }

  if (r.stagesRemaining.length > 0) {
    lines.push(`Recovery path: ${["current: " + r.currentStage, ...r.stagesRemaining].join(" → ")}. Estimated recovery: ${r.estimatedRecoveryMinutes} minutes if conditions stabilise.`);
  } else {
    lines.push("System is in normal mode — no active recovery required.");
  }

  return lines.join(" ");
}
