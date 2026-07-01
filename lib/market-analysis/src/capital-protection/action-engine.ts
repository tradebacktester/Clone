// ─── Protection Action Engine ─────────────────────────────────────────────────
// Generates a deduplicated set of ActiveProtectionActions from monitor outputs.
// Every action is explainable, timestamped, and reversible.
// Advisory only. NEVER modifies strategy or executes trades.

import { randomUUID } from "crypto";
import type {
  ActiveProtectionAction,
  MonitorSeverity,
  ProtectionActionType,
  ProtectionLevel,
  ProtectionConfig,
  RecoveryRequirements,
} from "./types.js";
import { PROTECTION_ACTION_LABELS, PROTECTION_LEVEL_SCORE } from "./types.js";
import type { MonitorSnapshot } from "./level-evaluator.js";

const MONITOR_SEVERITY_SCORE: Record<string, number> = {
  normal: 0, caution: 1, warning: 2, critical: 3, emergency: 4,
};

// ─── Recovery requirements per action ─────────────────────────────────────────

const RECOVERY_REQUIREMENTS: Record<ProtectionActionType, Omit<RecoveryRequirements, "currentStep">> = {
  reduce_position_size: {
    hoursRequired: 4,
    criteriaRequired: ["No daily loss breach for 4h", "Drawdown < warning level"],
    stepwiseRestore: true,
    totalSteps: 3,
  },
  reduce_max_trades: {
    hoursRequired: 4,
    criteriaRequired: ["Account health > 80", "No warning-level monitors"],
    stepwiseRestore: true,
    totalSteps: 2,
  },
  pause_new_trades: {
    hoursRequired: 8,
    criteriaRequired: [
      "All monitors at caution or normal",
      "Drawdown < elevated level",
      "No consecutive loss streak",
    ],
    stepwiseRestore: false,
    totalSteps: 1,
  },
  block_all_entries: {
    hoursRequired: 24,
    criteriaRequired: [
      "All monitors at normal or caution",
      "Daily loss within 50% of limit",
      "Manual review completed",
    ],
    stepwiseRestore: true,
    totalSteps: 3,
  },
  increase_confirmation_requirements: {
    hoursRequired: 2,
    criteriaRequired: ["No caution-level monitors", "Conditions stabilised"],
    stepwiseRestore: false,
    totalSteps: 1,
  },
  enter_observation_mode: {
    hoursRequired: 6,
    criteriaRequired: [
      "Consecutive loss streak resolved",
      "Drawdown < warning level",
      "System health > 90",
    ],
    stepwiseRestore: true,
    totalSteps: 2,
  },
  generate_emergency_alert: {
    hoursRequired: 1,
    criteriaRequired: ["Emergency condition resolved"],
    stepwiseRestore: false,
    totalSteps: 1,
  },
  suspend_broker_entries: {
    hoursRequired: 1,
    criteriaRequired: [
      "Spread within limits for 30 min",
      "Connection quality restored",
      "Execution time normalised",
    ],
    stepwiseRestore: false,
    totalSteps: 1,
  },
  trading_halt: {
    hoursRequired: 48,
    criteriaRequired: [
      "All monitors normal",
      "Manual review and approval",
      "Root cause identified and resolved",
      "Risk committee sign-off",
    ],
    stepwiseRestore: true,
    totalSteps: 5,
  },
};

function buildRecovery(actionType: ProtectionActionType, step = 0): RecoveryRequirements {
  const base = RECOVERY_REQUIREMENTS[actionType];
  return { ...base, currentStep: step };
}

// ─── Action builder helpers ───────────────────────────────────────────────────

interface ActionSpec {
  actionType:       ProtectionActionType;
  trigger:          string;
  thresholdCrossed: string;
  evidence:         string[];
  severity:         MonitorSeverity;
  expectedBenefit:  string;
  parameterChange?: ActiveProtectionAction["parameterChange"];
  isReversible:     boolean;
}

function buildAction(spec: ActionSpec): ActiveProtectionAction {
  return {
    actionId:            randomUUID(),
    actionType:          spec.actionType,
    label:               PROTECTION_ACTION_LABELS[spec.actionType],
    trigger:             spec.trigger,
    thresholdCrossed:    spec.thresholdCrossed,
    evidence:            spec.evidence,
    appliedAt:           new Date().toISOString(),
    expectedBenefit:     spec.expectedBenefit,
    severity:            spec.severity,
    recoveryRequirements: buildRecovery(spec.actionType),
    parameterChange:     spec.parameterChange,
    isReversible:        spec.isReversible,
  };
}

// ─── Main action generation ───────────────────────────────────────────────────

export function generateProtectionActions(
  snap: MonitorSnapshot,
  protectionLevel: ProtectionLevel,
  cfg: ProtectionConfig,
  now = new Date().toISOString(),
): ActiveProtectionAction[] {
  // Collect all unique action types from all monitors
  const allActionTypes = new Set<ProtectionActionType>([
    ...snap.account.actions,
    ...snap.consecutiveLoss.actions,
    ...snap.drawdown.actions,
    ...snap.exposure.actions,
    ...snap.margin.actions,
    ...snap.broker.actions,
    ...snap.system.actions,
  ]);

  // Add level-based overrides
  if (protectionLevel === "trading_halt") {
    allActionTypes.add("trading_halt");
    allActionTypes.add("block_all_entries");
    allActionTypes.add("generate_emergency_alert");
  } else if (protectionLevel === "emergency_mode") {
    allActionTypes.add("block_all_entries");
    allActionTypes.add("generate_emergency_alert");
  } else if (protectionLevel === "protected_mode") {
    allActionTypes.add("pause_new_trades");
  } else if (protectionLevel === "observation_mode") {
    allActionTypes.add("enter_observation_mode");
    allActionTypes.add("increase_confirmation_requirements");
  } else if (protectionLevel === "restricted") {
    allActionTypes.add("reduce_position_size");
  }

  // Build action objects with source attribution
  const actions: ActiveProtectionAction[] = [];

  for (const actionType of allActionTypes) {
    const { trigger, threshold, evidence, severity } = resolveActionContext(actionType, snap, protectionLevel);
    actions.push(buildAction({
      actionType,
      trigger,
      thresholdCrossed:  threshold,
      evidence,
      severity,
      expectedBenefit:   expectedBenefits[actionType],
      parameterChange:   buildParamChange(actionType, cfg),
      isReversible:      actionType !== "trading_halt",
    }));
  }

  // Sort by severity (highest first), then by action priority
  const severityOrder: Record<MonitorSeverity, number> = {
    emergency: 0, critical: 1, warning: 2, caution: 3, normal: 4,
  };
  const actionPriority: Record<ProtectionActionType, number> = {
    trading_halt:                        0,
    block_all_entries:                   1,
    generate_emergency_alert:            2,
    pause_new_trades:                    3,
    suspend_broker_entries:              4,
    enter_observation_mode:              5,
    reduce_max_trades:                   6,
    reduce_position_size:                7,
    increase_confirmation_requirements:  8,
  };

  return actions.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    return sevDiff !== 0 ? sevDiff : (actionPriority[a.actionType] - actionPriority[b.actionType]);
  });
}

const expectedBenefits: Record<ProtectionActionType, string> = {
  reduce_position_size:              "Limits potential loss per trade; preserves capital during adverse conditions",
  reduce_max_trades:                 "Reduces aggregate portfolio risk; prevents compounding losses",
  pause_new_trades:                  "Stops new risk accumulation; preserves existing capital",
  block_all_entries:                 "Prevents any new capital exposure; maximum capital preservation",
  increase_confirmation_requirements: "Raises the bar for trade entry; filters weaker setups",
  enter_observation_mode:            "Monitors market without risking capital; data collection only",
  generate_emergency_alert:          "Notifies operator of critical conditions requiring immediate attention",
  suspend_broker_entries:            "Prevents execution during poor broker conditions; avoids slippage/rejection losses",
  trading_halt:                      "Complete cessation of trading activity; full capital protection",
};

function buildParamChange(
  actionType: ProtectionActionType,
  cfg: ProtectionConfig,
): ActiveProtectionAction["parameterChange"] | undefined {
  switch (actionType) {
    case "reduce_position_size":
      return { parameter: "maxPositionSize", from: "100%", to: "50% of normal" };
    case "reduce_max_trades":
      return { parameter: "maxOpenTrades", from: 5, to: 2 };
    case "pause_new_trades":
      return { parameter: "newEntries", from: "allowed", to: "paused" };
    case "block_all_entries":
      return { parameter: "newEntries", from: "allowed", to: "blocked" };
    case "trading_halt":
      return { parameter: "tradingActive", from: "active", to: "halted" };
    default:
      return undefined;
  }
}

function resolveActionContext(
  actionType: ProtectionActionType,
  snap: MonitorSnapshot,
  level: ProtectionLevel,
): { trigger: string; threshold: string; evidence: string[]; severity: MonitorSeverity } {
  // Find the most severe monitor that requested this action
  const monitors: Array<{ name: string; result: { severity: MonitorSeverity; evidence: string[]; actions: ProtectionActionType[] } }> = [
    { name: "Drawdown Protection",  result: snap.drawdown },
    { name: "Account Protection",   result: snap.account },
    { name: "Margin Protection",    result: snap.margin },
    { name: "System Protection",    result: snap.system },
    { name: "Broker Protection",    result: snap.broker },
    { name: "Consecutive Loss",     result: snap.consecutiveLoss },
    { name: "Exposure Protection",  result: snap.exposure },
  ];

  const requesting = monitors.filter(m => m.result.actions.includes(actionType));
  if (requesting.length === 0) {
    // Level-based override
    return {
      trigger:   `Protection level: ${level}`,
      threshold: level,
      evidence:  [`Triggered by overall protection level escalation to ${level}`],
      severity:  "warning",
    };
  }

  const primary = requesting.reduce((best, m) =>
    MONITOR_SEVERITY_SCORE[m.result.severity] > MONITOR_SEVERITY_SCORE[best.result.severity] ? m : best,
    requesting[0],
  );

  return {
    trigger:   primary.name,
    threshold: primary.result.evidence[0] ?? "Threshold crossed",
    evidence:  primary.result.evidence.slice(0, 4),
    severity:  primary.result.severity,
  };
}
