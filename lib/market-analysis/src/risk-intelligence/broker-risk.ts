// ─── Risk Intelligence — Broker Risk Evaluator ────────────────────────────────
// Monitors spread, slippage, execution, rejections, connectivity.
// Advisory only. NEVER modifies broker settings.

import { randomUUID } from "crypto";
import type { BrokerMetrics, BrokerRiskResult, RiskAlert } from "./types.js";
import { scoreToRiskClassification } from "./scorer.js";

// ─── Thresholds ───────────────────────────────────────────────────────────────

const SPREAD_MULTIPLIER_WARN     = 2.0;  // >2× baseline spread = warning
const SPREAD_MULTIPLIER_CRIT     = 4.0;  // >4× baseline spread = critical
const SLIPPAGE_WARN_PIPS         = 1.5;  // >1.5 pips avg slippage = warning
const SLIPPAGE_CRIT_PIPS         = 3.0;
const EXEC_TIME_WARN_MS          = 500;
const EXEC_TIME_CRIT_MS          = 1500;
const REJECTION_RATE_WARN        = 0.05; // >5% rejections = warning
const REJECTION_RATE_CRIT        = 0.15;
const LATENCY_WARN_MS            = 200;
const LATENCY_CRIT_MS            = 800;
const CONNECTION_WARN            = 90;   // <90% uptime = warning
const CONNECTION_CRIT            = 75;

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, isFinite(v) ? v : 50));
}

// ─── Sub-scorers (output = reliability, 0=broken, 100=perfect) ───────────────

function spreadScore(spread: number, baseline: number): number {
  if (baseline <= 0) return 50;
  const ratio = spread / baseline;
  if (ratio <= 1.0)                       return 100;
  if (ratio <= SPREAD_MULTIPLIER_WARN)    return clamp(100 - ((ratio - 1) / (SPREAD_MULTIPLIER_WARN - 1)) * 30);
  if (ratio <= SPREAD_MULTIPLIER_CRIT)    return clamp(70 - ((ratio - SPREAD_MULTIPLIER_WARN) / (SPREAD_MULTIPLIER_CRIT - SPREAD_MULTIPLIER_WARN)) * 60);
  return 10;
}

function slippageScore(slippage: number): number {
  if (slippage <= 0)                return 100;
  if (slippage <= 0.3)              return 95;
  if (slippage <= SLIPPAGE_WARN_PIPS) return clamp(95 - (slippage / SLIPPAGE_WARN_PIPS) * 35);
  if (slippage <= SLIPPAGE_CRIT_PIPS) return clamp(60 - ((slippage - SLIPPAGE_WARN_PIPS) / (SLIPPAGE_CRIT_PIPS - SLIPPAGE_WARN_PIPS)) * 50);
  return 10;
}

function executionScore(execMs: number): number {
  if (execMs <= 100)               return 100;
  if (execMs <= EXEC_TIME_WARN_MS) return clamp(100 - ((execMs - 100) / (EXEC_TIME_WARN_MS - 100)) * 30);
  if (execMs <= EXEC_TIME_CRIT_MS) return clamp(70 - ((execMs - EXEC_TIME_WARN_MS) / (EXEC_TIME_CRIT_MS - EXEC_TIME_WARN_MS)) * 60);
  return 10;
}

function rejectionScore(rejections: number, total: number): number {
  if (total <= 0) return 90;
  const rate = rejections / total;
  if (rate <= 0.01)                        return 100;
  if (rate <= REJECTION_RATE_WARN)         return clamp(100 - (rate / REJECTION_RATE_WARN) * 30);
  if (rate <= REJECTION_RATE_CRIT)         return clamp(70 - ((rate - REJECTION_RATE_WARN) / (REJECTION_RATE_CRIT - REJECTION_RATE_WARN)) * 60);
  return 10;
}

function connectionScore(quality: number): number {
  if (quality >= 99) return 100;
  if (quality >= CONNECTION_WARN) return clamp(100 - ((99 - quality) / (99 - CONNECTION_WARN)) * 30);
  if (quality >= CONNECTION_CRIT) return clamp(70 - ((CONNECTION_WARN - quality) / (CONNECTION_WARN - CONNECTION_CRIT)) * 60);
  return 10;
}

function feedScore(consistency: number): number {
  return clamp(consistency);
}

function latencyScore(latencyMs: number): number {
  if (latencyMs <= 50)              return 100;
  if (latencyMs <= LATENCY_WARN_MS) return clamp(100 - ((latencyMs - 50) / (LATENCY_WARN_MS - 50)) * 30);
  if (latencyMs <= LATENCY_CRIT_MS) return clamp(70 - ((latencyMs - LATENCY_WARN_MS) / (LATENCY_CRIT_MS - LATENCY_WARN_MS)) * 60);
  return 10;
}

// ─── Alert builder ────────────────────────────────────────────────────────────

function buildBrokerAlerts(m: BrokerMetrics, scores: BrokerRiskResult["metrics"]): RiskAlert[] {
  const alerts: RiskAlert[] = [];
  const baseline = m.spreadBaseline;

  if (baseline > 0 && m.spread / baseline >= SPREAD_MULTIPLIER_CRIT) {
    alerts.push({
      alertId: randomUUID(), category: "broker", severity: "critical",
      title: "Extreme Spread Widening",
      message: `Spread ${m.spread.toFixed(1)} pips is ${(m.spread / baseline).toFixed(1)}× the ${baseline.toFixed(1)} pip baseline`,
      evidence: [`Current spread: ${m.spread.toFixed(1)} pips`, `Baseline: ${baseline.toFixed(1)} pips`, `Multiplier: ${(m.spread / baseline).toFixed(1)}×`],
      metrics: { spread: m.spread, baseline, ratio: m.spread / baseline },
    });
  } else if (baseline > 0 && m.spread / baseline >= SPREAD_MULTIPLIER_WARN) {
    alerts.push({
      alertId: randomUUID(), category: "broker", severity: "warning",
      title: "Elevated Spread",
      message: `Spread ${m.spread.toFixed(1)} pips is ${(m.spread / baseline).toFixed(1)}× the baseline`,
      evidence: [`Current spread: ${m.spread.toFixed(1)} pips`, `Baseline: ${baseline.toFixed(1)} pips`],
      metrics: { spread: m.spread, baseline },
    });
  }

  if (m.slippage >= SLIPPAGE_CRIT_PIPS) {
    alerts.push({
      alertId: randomUUID(), category: "broker", severity: "critical",
      title: "Critical Slippage",
      message: `Average slippage at ${m.slippage.toFixed(2)} pips — execution quality severely degraded`,
      evidence: [`Slippage: ${m.slippage.toFixed(2)} pips`, `Critical threshold: ${SLIPPAGE_CRIT_PIPS} pips`],
      metrics: { slippage: m.slippage, threshold: SLIPPAGE_CRIT_PIPS },
    });
  } else if (m.slippage >= SLIPPAGE_WARN_PIPS) {
    alerts.push({
      alertId: randomUUID(), category: "broker", severity: "warning",
      title: "Elevated Slippage",
      message: `Average slippage ${m.slippage.toFixed(2)} pips — monitor execution quality`,
      evidence: [`Slippage: ${m.slippage.toFixed(2)} pips`, `Warning threshold: ${SLIPPAGE_WARN_PIPS} pips`],
      metrics: { slippage: m.slippage },
    });
  }

  if (m.totalOrders > 0 && m.orderRejections / m.totalOrders >= REJECTION_RATE_WARN) {
    const rate = (m.orderRejections / m.totalOrders * 100).toFixed(1);
    alerts.push({
      alertId: randomUUID(), category: "broker", severity: "warning",
      title: "High Order Rejection Rate",
      message: `${rate}% of orders rejected (${m.orderRejections}/${m.totalOrders}) in last 24h`,
      evidence: [`Rejection rate: ${rate}%`, `Rejections: ${m.orderRejections}/${m.totalOrders}`, `Threshold: ${REJECTION_RATE_WARN * 100}%`],
      metrics: { rejectionRate: m.orderRejections / m.totalOrders, rejections: m.orderRejections },
    });
  }

  if (m.latency >= LATENCY_CRIT_MS) {
    alerts.push({
      alertId: randomUUID(), category: "broker", severity: "critical",
      title: "Critical Network Latency",
      message: `Broker latency at ${m.latency.toFixed(0)}ms — execution severely impaired`,
      evidence: [`Latency: ${m.latency.toFixed(0)}ms`, `Critical threshold: ${LATENCY_CRIT_MS}ms`],
      metrics: { latency: m.latency, threshold: LATENCY_CRIT_MS },
    });
  }

  return alerts;
}

// ─── Main evaluator ───────────────────────────────────────────────────────────

export function evaluateBrokerRisk(m: BrokerMetrics): BrokerRiskResult {
  const sScore = spreadScore(m.spread, m.spreadBaseline ?? 1.0);
  const slipS  = slippageScore(m.slippage);
  const execS  = executionScore(m.executionTime);
  const rejS   = rejectionScore(m.orderRejections, m.totalOrders);
  const connS  = connectionScore(m.connectionQuality);
  const feedS  = feedScore(m.priceFeedConsistency);
  const latS   = latencyScore(m.latency);

  const metrics = {
    spreadScore:    sScore,
    slippageScore:  slipS,
    executionScore: execS,
    rejectionScore: rejS,
    connectScore:   connS,
    feedScore:      feedS,
    latencyScore:   latS,
  };

  const brokerReliabilityScore = clamp(
    sScore * 0.20 +
    slipS  * 0.20 +
    execS  * 0.15 +
    rejS   * 0.15 +
    connS  * 0.15 +
    feedS  * 0.10 +
    latS   * 0.05,
  );

  // Broker risk = 100 - reliability
  const brokerRiskScore = clamp(100 - brokerReliabilityScore);
  const riskClassification = scoreToRiskClassification(brokerRiskScore);

  const rejRate = m.totalOrders > 0 ? (m.orderRejections / m.totalOrders * 100).toFixed(1) : "N/A";
  const baseline = m.spreadBaseline ?? 1.0;

  const evidence: string[] = [
    `Pair: ${m.pair}`,
    `Spread: ${m.spread.toFixed(1)} pips (baseline ${baseline.toFixed(1)} pips, ratio ${baseline > 0 ? (m.spread / baseline).toFixed(1) : "N/A"}×)`,
    `Slippage: ${m.slippage.toFixed(2)} pips (target <${SLIPPAGE_WARN_PIPS} pips)`,
    `Execution time: ${m.executionTime.toFixed(0)}ms (target <${EXEC_TIME_WARN_MS}ms)`,
    `Order rejections: ${m.orderRejections}/${m.totalOrders} (${rejRate}%) in 24h`,
    `Connection quality: ${m.connectionQuality.toFixed(1)}% uptime`,
    `Price feed consistency: ${m.priceFeedConsistency.toFixed(1)}/100`,
    `Network latency: ${m.latency.toFixed(0)}ms`,
    `Broker reliability score: ${brokerReliabilityScore.toFixed(1)}/100`,
  ];

  const alerts = buildBrokerAlerts(m, metrics);

  return { brokerReliabilityScore, riskClassification, metrics, evidence, alerts };
}
