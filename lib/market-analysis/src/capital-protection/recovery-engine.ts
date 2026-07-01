// ─── Recovery Engine ──────────────────────────────────────────────────────────
// Evaluates whether conditions have improved enough to step down protection.
// Enforces sustained recovery — no instant de-escalation.
// Advisory only. NEVER modifies strategy or executes trades.

import type {
  RecoveryStatus,
  ProtectionLevel,
  ProtectionConfig,
} from "./types.js";
import { PROTECTION_LEVEL_SCORE } from "./types.js";
import type { MonitorSnapshot } from "./level-evaluator.js";

const ORDERED_LEVELS: ProtectionLevel[] = [
  "normal",
  "caution",
  "restricted",
  "observation_mode",
  "protected_mode",
  "emergency_mode",
  "trading_halt",
];

// Criteria that must be sustained before stepping down
function buildRecoveryCriteria(
  currentLevel: ProtectionLevel,
  snap: MonitorSnapshot,
  cfg: ProtectionConfig,
): { criteria: string[]; metCount: number } {
  const criteria: string[] = [];
  const met: boolean[] = [];

  switch (currentLevel) {
    case "trading_halt": {
      criteria.push("System health ≥ 90%");
      met.push(snap.system.healthScore >= 90);
      criteria.push("Drawdown below emergency threshold");
      met.push(snap.drawdown.currentDrawdownPct < cfg.drawdownEmergencyPercent);
      criteria.push("Account health ≥ 70");
      met.push(snap.account.healthScore >= 70);
      criteria.push("No emergency alerts from any monitor");
      met.push(!["account", "drawdown", "margin", "system"].some(
        k => (snap as any)[k].severity === "emergency",
      ));
      break;
    }
    case "emergency_mode": {
      criteria.push("No monitor in emergency state");
      met.push(!Object.values(snap).some(m => (m as any).severity === "emergency"));
      criteria.push("Account health ≥ 60");
      met.push(snap.account.healthScore >= 60);
      criteria.push("Drawdown below critical threshold");
      met.push(snap.drawdown.currentDrawdownPct < cfg.drawdownCriticalPercent);
      break;
    }
    case "protected_mode": {
      criteria.push("No monitor in critical or emergency state");
      met.push(!Object.values(snap).some(
        m => ["critical", "emergency"].includes((m as any).severity),
      ));
      criteria.push("Account health ≥ 65");
      met.push(snap.account.healthScore >= 65);
      criteria.push("Drawdown below elevated threshold");
      met.push(snap.drawdown.currentDrawdownPct < cfg.drawdownElevatedPercent);
      break;
    }
    case "observation_mode": {
      criteria.push("No monitor in warning, critical, or emergency");
      met.push(!Object.values(snap).some(
        m => ["warning", "critical", "emergency"].includes((m as any).severity),
      ));
      criteria.push("Consecutive losses < caution limit");
      met.push(snap.consecutiveLoss.consecutiveLosses < cfg.consecutiveLossCaution);
      break;
    }
    case "restricted": {
      criteria.push("All monitors at normal or caution");
      met.push(Object.values(snap).every(
        m => ["normal", "caution"].includes((m as any).severity),
      ));
      criteria.push("Account health ≥ 75");
      met.push(snap.account.healthScore >= 75);
      break;
    }
    case "caution": {
      criteria.push("All monitors at normal");
      met.push(Object.values(snap).every(m => (m as any).severity === "normal"));
      break;
    }
    default:
      break;
  }

  const metCount = met.filter(Boolean).length;
  return { criteria, metCount };
}

export function evaluateRecovery(
  snap: MonitorSnapshot,
  currentLevel: ProtectionLevel,
  proposedLevel: ProtectionLevel,
  hoursAtCurrentLevel: number,
  cfg: ProtectionConfig,
): RecoveryStatus {
  const currentScore = PROTECTION_LEVEL_SCORE[currentLevel];
  const proposedScore = PROTECTION_LEVEL_SCORE[proposedLevel];
  const isInRecovery = proposedScore < currentScore;

  // Target is one step below current (gradual restoration)
  const currentIdx  = ORDERED_LEVELS.indexOf(currentLevel);
  const targetLevel = currentIdx > 0
    ? ORDERED_LEVELS[Math.max(0, currentIdx - 1)]
    : "normal";

  const hoursRequired = cfg.recoveryGracePeriodHours * (currentScore + 1);
  const { criteria, metCount } = buildRecoveryCriteria(currentLevel, snap, cfg);
  const totalCriteria = criteria.length;

  const progressPercent = currentLevel === "normal"
    ? 100
    : Math.round(
        (Math.min(hoursAtCurrentLevel, hoursRequired) / hoursRequired * 50) +
        (totalCriteria > 0 ? (metCount / totalCriteria) * 50 : 50),
      );

  const canStepDown = isInRecovery
    && hoursAtCurrentLevel >= cfg.recoveryGracePeriodHours
    && metCount >= Math.max(1, Math.floor(totalCriteria * 0.6));

  let stepDownBlockReason: string | null = null;
  if (currentLevel !== "normal" && !canStepDown) {
    if (hoursAtCurrentLevel < cfg.recoveryGracePeriodHours) {
      stepDownBlockReason = `Grace period: ${(cfg.recoveryGracePeriodHours - hoursAtCurrentLevel).toFixed(1)}h remaining`;
    } else if (metCount < Math.floor(totalCriteria * 0.6)) {
      stepDownBlockReason = `Recovery criteria: ${metCount}/${totalCriteria} met (need ≥${Math.ceil(totalCriteria * 0.6)})`;
    }
  }

  return {
    isInRecovery,
    currentLevel,
    targetLevel: isInRecovery ? targetLevel : currentLevel,
    hoursAtCurrentLevel,
    hoursRequiredForRecovery: hoursRequired,
    progressPercent: Math.min(100, progressPercent),
    sustainedCriteriaCount:    metCount,
    sustainedCriteriaRequired: Math.max(1, Math.floor(totalCriteria * 0.6)),
    canStepDown,
    stepDownBlockReason,
  };
}
