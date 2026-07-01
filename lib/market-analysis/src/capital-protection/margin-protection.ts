// ─── Margin Protection Monitor ────────────────────────────────────────────────
// Monitors margin level, free margin, margin call risk, leverage utilization.
// Advisory only. NEVER modifies strategy or executes trades.

import type {
  MarginProtectionResult,
  MonitorSeverity,
  ProtectionActionType,
  ProtectionConfig,
} from "./types.js";

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, isFinite(v) ? v : lo));
}

// Margin level score: lower margin level = higher risk
// marginLevel: 100%+ = fine, 200% = warning, 150% = critical
function marginLevelScore(level: number, cfg: ProtectionConfig): number {
  if (level >= cfg.marginWarningLevel)  return 100;
  if (level >= cfg.marginCriticalLevel) {
    const ratio = (level - cfg.marginCriticalLevel) / (cfg.marginWarningLevel - cfg.marginCriticalLevel);
    return clamp(40 + ratio * 60);
  }
  if (level >= cfg.marginEmergencyLevel) {
    const ratio = (level - cfg.marginEmergencyLevel) / (cfg.marginCriticalLevel - cfg.marginEmergencyLevel);
    return clamp(10 + ratio * 30);
  }
  // Below emergency
  return clamp(5 - (cfg.marginEmergencyLevel - level) * 0.2);
}

function leverageScore(leverage: number, maxLeverage: number): number {
  if (maxLeverage <= 0 || leverage <= 0) return 100;
  const utilization = leverage / maxLeverage;
  if (utilization <= 0.5)  return 100;
  if (utilization <= 0.75) return clamp(100 - (utilization - 0.5) * 120);
  if (utilization <= 1.0)  return clamp(70 - (utilization - 0.75) * 200);
  return clamp(20 - (utilization - 1.0) * 30);
}

function marginCallRiskScore(marginLevel: number, emergencyLevel: number): number {
  // 100 = imminent margin call, 0 = no risk
  if (marginLevel <= emergencyLevel)  return 100;
  if (marginLevel <= emergencyLevel * 1.5) {
    return clamp(80 - ((marginLevel - emergencyLevel) / (emergencyLevel * 0.5)) * 80);
  }
  if (marginLevel <= emergencyLevel * 2)  return clamp(30);
  return clamp(Math.max(0, 30 - (marginLevel - emergencyLevel * 2) / 10));
}

function scoreToSeverity(score: number): MonitorSeverity {
  if (score >= 80) return "normal";
  if (score >= 65) return "caution";
  if (score >= 45) return "warning";
  if (score >= 25) return "critical";
  return "emergency";
}

export function evaluateMarginProtection(
  input: {
    balance:    number;
    equity:     number;
    usedMargin: number;
    freeMargin: number;
    marginLevel: number;  // %
    leverage:   number;
  },
  cfg: ProtectionConfig,
): MarginProtectionResult {
  const { equity, usedMargin, freeMargin, marginLevel, leverage } = input;

  const freeMarginPct      = equity > 0 ? clamp(freeMargin / equity * 100) : 0;
  const leverageUtilization = clamp(leverage / cfg.maxLeverage * 100);

  // When no margin is used, there is zero margin risk — treat as fully healthy
  const noMarginUsed = usedMargin <= 0 && marginLevel <= 0;

  const marginCallRisk = noMarginUsed
    ? 0
    : marginCallRiskScore(marginLevel, cfg.marginEmergencyLevel);

  const mlScore  = noMarginUsed ? 100 : marginLevelScore(marginLevel, cfg);
  const levScore = leverageScore(leverage, cfg.maxLeverage);
  const fmScore  = noMarginUsed ? 100 : clamp(freeMarginPct);
  const healthScore = noMarginUsed
    ? 100
    : clamp(Math.min(mlScore, levScore, fmScore * 0.3 + mlScore * 0.7));

  const evidence: string[] = [];
  const actions: ProtectionActionType[] = [];

  evidence.push(`Margin level: ${marginLevel.toFixed(1)}% (warning ≥${cfg.marginWarningLevel}%, critical ≥${cfg.marginCriticalLevel}%, emergency ≥${cfg.marginEmergencyLevel}%)`);
  evidence.push(`Free margin: ${freeMargin.toFixed(2)} (${freeMarginPct.toFixed(1)}% of equity ${equity.toFixed(2)})`);
  evidence.push(`Used margin: ${usedMargin.toFixed(2)} | Leverage utilization: ${leverageUtilization.toFixed(1)}% of ${cfg.maxLeverage}x max`);
  evidence.push(`Margin call risk: ${marginCallRisk.toFixed(0)}/100`);

  if (marginLevel > 0 && marginLevel <= cfg.marginEmergencyLevel) {
    evidence.push(`EMERGENCY: Margin level ${marginLevel.toFixed(1)}% ≤ emergency threshold ${cfg.marginEmergencyLevel}%`);
    actions.push("block_all_entries");
    actions.push("generate_emergency_alert");
  } else if (marginLevel > 0 && marginLevel <= cfg.marginCriticalLevel) {
    evidence.push(`CRITICAL: Margin level ${marginLevel.toFixed(1)}% ≤ critical threshold ${cfg.marginCriticalLevel}%`);
    actions.push("pause_new_trades");
    actions.push("generate_emergency_alert");
  } else if (marginLevel > 0 && marginLevel <= cfg.marginWarningLevel) {
    evidence.push(`WARNING: Margin level ${marginLevel.toFixed(1)}% ≤ warning threshold ${cfg.marginWarningLevel}%`);
    actions.push("reduce_position_size");
    actions.push("increase_confirmation_requirements");
  }

  if (leverage > cfg.maxLeverage) {
    evidence.push(`Leverage ${leverage.toFixed(1)}x exceeds max ${cfg.maxLeverage}x`);
    actions.push("reduce_position_size");
  } else if (leverage > cfg.maxLeverage * 0.8) {
    evidence.push(`Leverage approaching limit: ${leverage.toFixed(1)}x of ${cfg.maxLeverage}x max`);
    actions.push("reduce_max_trades");
  }

  if (freeMarginPct < 10) {
    evidence.push(`Very low free margin: ${freeMarginPct.toFixed(1)}% of equity`);
    actions.push("pause_new_trades");
  } else if (freeMarginPct < 20) {
    evidence.push(`Low free margin: ${freeMarginPct.toFixed(1)}% of equity`);
    actions.push("reduce_position_size");
  }

  return {
    severity: scoreToSeverity(healthScore),
    healthScore,
    marginLevel,
    freeMarginPct,
    marginCallRisk,
    leverageUtilization,
    evidence,
    actions: [...new Set(actions)],
  };
}
