// ─── Broker Crisis Detector ───────────────────────────────────────────────────

import {
  BrokerContext,
  BrokerCrisisSignal,
  THRESHOLDS,
  scoreToCrisisSeverity,
} from "./types.js";

export function detectBrokerCrisis(ctx: BrokerContext): BrokerCrisisSignal {
  const evidence: string[] = [];

  const orderRejections = ctx.recentRejections >= THRESHOLDS.REJECTION_HIGH;
  if (orderRejections)
    evidence.push(`Order rejections: ${ctx.recentRejections} in the last hour`);

  const delayedExecution = ctx.avgExecutionMs >= THRESHOLDS.EXECUTION_SLOW_MS;
  if (delayedExecution)
    evidence.push(`Delayed execution: avg ${ctx.avgExecutionMs}ms (threshold ${THRESHOLDS.EXECUTION_SLOW_MS}ms)`);

  const highSlippage = ctx.slippagePips >= THRESHOLDS.SLIPPAGE_HIGH_PIPS;
  if (highSlippage)
    evidence.push(`High slippage: ${ctx.slippagePips} pips (threshold ${THRESHOLDS.SLIPPAGE_HIGH_PIPS})`);

  const connectionLoss = !ctx.isConnected;
  if (connectionLoss)
    evidence.push("Broker connection lost");

  const apiFailures = ctx.apiErrorRate >= THRESHOLDS.API_ERROR_RATE_HIGH;
  if (apiFailures)
    evidence.push(`API error rate: ${(ctx.apiErrorRate * 100).toFixed(1)}% (threshold ${THRESHOLDS.API_ERROR_RATE_HIGH * 100}%)`);

  const incorrectOrderResponse = ctx.recentRejections >= THRESHOLDS.REJECTION_CRITICAL;
  if (incorrectOrderResponse)
    evidence.push(`Critical order rejection rate: ${ctx.recentRejections} (critical threshold ${THRESHOLDS.REJECTION_CRITICAL})`);

  const priceFeedInconsistency =
    ctx.avgExecutionMs >= THRESHOLDS.EXECUTION_SLOW_MS &&
    ctx.apiErrorRate >= THRESHOLDS.API_ERROR_RATE_HIGH;
  if (priceFeedInconsistency)
    evidence.push("Price feed inconsistency: slow execution with high API error rate");

  const serverDowntime =
    ctx.lastHeartbeatSecondsAgo >= THRESHOLDS.HEARTBEAT_DEAD_SECONDS || !ctx.isConnected;
  if (serverDowntime)
    evidence.push(`Server downtime detected: last heartbeat ${ctx.lastHeartbeatSecondsAgo}s ago`);

  let score = 0;
  if (connectionLoss)           score += 50;
  if (serverDowntime)           score += 40;
  if (incorrectOrderResponse)   score += 30;
  if (apiFailures)              score += 20;
  if (highSlippage)             score += 20;
  if (delayedExecution)         score += 15;
  if (orderRejections)          score += 15;
  if (priceFeedInconsistency)   score += 10;

  // Continuous contributions
  score += Math.max(0, ctx.recentRejections - THRESHOLDS.REJECTION_HIGH) * 3;
  score += Math.max(0, ctx.avgExecutionMs - THRESHOLDS.EXECUTION_SLOW_MS) / 100;
  score += Math.max(0, ctx.slippagePips - THRESHOLDS.SLIPPAGE_HIGH_PIPS) * 5;
  score += Math.max(0, ctx.lastHeartbeatSecondsAgo - THRESHOLDS.HEARTBEAT_STALE_SECONDS) * 0.1;

  const crisisScore      = Math.min(100, Math.round(score));
  const reliabilityScore = Math.max(0, 100 - crisisScore);
  const executionQuality = connectionLoss ? 0 :
    Math.max(0, 100 - (ctx.avgExecutionMs / 50) - (ctx.slippagePips * 5) - (ctx.apiErrorRate * 100));

  return {
    orderRejections,
    delayedExecution,
    highSlippage,
    connectionLoss,
    apiFailures,
    incorrectOrderResponse,
    priceFeedInconsistency,
    serverDowntime,
    crisisScore,
    severity:        scoreToCrisisSeverity(crisisScore),
    evidence,
    reliabilityScore,
    executionQuality: Math.min(100, Math.round(executionQuality)),
  };
}
