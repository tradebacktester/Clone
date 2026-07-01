// ─── Emergency Decision Engine ────────────────────────────────────────────────

import { randomUUID } from "crypto";
import {
  CrisisClassification,
  SurvivalMode,
  EmergencyEvent,
  CrisisType,
  CrisisSeverity,
} from "./types.js";

const RECOVERY_CONDITIONS: Record<CrisisSeverity, string[]> = {
  normal:       ["Continue normal monitoring"],
  minor:        ["Conditions return to baseline", "No further deterioration for 30 minutes"],
  moderate:     ["All crisis scores below 20", "Stable readings for 60 minutes"],
  major:        ["Market, broker, infra scores below 20", "Stable readings for 2 hours", "Confirmed by gradual de-escalation"],
  critical:     ["All systems fully stable for 4 hours", "Broker connection confirmed", "Market regime normalised", "Gradual stage-by-stage recovery"],
  catastrophic: ["Complete system stability for 24 hours", "Manual review and approval", "All subsystem health checks passing", "Gradual multi-stage recovery only"],
};

const HISTORICAL_COMPARISONS: Record<CrisisSeverity, string> = {
  normal:       "Consistent with normal market fluctuations — no historical precedent required.",
  minor:        "Similar to routine market noise events. Typically resolves within 30-60 minutes.",
  moderate:     "Comparable to minor liquidity events. Historical duration: 1-4 hours.",
  major:        "Similar to flash crash recovery periods. Historical duration: 4-24 hours.",
  critical:     "Comparable to major broker outages or circuit breaker events. Historical duration: hours to days.",
  catastrophic: "Extreme event — comparable to black swan scenarios. Recovery requires full manual verification.",
};

export function buildEmergencyEvent(
  classification: CrisisClassification,
  mode: SurvivalMode,
): EmergencyEvent | null {
  if (classification.overallSeverity === "normal" || classification.overallScore < 20) {
    return null;
  }

  const dominantType: CrisisType = classification.dominantCrisisType ?? "composite";
  const trigger = buildTriggerStatement(classification);

  return {
    eventId:               randomUUID(),
    occurredAt:            new Date().toISOString(),
    crisisType:            dominantType,
    severity:              classification.overallSeverity,
    trigger,
    evidence:              classification.supportingEvidence.slice(0, 10),
    recommendedAction:     classification.recommendedResponse,
    recoveryConditions:    RECOVERY_CONDITIONS[classification.overallSeverity],
    historicalComparison:  HISTORICAL_COMPARISONS[classification.overallSeverity],
    survivalModeTriggered: mode,
    isAdvisoryOnly:        true,
  };
}

function buildTriggerStatement(c: CrisisClassification): string {
  const topSignals: string[] = [];
  if (c.marketSignal.crisisScore >= 30)        topSignals.push(`market crisis (${c.marketSignal.crisisScore})`);
  if (c.brokerSignal.crisisScore >= 30)        topSignals.push(`broker instability (${c.brokerSignal.crisisScore})`);
  if (c.infrastructureSignal.crisisScore >= 30) topSignals.push(`infrastructure issue (${c.infrastructureSignal.crisisScore})`);
  if (c.dataIntegritySignal.crisisScore >= 30) topSignals.push(`data integrity failure (${c.dataIntegritySignal.crisisScore})`);
  if (c.strategySignal.crisisScore >= 30)      topSignals.push(`strategy instability (${c.strategySignal.crisisScore})`);

  if (topSignals.length === 0) return `Overall crisis score ${c.overallScore}/100 exceeded threshold.`;
  return `${c.overallSeverity.charAt(0).toUpperCase() + c.overallSeverity.slice(1)} crisis triggered by: ${topSignals.join(", ")}.`;
}
