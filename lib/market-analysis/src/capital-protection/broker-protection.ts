// ─── Broker Protection Monitor ────────────────────────────────────────────────
// Monitors spread, slippage, execution quality, connection health.
// Automatically suspends entries if broker quality falls below limits.
// Advisory only. NEVER modifies strategy or executes trades.

import type {
  BrokerProtectionResult,
  MonitorSeverity,
  ProtectionActionType,
  ProtectionConfig,
} from "./types.js";

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, isFinite(v) ? v : lo));
}

function spreadScore(spread: number, baseline: number, maxSpread: number): number {
  if (baseline <= 0) return 50;
  const ratio = spread / baseline;
  if (ratio <= 1.0) return 100;
  if (spread <= maxSpread) {
    return clamp(100 - ((spread - baseline) / (maxSpread - baseline)) * 40);
  }
  return clamp(60 - ((spread - maxSpread) / maxSpread) * 55);
}

function slippageScore(slippage: number, maxSlippage: number): number {
  if (slippage <= 0) return 100;
  if (slippage <= maxSlippage * 0.5) return 95;
  if (slippage <= maxSlippage) {
    return clamp(95 - ((slippage - maxSlippage * 0.5) / (maxSlippage * 0.5)) * 35);
  }
  return clamp(60 - ((slippage - maxSlippage) / maxSlippage) * 55);
}

function executionScore(execMs: number, maxMs: number): number {
  if (execMs <= maxMs * 0.4) return 100;
  if (execMs <= maxMs) {
    return clamp(100 - ((execMs - maxMs * 0.4) / (maxMs * 0.6)) * 30);
  }
  return clamp(70 - ((execMs - maxMs) / maxMs) * 65);
}

function rejectionScore(rejections: number, total: number, maxRatePct: number): number {
  if (total === 0) return 100;
  const ratePct = (rejections / total) * 100;
  if (ratePct <= 0) return 100;
  if (ratePct <= maxRatePct * 0.5) return 90;
  if (ratePct <= maxRatePct) return clamp(90 - ((ratePct - maxRatePct * 0.5) / (maxRatePct * 0.5)) * 40);
  return clamp(50 - ((ratePct - maxRatePct) / maxRatePct) * 45);
}

function connectionScore(quality: number, minQuality: number): number {
  if (quality >= minQuality) return clamp(100 - ((100 - quality) / (100 - minQuality)) * 20);
  return clamp(80 - ((minQuality - quality) / minQuality) * 75);
}

function scoreToSeverity(score: number): MonitorSeverity {
  if (score >= 80) return "normal";
  if (score >= 65) return "caution";
  if (score >= 45) return "warning";
  if (score >= 25) return "critical";
  return "emergency";
}

export function evaluateBrokerProtection(
  input: {
    spread:           number;
    spreadBaseline:   number;
    slippage:         number;
    executionTime:    number;
    orderRejections:  number;
    totalOrders:      number;
    connectionQuality: number;
    pair:             string;
  },
  cfg: ProtectionConfig,
): BrokerProtectionResult {
  const {
    spread, spreadBaseline, slippage, executionTime,
    orderRejections, totalOrders, connectionQuality,
  } = input;

  const baseline     = spreadBaseline || 1.0;
  const spreadRatio  = baseline > 0 ? spread / baseline : 1;
  const rejRatePct   = totalOrders > 0 ? (orderRejections / totalOrders) * 100 : 0;

  const spScore  = spreadScore(spread, baseline, cfg.maxSpreadPips);
  const slpScore = slippageScore(slippage, cfg.maxSlippagePips);
  const execScore = executionScore(executionTime, cfg.maxExecutionMs);
  const rejScore = rejectionScore(orderRejections, totalOrders, cfg.maxRejectionRatePct);
  const connScore = connectionScore(connectionQuality, cfg.minConnectionQuality);

  // Weighted health
  const healthScore = clamp(
    spScore   * 0.30 +
    slpScore  * 0.20 +
    execScore * 0.20 +
    rejScore  * 0.15 +
    connScore * 0.15,
  );

  const triggeredChecks: string[] = [];
  const evidence: string[] = [];
  const actions: ProtectionActionType[] = [];

  evidence.push(`Spread: ${spread.toFixed(1)} pips (baseline ${baseline.toFixed(1)}, ratio ${spreadRatio.toFixed(1)}×, max ${cfg.maxSpreadPips} pips)`);
  evidence.push(`Slippage: ${slippage.toFixed(2)} pips (max ${cfg.maxSlippagePips} pips)`);
  evidence.push(`Execution: ${executionTime.toFixed(0)}ms (max ${cfg.maxExecutionMs}ms)`);
  evidence.push(`Rejections: ${orderRejections}/${totalOrders} (${rejRatePct.toFixed(1)}%, max ${cfg.maxRejectionRatePct}%)`);
  evidence.push(`Connection quality: ${connectionQuality.toFixed(1)}% (min ${cfg.minConnectionQuality}%)`);

  // Connection failure → strongest trigger
  if (connectionQuality < cfg.minConnectionQuality * 0.7) {
    triggeredChecks.push(`Critical connection loss: ${connectionQuality.toFixed(1)}%`);
    actions.push("suspend_broker_entries");
    actions.push("generate_emergency_alert");
  } else if (connectionQuality < cfg.minConnectionQuality) {
    triggeredChecks.push(`Connection degraded: ${connectionQuality.toFixed(1)}% < ${cfg.minConnectionQuality}%`);
    actions.push("suspend_broker_entries");
  }

  // Spread checks
  if (spread >= cfg.maxSpreadPips * 2) {
    triggeredChecks.push(`Extreme spread: ${spread.toFixed(1)} pips (${spreadRatio.toFixed(1)}× baseline, 2× limit)`);
    actions.push("suspend_broker_entries");
    actions.push("generate_emergency_alert");
  } else if (spread >= cfg.maxSpreadPips) {
    triggeredChecks.push(`Spread exceeds limit: ${spread.toFixed(1)} ≥ ${cfg.maxSpreadPips} pips`);
    actions.push("suspend_broker_entries");
  } else if (spread >= cfg.maxSpreadPips * 0.75) {
    evidence.push(`Spread approaching limit: ${spread.toFixed(1)} pips`);
    actions.push("increase_confirmation_requirements");
  }

  // Slippage checks
  if (slippage >= cfg.maxSlippagePips * 2) {
    triggeredChecks.push(`Extreme slippage: ${slippage.toFixed(2)} pips`);
    actions.push("suspend_broker_entries");
  } else if (slippage >= cfg.maxSlippagePips) {
    triggeredChecks.push(`Slippage limit: ${slippage.toFixed(2)} ≥ ${cfg.maxSlippagePips} pips`);
    actions.push("increase_confirmation_requirements");
  }

  // Execution time
  if (executionTime >= cfg.maxExecutionMs * 2) {
    triggeredChecks.push(`Extreme execution delay: ${executionTime.toFixed(0)}ms`);
    actions.push("suspend_broker_entries");
  } else if (executionTime >= cfg.maxExecutionMs) {
    triggeredChecks.push(`Execution delay: ${executionTime.toFixed(0)}ms ≥ ${cfg.maxExecutionMs}ms limit`);
    actions.push("increase_confirmation_requirements");
  }

  // Rejection rate
  if (rejRatePct >= cfg.maxRejectionRatePct * 2) {
    triggeredChecks.push(`Critical rejection rate: ${rejRatePct.toFixed(1)}%`);
    actions.push("suspend_broker_entries");
  } else if (rejRatePct >= cfg.maxRejectionRatePct) {
    triggeredChecks.push(`Rejection rate: ${rejRatePct.toFixed(1)}% ≥ ${cfg.maxRejectionRatePct}% limit`);
    actions.push("increase_confirmation_requirements");
  }

  return {
    severity: scoreToSeverity(healthScore),
    healthScore,
    spreadRatio,
    slippagePips: slippage,
    executionMs:  executionTime,
    rejectionRatePct: rejRatePct,
    connectionQuality,
    triggeredChecks,
    evidence,
    actions: [...new Set(actions)],
  };
}
