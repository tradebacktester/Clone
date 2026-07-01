// ─── Protection Level Evaluator ───────────────────────────────────────────────
// Determines the overall ProtectionLevel from all monitor results.
// Uses a severity-based escalation model with hysteresis (no instant recovery).
// Advisory only. NEVER modifies strategy or executes trades.

import type {
  AccountProtectionResult,
  ConsecutiveLossResult,
  DrawdownProtectionResult,
  ExposureProtectionResult,
  MarginProtectionResult,
  BrokerProtectionResult,
  SystemProtectionResult,
  MonitorSeverity,
  ProtectionLevel,
  ProtectionConfig,
} from "./types.js";
import {
  MONITOR_SEVERITY_SCORE,
  PROTECTION_LEVEL_SCORE,
} from "./types.js";

export interface MonitorSnapshot {
  account:        AccountProtectionResult;
  consecutiveLoss: ConsecutiveLossResult;
  drawdown:       DrawdownProtectionResult;
  exposure:       ExposureProtectionResult;
  margin:         MarginProtectionResult;
  broker:         BrokerProtectionResult;
  system:         SystemProtectionResult;
}

interface EvaluationResult {
  protectionLevel:  ProtectionLevel;
  maxSeverity:      MonitorSeverity;
  severityCounts:   Record<MonitorSeverity, number>;
  primaryMonitor:   string;
  escalationReason: string;
}

function maxSeverity(snap: MonitorSnapshot): { severity: MonitorSeverity; monitor: string } {
  const candidates: Array<{ severity: MonitorSeverity; monitor: string }> = [
    { severity: snap.account.severity,        monitor: "account" },
    { severity: snap.consecutiveLoss.severity, monitor: "consecutiveLoss" },
    { severity: snap.drawdown.severity,        monitor: "drawdown" },
    { severity: snap.exposure.severity,        monitor: "exposure" },
    { severity: snap.margin.severity,          monitor: "margin" },
    { severity: snap.broker.severity,          monitor: "broker" },
    { severity: snap.system.severity,          monitor: "system" },
  ];
  return candidates.reduce((best, c) =>
    MONITOR_SEVERITY_SCORE[c.severity] > MONITOR_SEVERITY_SCORE[best.severity] ? c : best,
    candidates[0],
  );
}

function countSeverities(snap: MonitorSnapshot): Record<MonitorSeverity, number> {
  const counts: Record<MonitorSeverity, number> = {
    normal: 0, caution: 0, warning: 0, critical: 0, emergency: 0,
  };
  const severities: MonitorSeverity[] = [
    snap.account.severity,
    snap.consecutiveLoss.severity,
    snap.drawdown.severity,
    snap.exposure.severity,
    snap.margin.severity,
    snap.broker.severity,
    snap.system.severity,
  ];
  for (const s of severities) counts[s]++;
  return counts;
}

function rawLevel(
  maxSev: MonitorSeverity,
  counts: Record<MonitorSeverity, number>,
): ProtectionLevel {
  switch (maxSev) {
    case "emergency":
      // Emergency from system or drawdown → trading halt, else emergency_mode
      return "emergency_mode"; // trading_halt set by escalateWithHistory if repeated

    case "critical":
      // Multiple criticals → emergency_mode
      return counts.critical >= 2 ? "emergency_mode" : "protected_mode";

    case "warning":
      // Multiple warnings → protected_mode
      return counts.warning >= 3 ? "protected_mode"
           : counts.warning >= 2 ? "observation_mode"
           : "restricted";

    case "caution":
      return counts.caution >= 3 ? "restricted" : "caution";

    case "normal":
    default:
      return "normal";
  }
}

// Trading halt conditions: system or drawdown emergency, or combined
function shouldHalt(
  snap: MonitorSnapshot,
  maxSev: MonitorSeverity,
): boolean {
  if (maxSev !== "emergency") return false;
  return (
    snap.system.severity === "emergency"  ||
    snap.drawdown.severity === "emergency" ||
    snap.margin.severity === "emergency"
  );
}

// Hysteresis: can only step DOWN one level if we've been stable for grace period
export function applyHysteresis(
  rawProtectionLevel: ProtectionLevel,
  currentProtectionLevel: ProtectionLevel,
  hoursAtCurrentLevel: number,
  cfg: ProtectionConfig,
): ProtectionLevel {
  const rawScore     = PROTECTION_LEVEL_SCORE[rawProtectionLevel];
  const currentScore = PROTECTION_LEVEL_SCORE[currentProtectionLevel];

  // Always allow escalation instantly
  if (rawScore >= currentScore) return rawProtectionLevel;

  // De-escalation requires grace period
  if (hoursAtCurrentLevel < cfg.recoveryGracePeriodHours) {
    return currentProtectionLevel; // hold current level
  }

  // Allow one step down maximum per grace period
  const orderedLevels: ProtectionLevel[] = [
    "normal", "caution", "restricted", "observation_mode",
    "protected_mode", "emergency_mode", "trading_halt",
  ];
  const currentIdx = orderedLevels.indexOf(currentProtectionLevel);
  const rawIdx     = orderedLevels.indexOf(rawProtectionLevel);

  if (rawIdx < currentIdx) {
    // Step down by 1
    return orderedLevels[Math.max(0, currentIdx - 1)];
  }
  return rawProtectionLevel;
}

export function evaluateProtectionLevel(
  snap: MonitorSnapshot,
  currentProtectionLevel: ProtectionLevel = "normal",
  hoursAtCurrentLevel: number = 0,
  cfg: ProtectionConfig,
): EvaluationResult {
  const { severity: maxSev, monitor: primaryMonitor } = maxSeverity(snap);
  const counts = countSeverities(snap);

  let level = rawLevel(maxSev, counts);

  // Trading halt override
  if (shouldHalt(snap, maxSev)) {
    level = "trading_halt";
  }

  // Apply hysteresis (prevent instant de-escalation)
  const finalLevel = applyHysteresis(level, currentProtectionLevel, hoursAtCurrentLevel, cfg);

  const escalationReason = buildEscalationReason(finalLevel, maxSev, primaryMonitor, counts, snap);

  return {
    protectionLevel:  finalLevel,
    maxSeverity:      maxSev,
    severityCounts:   counts,
    primaryMonitor,
    escalationReason,
  };
}

function buildEscalationReason(
  level: ProtectionLevel,
  maxSev: MonitorSeverity,
  primary: string,
  counts: Record<MonitorSeverity, number>,
  snap: MonitorSnapshot,
): string {
  const monitorLabels: Record<string, string> = {
    account: "Account Protection",
    consecutiveLoss: "Consecutive Loss",
    drawdown: "Drawdown Protection",
    exposure: "Exposure Protection",
    margin: "Margin Protection",
    broker: "Broker Protection",
    system: "System Protection",
  };

  if (level === "trading_halt") {
    return `Trading halted — ${monitorLabels[primary] ?? primary} in emergency state (${maxSev})`;
  }
  if (level === "emergency_mode") {
    const emergencies = Object.values(snap).filter(m => (m as any).severity === "emergency").length;
    return `Emergency mode — ${emergencies} monitor${emergencies > 1 ? "s" : ""} in emergency state`;
  }
  if (level === "protected_mode") {
    return `Protected mode — ${counts.critical} critical + ${counts.warning} warning monitor${counts.critical !== 1 ? "s" : ""}, led by ${monitorLabels[primary] ?? primary}`;
  }
  if (level === "observation_mode") {
    return `Observation mode — ${counts.warning} warning monitor${counts.warning !== 1 ? "s" : ""}; monitoring closely`;
  }
  if (level === "restricted") {
    return `Restricted — ${monitorLabels[primary] ?? primary} at ${maxSev} severity`;
  }
  if (level === "caution") {
    return `Caution — ${monitorLabels[primary] ?? primary} flagged at caution level`;
  }
  return "Normal — all monitors within healthy parameters";
}

export { EvaluationResult };
