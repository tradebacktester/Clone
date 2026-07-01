// ─── Crisis Intelligence & Survival Engine ────────────────────────────────────

import { randomUUID } from "crypto";
import {
  RunCrisisEngineInput,
  CrisisEngineReport,
  SystemHealth,
  CrisisReportSummary,
  SurvivalMode,
  CRISIS_ENGINE_VERSION,
} from "./types.js";
import { detectMarketCrisis }        from "./market-crisis-detector.js";
import { detectBrokerCrisis }        from "./broker-crisis-detector.js";
import { monitorInfrastructure }     from "./infrastructure-monitor.js";
import { checkDataIntegrity }        from "./data-integrity-checker.js";
import { monitorStrategyStability }  from "./strategy-stability-monitor.js";
import { classifyCrisis }            from "./crisis-classifier.js";
import { determineSurvivalMode }     from "./survival-mode-engine.js";
import { assessRecovery }            from "./recovery-engine.js";
import { buildEmergencyEvent }       from "./emergency-decision-engine.js";
import { buildExplainability }       from "./explainer.js";

export * from "./types.js";
export * from "./market-crisis-detector.js";
export * from "./broker-crisis-detector.js";
export * from "./infrastructure-monitor.js";
export * from "./data-integrity-checker.js";
export * from "./strategy-stability-monitor.js";
export * from "./crisis-classifier.js";
export * from "./survival-mode-engine.js";
export * from "./recovery-engine.js";
export * from "./emergency-decision-engine.js";
export * from "./explainer.js";

// ─── Default Context Helpers ──────────────────────────────────────────────────

export function defaultMarketCtx(): RunCrisisEngineInput["market"] {
  return {
    pair:            "EURUSD",
    volatilityScore: 30,
    liquidityScore:  70,
    spreadMultiplier: 1.0,
    regime:          "trending",
    hasNewsFeed:     true,
  };
}

export function defaultBrokerCtx(): RunCrisisEngineInput["broker"] {
  return {
    isConnected:               true,
    recentRejections:          0,
    avgExecutionMs:            150,
    slippagePips:              0.5,
    lastHeartbeatSecondsAgo:   5,
    apiErrorRate:              0.01,
  };
}

export function defaultInfraCtx(): RunCrisisEngineInput["infrastructure"] {
  return {
    dbResponseMs:    80,
    cpuPercent:      25,
    memPercent:      40,
    diskPercent:     30,
    networkLatencyMs: 20,
    uptimeHours:     48,
  };
}

export function defaultDataCtx(): RunCrisisEngineInput["data"] {
  return {
    recentGapCount:   0,
    duplicateCount:   0,
    lastCandle:       new Date().toISOString(),
    expectedInterval: 15,
    feedDelaySeconds: 10,
  };
}

export function defaultStrategyCtx(): RunCrisisEngineInput["strategy"] {
  return {
    recentWinRate:   0.55,
    baselineWinRate: 0.55,
    currentDrawdown: 1.0,
    lossStreak:      1,
    recentPnL:       50,
  };
}

// ─── Main Engine ──────────────────────────────────────────────────────────────

export function runCrisisEngine(input: RunCrisisEngineInput): CrisisEngineReport {
  const {
    market, broker, infrastructure, data, strategy, currentMode,
  } = input;

  // 1. Detect per-dimension signals
  const marketSignal  = detectMarketCrisis(market);
  const brokerSignal  = detectBrokerCrisis(broker);
  const infraSignal   = monitorInfrastructure(infrastructure);
  const dataSignal    = checkDataIntegrity(data);
  const strategySignal = monitorStrategyStability(strategy);

  // 2. Classify overall crisis
  const classification = classifyCrisis(
    marketSignal, brokerSignal, infraSignal, dataSignal, strategySignal,
  );

  // 3. Determine survival mode
  const survivalMode = determineSurvivalMode(classification, currentMode);

  // 4. Assess recovery
  const recovery = assessRecovery(
    survivalMode.currentMode,
    marketSignal,
    brokerSignal,
    infraSignal,
    0,   // tradesSinceEvent — caller can provide history count
  );

  // 5. Emergency event (if warranted)
  const emergencyEvent = buildEmergencyEvent(classification, survivalMode.currentMode);

  // 6. Explainability
  const explainability = buildExplainability(classification, survivalMode, recovery);

  // 7. System health
  const systemHealth = computeSystemHealth(
    marketSignal.crisisScore,
    brokerSignal.crisisScore,
    infraSignal.crisisScore,
    dataSignal.crisisScore,
    strategySignal.crisisScore,
  );

  // 8. Summary
  const mode = survivalMode.currentMode;
  const summary: CrisisReportSummary = {
    currentSeverity:   classification.overallSeverity,
    currentMode:       mode,
    systemHealth,
    activeAlerts:      survivalMode.activeAlerts.length,
    safeToTrade:       mode === "normal" || mode === "caution",
    requiresAttention: classification.overallScore >= 20,
    topReason:         classification.recommendedResponse,
  };

  return {
    reportId:       randomUUID(),
    engineVersion:  CRISIS_ENGINE_VERSION,
    generatedAt:    new Date().toISOString(),
    isAdvisoryOnly: true,
    classification,
    survivalMode,
    recovery,
    systemHealth,
    emergencyEvent,
    explainability,
    summary,
  };
}

function computeSystemHealth(
  marketScore:  number,
  brokerScore:  number,
  infraScore:   number,
  dataScore:    number,
  stratScore:   number,
): SystemHealth {
  const marketHealth  = Math.max(0, 100 - marketScore);
  const brokerHealth  = Math.max(0, 100 - brokerScore);
  const infraHealth   = Math.max(0, 100 - infraScore);
  const dataHealth    = Math.max(0, 100 - dataScore);
  const stratHealth   = Math.max(0, 100 - stratScore);

  const healthScore = Math.round(
    marketHealth * 0.30 +
    brokerHealth * 0.25 +
    infraHealth  * 0.20 +
    dataHealth   * 0.15 +
    stratHealth  * 0.10,
  );

  const overallHealth: SystemHealth["overallHealth"] =
    healthScore >= 80 ? "healthy" :
    healthScore >= 60 ? "degraded" :
    healthScore >= 30 ? "critical" : "offline";

  return {
    overallHealth,
    healthScore,
    marketHealth,
    brokerHealth,
    infrastructureHealth: infraHealth,
    dataIntegrityHealth:  dataHealth,
    strategyHealth:       stratHealth,
    checkedAt: new Date().toISOString(),
  };
}
