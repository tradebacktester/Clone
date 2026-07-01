// ─── Consecutive Loss Protection Monitor ─────────────────────────────────────
// Tracks consecutive losing trades and applies graduated protection.
// Advisory only. NEVER modifies strategy or executes trades.

import type {
  ConsecutiveLossResult,
  MonitorSeverity,
  ProtectionActionType,
  ProtectionConfig,
} from "./types.js";

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, isFinite(v) ? v : lo));
}

interface TradeRecord {
  pnl: number;
  closedAt: string;
  pair: string;
}

function countConsecutive(trades: TradeRecord[]): {
  losses: number; wins: number; avgLoss: number; recoveryProgress: number;
} {
  if (trades.length === 0) return { losses: 0, wins: 0, avgLoss: 0, recoveryProgress: 100 };

  // Sort by closedAt descending (most recent first)
  const sorted = [...trades].sort(
    (a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime(),
  );

  let consecutiveLosses = 0;
  let consecutiveWins   = 0;
  let totalLoss         = 0;
  let lossCount         = 0;

  // Count consecutive losses from the most recent trade
  for (const t of sorted) {
    if (t.pnl < 0) {
      consecutiveLosses++;
      totalLoss += Math.abs(t.pnl);
      lossCount++;
    } else {
      break;
    }
  }

  // If no consecutive losses, count consecutive wins
  if (consecutiveLosses === 0) {
    for (const t of sorted) {
      if (t.pnl >= 0) consecutiveWins++;
      else break;
    }
  }

  const avgLoss = lossCount > 0 ? totalLoss / lossCount : 0;

  // Recovery progress: 0 if at consecutive loss limit, 100 if no losses
  const recoveryProgress = consecutiveLosses === 0 ? 100 : clamp(consecutiveWins / 3 * 100);

  return { losses: consecutiveLosses, wins: consecutiveWins, avgLoss, recoveryProgress };
}

function scoreToSeverity(score: number): MonitorSeverity {
  if (score >= 80) return "normal";
  if (score >= 65) return "caution";
  if (score >= 45) return "warning";
  if (score >= 25) return "critical";
  return "emergency";
}

export function evaluateConsecutiveLoss(
  recentTrades: TradeRecord[],
  cfg: ProtectionConfig,
): ConsecutiveLossResult {
  const { losses, wins, avgLoss, recoveryProgress } = countConsecutive(recentTrades);

  // Health score: 100 - penalty based on consecutive losses
  let healthScore = 100;
  if (losses >= cfg.consecutiveLossEmergency) {
    healthScore = clamp(10 - (losses - cfg.consecutiveLossEmergency) * 5);
  } else if (losses >= cfg.consecutiveLossCritical) {
    healthScore = clamp(30 - (losses - cfg.consecutiveLossCritical) * 10);
  } else if (losses >= cfg.consecutiveLossWarning) {
    healthScore = clamp(55 - (losses - cfg.consecutiveLossWarning) * 12);
  } else if (losses >= cfg.consecutiveLossCaution) {
    healthScore = clamp(78 - (losses - cfg.consecutiveLossCaution) * 9);
  }

  const triggeredLimits: string[] = [];
  const evidence: string[] = [];
  const actions: ProtectionActionType[] = [];

  if (losses === 0) {
    evidence.push(wins > 0
      ? `${wins} consecutive winning trade${wins > 1 ? "s" : ""} — conditions favourable`
      : "No recent consecutive losses — conditions normal");
  } else {
    evidence.push(`${losses} consecutive losing trade${losses > 1 ? "s" : ""} detected`);
    evidence.push(`Average loss size: ${avgLoss.toFixed(2)}`);
  }

  // Caution threshold
  if (losses >= cfg.consecutiveLossCaution && losses < cfg.consecutiveLossWarning) {
    triggeredLimits.push(`Caution: ${losses} consecutive losses ≥ ${cfg.consecutiveLossCaution} limit`);
    evidence.push(`Reduce position size to limit further drawdown`);
    actions.push("reduce_position_size");
    actions.push("increase_confirmation_requirements");
  }

  // Warning threshold
  if (losses >= cfg.consecutiveLossWarning && losses < cfg.consecutiveLossCritical) {
    triggeredLimits.push(`Warning: ${losses} consecutive losses ≥ ${cfg.consecutiveLossWarning} limit`);
    evidence.push(`Entering observation mode — await market conditions to improve`);
    actions.push("reduce_position_size");
    actions.push("reduce_max_trades");
    actions.push("enter_observation_mode");
  }

  // Critical threshold
  if (losses >= cfg.consecutiveLossCritical && losses < cfg.consecutiveLossEmergency) {
    triggeredLimits.push(`Critical: ${losses} consecutive losses ≥ ${cfg.consecutiveLossCritical} limit`);
    evidence.push(`Strategy performance severely degraded — pause trading`);
    actions.push("pause_new_trades");
    actions.push("generate_emergency_alert");
  }

  // Emergency threshold
  if (losses >= cfg.consecutiveLossEmergency) {
    triggeredLimits.push(`Emergency: ${losses} consecutive losses ≥ ${cfg.consecutiveLossEmergency} limit`);
    evidence.push(`Catastrophic consecutive loss streak — halt all entries immediately`);
    actions.push("block_all_entries");
    actions.push("generate_emergency_alert");
  }

  return {
    severity: scoreToSeverity(healthScore),
    healthScore,
    consecutiveLosses: losses,
    consecutiveWins:   wins,
    avgLossSize:       avgLoss,
    recoveryProgress,
    triggeredLimits,
    evidence,
    actions: [...new Set(actions)],
  };
}
