// ─── Drawdown Protection Monitor ─────────────────────────────────────────────
// Monitors current/max drawdown, velocity, and recovery rate.
// Advisory only. NEVER modifies strategy or executes trades.

import type {
  DrawdownProtectionResult,
  MonitorSeverity,
  ProtectionActionType,
  ProtectionConfig,
} from "./types.js";

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, isFinite(v) ? v : lo));
}

// Drawdown velocity: average % per hour over the history window
function computeVelocity(history: Array<{ dd: number; ts: string }>): number {
  if (history.length < 2) return 0;
  const sorted = [...history].sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime(),
  );
  const first = sorted[0];
  const last  = sorted[sorted.length - 1];
  const dtHours = (new Date(last.ts).getTime() - new Date(first.ts).getTime()) / 3_600_000;
  if (dtHours <= 0) return 0;
  const ddChange = last.dd - first.dd; // positive = worsening
  return ddChange / dtHours;
}

// Recovery rate: how fast drawdown is improving (negative velocity = recovery)
function computeRecoveryRate(history: Array<{ dd: number; ts: string }>): number {
  return -computeVelocity(history); // positive = recovering
}

function ddToHealthScore(dd: number, cfg: ProtectionConfig): number {
  if (dd <= 0) return 100;
  if (dd < cfg.drawdownWarningPercent) {
    return clamp(100 - (dd / cfg.drawdownWarningPercent) * 15);
  }
  if (dd < cfg.drawdownElevatedPercent) {
    const ratio = (dd - cfg.drawdownWarningPercent) / (cfg.drawdownElevatedPercent - cfg.drawdownWarningPercent);
    return clamp(85 - ratio * 20);
  }
  if (dd < cfg.drawdownCriticalPercent) {
    const ratio = (dd - cfg.drawdownElevatedPercent) / (cfg.drawdownCriticalPercent - cfg.drawdownElevatedPercent);
    return clamp(65 - ratio * 30);
  }
  if (dd < cfg.drawdownEmergencyPercent) {
    const ratio = (dd - cfg.drawdownCriticalPercent) / (cfg.drawdownEmergencyPercent - cfg.drawdownCriticalPercent);
    return clamp(35 - ratio * 25);
  }
  // Beyond emergency
  return clamp(10 - (dd - cfg.drawdownEmergencyPercent) * 2);
}

function scoreToSeverity(score: number): MonitorSeverity {
  if (score >= 80) return "normal";
  if (score >= 65) return "caution";
  if (score >= 45) return "warning";
  if (score >= 25) return "critical";
  return "emergency";
}

export function evaluateDrawdownProtection(
  input: {
    currentBalance: number;
    peakBalance:    number;
    currentEquity:  number;
    peakEquity:     number;
    drawdownHistory: Array<{ dd: number; ts: string }>;
  },
  cfg: ProtectionConfig,
): DrawdownProtectionResult {
  const { currentBalance, peakBalance, currentEquity, peakEquity, drawdownHistory } = input;

  const balanceDd = peakBalance > 0
    ? Math.max(0, (peakBalance - currentBalance) / peakBalance * 100)
    : 0;
  const equityDd = peakEquity > 0
    ? Math.max(0, (peakEquity - currentEquity) / peakEquity * 100)
    : 0;
  const currentDrawdownPct = Math.max(balanceDd, equityDd);

  // Max drawdown from history
  const maxDrawdownPct = drawdownHistory.length > 0
    ? Math.max(currentDrawdownPct, ...drawdownHistory.map(h => h.dd))
    : currentDrawdownPct;

  const velocity     = computeVelocity(drawdownHistory);
  const recoveryRate = computeRecoveryRate(drawdownHistory);

  const healthScore = ddToHealthScore(currentDrawdownPct, cfg);
  const severity    = scoreToSeverity(healthScore);

  const evidence: string[] = [];
  const actions: ProtectionActionType[] = [];
  let thresholdCrossed = "none";

  evidence.push(`Current drawdown: ${currentDrawdownPct.toFixed(2)}% (balance DD: ${balanceDd.toFixed(2)}%, equity DD: ${equityDd.toFixed(2)}%)`);
  evidence.push(`Peak balance: ${peakBalance.toFixed(2)}, Current balance: ${currentBalance.toFixed(2)}`);
  evidence.push(`Max drawdown (history): ${maxDrawdownPct.toFixed(2)}%`);

  if (velocity > 0.1) {
    evidence.push(`Drawdown worsening at ${velocity.toFixed(3)}% per hour`);
  } else if (recoveryRate > 0.05) {
    evidence.push(`Recovering at ${recoveryRate.toFixed(3)}% per hour`);
  }

  if (currentDrawdownPct >= cfg.drawdownEmergencyPercent) {
    thresholdCrossed = `Emergency (${cfg.drawdownEmergencyPercent}%)`;
    evidence.push(`EMERGENCY: Drawdown ${currentDrawdownPct.toFixed(2)}% ≥ emergency threshold ${cfg.drawdownEmergencyPercent}%`);
    actions.push("block_all_entries");
    actions.push("generate_emergency_alert");
    actions.push("trading_halt");
  } else if (currentDrawdownPct >= cfg.drawdownCriticalPercent) {
    thresholdCrossed = `Critical (${cfg.drawdownCriticalPercent}%)`;
    evidence.push(`CRITICAL: Drawdown ${currentDrawdownPct.toFixed(2)}% ≥ critical threshold ${cfg.drawdownCriticalPercent}%`);
    actions.push("pause_new_trades");
    actions.push("generate_emergency_alert");
    actions.push("enter_observation_mode");
  } else if (currentDrawdownPct >= cfg.drawdownElevatedPercent) {
    thresholdCrossed = `Elevated (${cfg.drawdownElevatedPercent}%)`;
    evidence.push(`ELEVATED: Drawdown ${currentDrawdownPct.toFixed(2)}% ≥ elevated threshold ${cfg.drawdownElevatedPercent}%`);
    actions.push("reduce_position_size");
    actions.push("reduce_max_trades");
    actions.push("increase_confirmation_requirements");
  } else if (currentDrawdownPct >= cfg.drawdownWarningPercent) {
    thresholdCrossed = `Warning (${cfg.drawdownWarningPercent}%)`;
    evidence.push(`WARNING: Drawdown ${currentDrawdownPct.toFixed(2)}% ≥ warning threshold ${cfg.drawdownWarningPercent}%`);
    actions.push("reduce_position_size");
    actions.push("increase_confirmation_requirements");
  }

  // Velocity-based pre-emptive action
  if (velocity > 0.5 && currentDrawdownPct > 2) {
    evidence.push(`High drawdown velocity (${velocity.toFixed(2)}%/h) — pre-emptive size reduction`);
    actions.push("reduce_position_size");
  }

  return {
    severity,
    healthScore,
    currentDrawdownPct,
    maxDrawdownPct,
    drawdownVelocity: velocity,
    recoveryRate,
    thresholdCrossed,
    evidence,
    actions: [...new Set(actions)],
  };
}
