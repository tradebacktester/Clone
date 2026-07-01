// ─── Account Protection Monitor ───────────────────────────────────────────────
// Monitors daily/weekly/monthly loss limits and equity drawdown.
// Advisory only. NEVER modifies strategy or executes trades.

import { randomUUID } from "crypto";
import type {
  AccountProtectionResult,
  MonitorSeverity,
  ProtectionActionType,
  ProtectionConfig,
} from "./types.js";

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, isFinite(v) ? v : lo));
}

function pctLoss(pnl: number, balance: number): number {
  if (balance <= 0) return 0;
  return Math.max(0, -pnl / balance * 100);
}

// Score (0-100 health) from loss percentage vs limit
function lossScore(lossPct: number, limit: number): number {
  if (limit <= 0) return 100;
  const ratio = lossPct / limit;
  if (ratio <= 0)    return 100;
  if (ratio <= 0.5)  return clamp(100 - ratio * 20);
  if (ratio <= 0.75) return clamp(90 - (ratio - 0.5) * 120);
  if (ratio <= 1.0)  return clamp(60 - (ratio - 0.75) * 200);
  // Over limit
  return clamp(10 - (ratio - 1.0) * 30);
}

function scoreToSeverity(score: number): MonitorSeverity {
  if (score >= 80) return "normal";
  if (score >= 65) return "caution";
  if (score >= 45) return "warning";
  if (score >= 25) return "critical";
  return "emergency";
}

export function evaluateAccountProtection(
  input: {
    balance:    number;
    equity:     number;
    peakEquity: number;
    dailyPnl:   number;
    weeklyPnl:  number;
    monthlyPnl: number;
  },
  cfg: ProtectionConfig,
): AccountProtectionResult {
  const { balance, equity, peakEquity, dailyPnl, weeklyPnl, monthlyPnl } = input;

  const dailyLossPct    = pctLoss(dailyPnl,   balance);
  const weeklyLossPct   = pctLoss(weeklyPnl,  balance);
  const monthlyLossPct  = pctLoss(monthlyPnl, balance);
  const equityDrawdownPct = peakEquity > 0
    ? Math.max(0, (peakEquity - equity) / peakEquity * 100)
    : 0;

  const scores = [
    lossScore(dailyLossPct,   cfg.maxDailyLossPercent),
    lossScore(weeklyLossPct,  cfg.maxWeeklyLossPercent),
    lossScore(monthlyLossPct, cfg.maxMonthlyLossPercent),
    lossScore(equityDrawdownPct, cfg.drawdownCriticalPercent),
  ];
  const healthScore = clamp(Math.min(...scores));

  const triggeredLimits: string[] = [];
  const evidence: string[] = [];
  const actions: ProtectionActionType[] = [];

  // Daily loss checks
  if (dailyLossPct >= cfg.maxDailyLossPercent) {
    triggeredLimits.push(`Daily loss limit hit (${dailyLossPct.toFixed(2)}% ≥ ${cfg.maxDailyLossPercent}%)`);
    evidence.push(`Daily P&L: -${dailyLossPct.toFixed(2)}% of balance`);
    actions.push("pause_new_trades");
    actions.push("generate_emergency_alert");
  } else if (dailyLossPct >= cfg.maxDailyLossPercent * 0.75) {
    evidence.push(`Daily loss approaching limit: ${dailyLossPct.toFixed(2)}% of ${cfg.maxDailyLossPercent}% max`);
    actions.push("reduce_position_size");
  } else if (dailyLossPct > 0) {
    evidence.push(`Daily loss: ${dailyLossPct.toFixed(2)}% (limit ${cfg.maxDailyLossPercent}%)`);
  } else {
    evidence.push(`Daily P&L: +${Math.abs(dailyPnl).toFixed(2)} (healthy)`);
  }

  // Weekly loss checks
  if (weeklyLossPct >= cfg.maxWeeklyLossPercent) {
    triggeredLimits.push(`Weekly loss limit hit (${weeklyLossPct.toFixed(2)}% ≥ ${cfg.maxWeeklyLossPercent}%)`);
    actions.push("pause_new_trades");
  } else if (weeklyLossPct >= cfg.maxWeeklyLossPercent * 0.75) {
    evidence.push(`Weekly loss approaching limit: ${weeklyLossPct.toFixed(2)}% of ${cfg.maxWeeklyLossPercent}% max`);
    actions.push("reduce_max_trades");
  } else if (weeklyLossPct > 0) {
    evidence.push(`Weekly loss: ${weeklyLossPct.toFixed(2)}% (limit ${cfg.maxWeeklyLossPercent}%)`);
  }

  // Monthly loss checks
  if (monthlyLossPct >= cfg.maxMonthlyLossPercent) {
    triggeredLimits.push(`Monthly loss limit hit (${monthlyLossPct.toFixed(2)}% ≥ ${cfg.maxMonthlyLossPercent}%)`);
    actions.push("block_all_entries");
  } else if (monthlyLossPct >= cfg.maxMonthlyLossPercent * 0.8) {
    evidence.push(`Monthly loss approaching limit: ${monthlyLossPct.toFixed(2)}% of ${cfg.maxMonthlyLossPercent}% max`);
    actions.push("reduce_position_size");
    actions.push("increase_confirmation_requirements");
  } else if (monthlyLossPct > 0) {
    evidence.push(`Monthly loss: ${monthlyLossPct.toFixed(2)}% (limit ${cfg.maxMonthlyLossPercent}%)`);
  }

  // Equity drawdown
  if (equityDrawdownPct >= cfg.drawdownEmergencyPercent) {
    triggeredLimits.push(`Emergency equity drawdown (${equityDrawdownPct.toFixed(2)}% ≥ ${cfg.drawdownEmergencyPercent}%)`);
    actions.push("block_all_entries");
    actions.push("generate_emergency_alert");
  } else if (equityDrawdownPct >= cfg.drawdownCriticalPercent) {
    triggeredLimits.push(`Critical equity drawdown (${equityDrawdownPct.toFixed(2)}%)`);
    actions.push("pause_new_trades");
  } else if (equityDrawdownPct > 0) {
    evidence.push(`Equity drawdown: ${equityDrawdownPct.toFixed(2)}% from peak`);
  }

  evidence.push(`Balance: ${balance.toFixed(2)}, Equity: ${equity.toFixed(2)}, Peak equity: ${peakEquity.toFixed(2)}`);

  const severity = scoreToSeverity(healthScore);
  // Deduplicate actions
  const uniqueActions = [...new Set(actions)];

  return {
    severity,
    healthScore,
    dailyLossPct,
    weeklyLossPct,
    monthlyLossPct,
    equityDrawdownPct,
    triggeredLimits,
    evidence,
    actions: uniqueActions,
  };
}
