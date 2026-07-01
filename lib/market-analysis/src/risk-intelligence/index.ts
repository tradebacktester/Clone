// ─── Risk Intelligence Core Engine — Main ────────────────────────────────────
// Produces the Unified Risk Intelligence Object continuously.
// Advisory only. NEVER modifies positions, strategy, or risk limits.

import { randomUUID } from "crypto";
import type {
  RunRiInput,
  UnifiedRiskIntelligenceObject,
  AccountState,
  PortfolioInput,
  MarketRiskInput,
  BrokerMetrics,
  SystemMetrics,
  PositionInput,
  RiScoreWeights,
} from "./types.js";
import { RI_ENGINE_VERSION, RI_RISK_VERSION, RISK_CLASSIFICATION_LABELS } from "./types.js";
import { evaluateAccountRisk }   from "./account-risk.js";
import { evaluatePositionRisk }  from "./position-risk.js";
import { evaluatePortfolioRisk } from "./portfolio-risk.js";
import { evaluateMarketRisk }    from "./market-risk.js";
import { evaluateBrokerRisk }    from "./broker-risk.js";
import { evaluateSystemRisk }    from "./system-risk.js";
import {
  computeOverallRisk,
  scoreToRiskClassification,
  riskClassificationLabel,
} from "./scorer.js";
import {
  buildSupportingEvidence,
  collectAllAlerts,
  buildExplainability,
} from "./explainer.js";

// Re-exports for consumers
export { RI_ENGINE_VERSION, RI_RISK_VERSION } from "./types.js";
export { DEFAULT_RI_WEIGHTS }                 from "./types.js";
export { scoreToRiskClassification }          from "./scorer.js";
export { evaluateAccountRisk }                from "./account-risk.js";
export { evaluatePositionRisk }               from "./position-risk.js";
export { evaluatePortfolioRisk }              from "./portfolio-risk.js";
export { evaluateMarketRisk }                 from "./market-risk.js";
export { evaluateBrokerRisk }                 from "./broker-risk.js";
export { evaluateSystemRisk }                 from "./system-risk.js";

export type {
  RunRiInput,
  UnifiedRiskIntelligenceObject,
  AccountState,
  PortfolioInput,
  MarketRiskInput,
  BrokerMetrics,
  SystemMetrics,
  PositionInput,
  RiScoreWeights,
  RiskClassification,
  AccountRiskResult,
  PositionRiskResult,
  PortfolioRiskResult,
  MarketRiskResult,
  BrokerRiskResult,
  SystemRiskResult,
  RiskAlert,
} from "./types.js";

// ─── Default inputs ───────────────────────────────────────────────────────────

export function defaultAccountState(): AccountState {
  return { balance: 10000, equity: 10000, freeMargin: 10000, marginLevel: 0, dailyPnl: 0, weeklyPnl: 0, monthlyPnl: 0, openRisk: 0, closedRisk: 0 };
}

export function defaultPortfolioInput(accountBalance = 10000): PortfolioInput {
  return { openPositions: [], accountBalance, maxOpenTrades: 5 };
}

export function defaultMarketInput(pair = "EURUSD", session = "london", regime = "trending"): MarketRiskInput {
  return { volatility: 50, liquidity: 70, trendStability: 60, correlation: 40, marketHealth: 65, opportunityScore: 60, newsRisk: 20, pair, session, regime };
}

export function defaultBrokerMetrics(pair = "EURUSD"): BrokerMetrics {
  return { spread: 1.2, spreadBaseline: 1.0, slippage: 0.2, executionTime: 120, orderRejections: 0, totalOrders: 50, connectionQuality: 99, priceFeedConsistency: 98, latency: 45, pair };
}

export function defaultSystemMetrics(): SystemMetrics {
  return { cpuUsage: 25, memoryUsage: 40, dbHealth: 95, apiHealth: 98, networkLatency: 30, dataFeedHealth: 95, backgroundServices: 8, totalServices: 8, storageAvailability: 70, dbQueryMs: 35, apiErrorRate: 0.005 };
}

// ─── Gather system metrics from runtime ──────────────────────────────────────

export async function gatherSystemMetrics(): Promise<SystemMetrics> {
  // In production, these would be gathered from OS, DB, and monitoring systems
  // For now, derive from Node.js process metrics where available
  const mem = process.memoryUsage();
  const heapUsedMb  = mem.heapUsed / 1024 / 1024;
  const heapTotalMb = mem.heapTotal / 1024 / 1024;
  const rssMb       = mem.rss / 1024 / 1024;

  const memoryUsage = Math.min(95, (heapUsedMb / Math.max(heapTotalMb, 1)) * 100);

  return {
    cpuUsage:            25,     // Would use os.cpus() in production
    memoryUsage:         Math.round(memoryUsage),
    dbHealth:            92,     // Would ping DB in production
    apiHealth:           98,     // Would track error rate in production
    networkLatency:      30,     // Would measure RTT in production
    dataFeedHealth:      90,     // Would check price feed freshness
    backgroundServices:  8,
    totalServices:       8,
    storageAvailability: 70,     // Would check disk space in production
    dbQueryMs:           45,     // Would measure from DB pool in production
    apiErrorRate:        0.005,  // Would track from request logs
  };
}

// ─── Main engine ──────────────────────────────────────────────────────────────

export async function runRiskIntelligence(input: RunRiInput): Promise<UnifiedRiskIntelligenceObject> {
  const reportId    = randomUUID();
  const evaluatedAt = new Date();

  // ── Evaluate all risk dimensions ────────────────────────────────────────────
  const accountRisk   = evaluateAccountRisk(input.account);
  const positionRisk  = input.position ? evaluatePositionRisk(input.position) : null;
  const portfolioRisk = evaluatePortfolioRisk(input.portfolio);
  const marketRisk    = evaluateMarketRisk(input.market);
  const brokerRisk    = evaluateBrokerRisk(input.broker);
  const systemRisk    = evaluateSystemRisk(input.system);

  // ── Compute overall risk ────────────────────────────────────────────────────
  const {
    overallRiskScore, riskClassification, weights, breakdown, confidence,
  } = computeOverallRisk({ accountRisk, positionRisk, portfolioRisk, marketRisk, brokerRisk, systemRisk, weights: input.weights });

  // ── Explainability ──────────────────────────────────────────────────────────
  const { confidenceInterval, reliabilityRating } = buildExplainability(
    overallRiskScore, confidence, systemRisk.systemHealthScore, positionRisk, accountRisk, portfolioRisk,
  );

  const supportingEvidence = buildSupportingEvidence(
    accountRisk, positionRisk, portfolioRisk, marketRisk, brokerRisk, systemRisk,
  );

  const allAlerts = collectAllAlerts(
    accountRisk, positionRisk, portfolioRisk, marketRisk, brokerRisk, systemRisk,
  );

  return {
    reportId,
    engineVersion: RI_ENGINE_VERSION,
    riskVersion:   RI_RISK_VERSION,
    evaluatedAt,
    isAdvisoryOnly: true,

    tradeId:         input.context?.tradeId,
    pair:            input.context?.pair    ?? input.market.pair,
    session:         input.context?.session ?? input.market.session,
    regime:          input.context?.regime  ?? input.market.regime,
    strategyVersion: input.context?.strategyVersion,

    accountRisk,
    positionRisk,
    portfolioRisk,
    marketRisk,
    brokerRisk,
    systemRisk,

    overallRiskScore:   Math.round(overallRiskScore * 10) / 10,
    riskClassification,
    riskLabel:          RISK_CLASSIFICATION_LABELS[riskClassification],
    confidence:         Math.round(confidence * 10) / 10,

    scoreWeights:       weights,
    scoreBreakdown:     breakdown,
    confidenceInterval,
    reliabilityRating,
    supportingEvidence,
    allAlerts,
  };
}
