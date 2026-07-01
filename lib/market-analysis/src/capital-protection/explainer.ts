// ─── Capital Protection Explainer ────────────────────────────────────────────
// Builds human-readable explanations for all protection decisions.
// Advisory only. NEVER modifies strategy or executes trades.

import type {
  ProtectionExplainability,
  ProtectionLevel,
  ActiveProtectionAction,
  ProtectionActionType,
} from "./types.js";
import { PROTECTION_LEVEL_LABELS } from "./types.js";
import type { MonitorSnapshot } from "./level-evaluator.js";
import type { RecoveryStatus } from "./types.js";

const MONITOR_LABELS: Record<string, string> = {
  account:        "Account Protection",
  consecutiveLoss:"Consecutive Loss",
  drawdown:       "Drawdown Protection",
  exposure:       "Exposure Protection",
  margin:         "Margin Protection",
  broker:         "Broker Protection",
  system:         "System Protection",
};

function findPrimaryTrigger(snap: MonitorSnapshot): { monitor: string; evidence: string } {
  const MONITOR_SEVERITY_SCORE: Record<string, number> = {
    normal: 0, caution: 1, warning: 2, critical: 3, emergency: 4,
  };
  let worst = { monitor: "none", score: -1, evidence: "All systems nominal" };

  for (const [key, result] of Object.entries(snap)) {
    const score = MONITOR_SEVERITY_SCORE[(result as any).severity] ?? 0;
    if (score > worst.score) {
      const ev = (result as any).evidence?.[0] ?? (result as any).triggeredLimits?.[0] ?? "Threshold crossed";
      worst = { monitor: key, score, evidence: ev };
    }
  }
  return { monitor: worst.monitor, evidence: worst.evidence };
}

function levelJustification(level: ProtectionLevel, snap: MonitorSnapshot): string {
  const critical  = Object.values(snap).filter(m => ["critical", "emergency"].includes((m as any).severity)).length;
  const warning   = Object.values(snap).filter(m => (m as any).severity === "warning").length;
  const caution   = Object.values(snap).filter(m => (m as any).severity === "caution").length;

  switch (level) {
    case "trading_halt":
      return `Trading halted: one or more critical infrastructure components are in emergency state. This is the highest protection level — no new positions can be opened until conditions fully normalize and the grace period expires.`;
    case "emergency_mode":
      return `Emergency mode activated: ${critical} monitor${critical !== 1 ? "s" : ""} in critical/emergency state. All new entries are blocked to prevent further capital erosion. Immediate operator attention required.`;
    case "protected_mode":
      return `Protected mode: ${critical} critical + ${warning} warning conditions detected. New trades paused. Capital is being actively protected from compounding losses.`;
    case "observation_mode":
      return `Observation mode: ${warning} warning condition${warning !== 1 ? "s" : ""} detected across monitors. No new trades — monitoring market for improvement before resuming.`;
    case "restricted":
      return `Restricted mode: ${caution + warning} abnormal condition${(caution + warning) !== 1 ? "s" : ""} detected. Position sizes reduced and confirmation requirements raised to manage incremental risk.`;
    case "caution":
      return `Caution level: ${caution} early-warning signal${caution !== 1 ? "s" : ""} detected. Maintaining trading with increased vigilance and reduced position sizing.`;
    case "normal":
    default:
      return `Normal operations: all 7 protection monitors within healthy parameters. Standard risk management rules apply.`;
  }
}

function buildSummary(level: ProtectionLevel, primaryMonitor: string, actions: ActiveProtectionAction[]): string {
  const label  = PROTECTION_LEVEL_LABELS[level];
  const monLabel = MONITOR_LABELS[primaryMonitor] ?? primaryMonitor;
  const actionCount = actions.length;

  if (level === "normal") {
    return `Capital Protection is NORMAL. All monitors green. Standard trading conditions apply.`;
  }
  return `Capital Protection has escalated to ${label.toUpperCase()} — primary trigger: ${monLabel}. ${actionCount} protective action${actionCount !== 1 ? "s" : ""} active. No strategy logic has been modified.`;
}

function buildActionJustifications(
  actions: ActiveProtectionAction[],
): ProtectionExplainability["actionJustifications"] {
  return actions.map(a => ({
    action:          a.actionType,
    reason:          `${a.trigger} — ${a.thresholdCrossed}`,
    evidence:        a.evidence,
    expectedOutcome: a.expectedBenefit,
  }));
}

function buildHistoricalComparison(snap: MonitorSnapshot): string {
  const dd = snap.drawdown.currentDrawdownPct;
  const maxDd = snap.drawdown.maxDrawdownPct;
  const cl = snap.consecutiveLoss.consecutiveLosses;

  const parts: string[] = [];
  if (dd > 0) {
    parts.push(`Current drawdown (${dd.toFixed(2)}%) vs historical max (${maxDd.toFixed(2)}%)`);
  }
  if (cl > 0) {
    parts.push(`${cl} consecutive loss${cl > 1 ? "es" : ""} in current streak`);
  }
  if (parts.length === 0) return "No adverse historical comparison — conditions are within normal range.";
  return parts.join("; ") + ".";
}

function buildRecoveryPath(recovery: RecoveryStatus): string {
  if (recovery.currentLevel === "normal") return "No recovery required — operating at normal level.";
  const lines: string[] = [
    `Currently at: ${PROTECTION_LEVEL_LABELS[recovery.currentLevel]}`,
    `Target: ${PROTECTION_LEVEL_LABELS[recovery.targetLevel]} (one step down)`,
    `Grace period: ${recovery.hoursAtCurrentLevel.toFixed(1)}h elapsed of ${recovery.hoursRequiredForRecovery.toFixed(0)}h required`,
    `Recovery criteria: ${recovery.sustainedCriteriaCount}/${recovery.sustainedCriteriaRequired} met`,
    `Progress: ${recovery.progressPercent}%`,
  ];
  if (recovery.stepDownBlockReason) {
    lines.push(`Blocked: ${recovery.stepDownBlockReason}`);
  }
  if (recovery.canStepDown) {
    lines.push(`✓ Ready to step down to ${PROTECTION_LEVEL_LABELS[recovery.targetLevel]}`);
  }
  return lines.join(" | ");
}

export function buildExplainability(
  snap: MonitorSnapshot,
  protectionLevel: ProtectionLevel,
  actions: ActiveProtectionAction[],
  recovery: RecoveryStatus,
): ProtectionExplainability {
  const { monitor: primaryMonitor, evidence: primaryEvidence } = findPrimaryTrigger(snap);

  return {
    summary:            buildSummary(protectionLevel, primaryMonitor, actions),
    primaryTrigger:     `${MONITOR_LABELS[primaryMonitor] ?? primaryMonitor}: ${primaryEvidence}`,
    levelJustification: levelJustification(protectionLevel, snap),
    actionJustifications: buildActionJustifications(actions),
    historicalComparison: buildHistoricalComparison(snap),
    recoveryPath:       buildRecoveryPath(recovery),
  };
}
