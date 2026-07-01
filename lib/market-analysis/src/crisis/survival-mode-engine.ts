// ─── Survival Mode Engine ─────────────────────────────────────────────────────

import {
  CrisisClassification,
  SurvivalMode,
  SurvivalModeState,
  MODE_DESCRIPTIONS,
  MODE_RESTRICTIONS,
  SURVIVAL_MODE_ORDER,
  CrisisSeverity,
} from "./types.js";

function severityToMode(severity: CrisisSeverity): SurvivalMode {
  switch (severity) {
    case "catastrophic": return "emergency";
    case "critical":     return "survival";
    case "major":        return "observation";
    case "moderate":     return "defensive";
    case "minor":        return "caution";
    default:             return "normal";
  }
}

export function determineSurvivalMode(
  classification: CrisisClassification,
  currentMode: SurvivalMode | null,
): SurvivalModeState {
  const targetMode = severityToMode(classification.overallSeverity);
  const prev       = currentMode ?? "normal";

  // Never skip escalation stages: if escalating, move one step at a time
  const prevIdx    = SURVIVAL_MODE_ORDER.indexOf(prev);
  const targetIdx  = SURVIVAL_MODE_ORDER.indexOf(targetMode);

  // For escalations: can jump directly (fast-path to safety)
  // For de-escalations: enforce gradual step-down
  let newMode: SurvivalMode;
  let changeType: SurvivalModeState["modeChangeType"];

  if (targetIdx > prevIdx) {
    // Escalation — move directly to target (safety-critical)
    newMode    = targetMode;
    changeType = currentMode === null ? "initial" : "escalation";
  } else if (targetIdx < prevIdx) {
    // De-escalation — only step down ONE level
    newMode    = SURVIVAL_MODE_ORDER[prevIdx - 1];
    changeType = "de-escalation";
  } else {
    newMode    = prev;
    changeType = currentMode === null ? "initial" : "maintenance";
  }

  const modeChanged = newMode !== prev || currentMode === null;
  const activeAlerts = buildActiveAlerts(classification, newMode);

  const reason = modeChanged && changeType !== "maintenance"
    ? buildChangeReason(classification, newMode, changeType)
    : "Mode maintained — conditions unchanged.";

  return {
    currentMode:       newMode,
    previousMode:      currentMode,
    modeChangedAt:     modeChanged ? new Date().toISOString() : null,
    modeChangedReason: modeChanged ? reason : null,
    modeChangeType:    changeType,
    restrictions:      MODE_RESTRICTIONS[newMode],
    description:       MODE_DESCRIPTIONS[newMode],
    activeAlerts,
  };
}

function buildActiveAlerts(c: CrisisClassification, mode: SurvivalMode): string[] {
  const alerts: string[] = [];
  if (c.marketSignal.crisisScore >= 40)        alerts.push(`Market crisis — score ${c.marketSignal.crisisScore}/100`);
  if (c.brokerSignal.crisisScore >= 40)        alerts.push(`Broker reliability crisis — score ${c.brokerSignal.crisisScore}/100`);
  if (c.infrastructureSignal.crisisScore >= 40) alerts.push(`Infrastructure crisis — score ${c.infrastructureSignal.crisisScore}/100`);
  if (c.dataIntegritySignal.crisisScore >= 40) alerts.push(`Data integrity crisis — score ${c.dataIntegritySignal.crisisScore}/100`);
  if (c.strategySignal.crisisScore >= 40)      alerts.push(`Strategy stability crisis — score ${c.strategySignal.crisisScore}/100`);
  if (mode === "emergency")   alerts.push("⛔ EMERGENCY: Automated trading halted");
  if (mode === "survival")    alerts.push("🔴 SURVIVAL: No new trades — protecting capital");
  if (mode === "observation") alerts.push("🟠 OBSERVATION: New entries suspended");
  return alerts;
}

function buildChangeReason(
  c: CrisisClassification,
  newMode: SurvivalMode,
  changeType: string,
): string {
  if (changeType === "initial") return `Initial mode assignment: ${newMode} based on ${c.overallSeverity} severity (score ${c.overallScore}/100).`;
  if (changeType === "escalation") {
    const dominant = c.dominantCrisisType ? ` — ${c.dominantCrisisType.replace("_", " ")} is dominant factor` : "";
    return `Escalated to ${newMode} due to ${c.overallSeverity} crisis (score ${c.overallScore}/100)${dominant}.`;
  }
  return `Gradual de-escalation from crisis conditions to ${newMode} (score ${c.overallScore}/100 improving).`;
}
