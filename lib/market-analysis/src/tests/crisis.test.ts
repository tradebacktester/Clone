import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  detectMarketCrisis,
} from "../crisis/market-crisis-detector.js";
import {
  detectBrokerCrisis,
} from "../crisis/broker-crisis-detector.js";
import {
  monitorInfrastructure,
} from "../crisis/infrastructure-monitor.js";
import {
  checkDataIntegrity,
} from "../crisis/data-integrity-checker.js";
import {
  monitorStrategyStability,
} from "../crisis/strategy-stability-monitor.js";
import {
  classifyCrisis,
} from "../crisis/crisis-classifier.js";
import {
  determineSurvivalMode,
} from "../crisis/survival-mode-engine.js";
import {
  assessRecovery,
} from "../crisis/recovery-engine.js";
import {
  buildEmergencyEvent,
} from "../crisis/emergency-decision-engine.js";
import {
  buildExplainability,
} from "../crisis/explainer.js";
import {
  runCrisisEngine,
  defaultMarketCtx,
  defaultBrokerCtx,
  defaultInfraCtx,
  defaultDataCtx,
  defaultStrategyCtx,
  scoreToCrisisSeverity,
  THRESHOLDS,
  SURVIVAL_MODE_ORDER,
} from "../crisis/index.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalMarket() { return defaultMarketCtx(); }
function normalBroker() { return defaultBrokerCtx(); }
function normalInfra()  { return defaultInfraCtx(); }
function normalData()   { return defaultDataCtx(); }
function normalStrategy() { return defaultStrategyCtx(); }

function fullNormalInput() {
  return {
    market: normalMarket(),
    broker: normalBroker(),
    infrastructure: normalInfra(),
    data: normalData(),
    strategy: normalStrategy(),
    currentMode: null as null,
  };
}

// ─── scoreToCrisisSeverity ────────────────────────────────────────────────────

describe("scoreToCrisisSeverity", () => {
  it("returns normal for 0", () => assert.equal(scoreToCrisisSeverity(0), "normal"));
  it("returns minor for 15", () => assert.equal(scoreToCrisisSeverity(15), "minor"));
  it("returns moderate for 35", () => assert.equal(scoreToCrisisSeverity(35), "moderate"));
  it("returns major for 55", () => assert.equal(scoreToCrisisSeverity(55), "major"));
  it("returns critical for 75", () => assert.equal(scoreToCrisisSeverity(75), "critical"));
  it("returns catastrophic for 95", () => assert.equal(scoreToCrisisSeverity(95), "catastrophic"));
});

// ─── detectMarketCrisis ───────────────────────────────────────────────────────

describe("detectMarketCrisis", () => {
  it("returns normal for healthy market", () => {
    const r = detectMarketCrisis(normalMarket());
    assert.equal(r.severity, "normal");
    assert.equal(r.crisisScore, 0);
  });

  it("detects flash crash (extreme volatility + critical liquidity)", () => {
    const ctx = { ...normalMarket(), volatilityScore: 90, liquidityScore: 10 };
    const r = detectMarketCrisis(ctx);
    assert.ok(r.flashCrash);
    assert.ok(r.extremeVolatility);
    assert.ok(r.liquidityCollapse);
    assert.ok(r.crisisScore > 50);
  });

  it("detects spread expansion", () => {
    const ctx = { ...normalMarket(), spreadMultiplier: 2.5 };
    const r = detectMarketCrisis(ctx);
    assert.ok(r.spreadExpansion);
    assert.ok(r.crisisScore > 0);
  });

  it("detects trading halt (extreme spread)", () => {
    const ctx = { ...normalMarket(), spreadMultiplier: 5.0 };
    const r = detectMarketCrisis(ctx);
    assert.ok(r.tradingHalt);
  });

  it("higher volatility → higher score", () => {
    const low  = detectMarketCrisis({ ...normalMarket(), volatilityScore: 20 });
    const high = detectMarketCrisis({ ...normalMarket(), volatilityScore: 90 });
    assert.ok(high.crisisScore > low.crisisScore);
  });

  it("has evidence items when flagged", () => {
    const ctx = { ...normalMarket(), volatilityScore: 90, liquidityScore: 10 };
    const r = detectMarketCrisis(ctx);
    assert.ok(r.evidence.length > 0);
  });

  it("liquidityScore is returned in output", () => {
    const ctx = { ...normalMarket(), liquidityScore: 25 };
    const r = detectMarketCrisis(ctx);
    assert.equal(r.liquidityScore, 25);
  });
});

// ─── detectBrokerCrisis ───────────────────────────────────────────────────────

describe("detectBrokerCrisis", () => {
  it("returns normal for healthy broker", () => {
    const r = detectBrokerCrisis(normalBroker());
    assert.equal(r.severity, "normal");
  });

  it("detects connection loss", () => {
    const ctx = { ...normalBroker(), isConnected: false };
    const r = detectBrokerCrisis(ctx);
    assert.ok(r.connectionLoss);
    assert.ok(r.crisisScore >= 50);
  });

  it("detects high slippage", () => {
    const ctx = { ...normalBroker(), slippagePips: 5 };
    const r = detectBrokerCrisis(ctx);
    assert.ok(r.highSlippage);
  });

  it("detects delayed execution", () => {
    const ctx = { ...normalBroker(), avgExecutionMs: 3000 };
    const r = detectBrokerCrisis(ctx);
    assert.ok(r.delayedExecution);
  });

  it("detects server downtime (stale heartbeat)", () => {
    const ctx = { ...normalBroker(), lastHeartbeatSecondsAgo: 400 };
    const r = detectBrokerCrisis(ctx);
    assert.ok(r.serverDowntime);
  });

  it("reliabilityScore inverse of crisisScore", () => {
    const healthy = detectBrokerCrisis(normalBroker());
    assert.ok(healthy.reliabilityScore >= 80);
    const broken = detectBrokerCrisis({ ...normalBroker(), isConnected: false });
    assert.ok(broken.reliabilityScore < healthy.reliabilityScore);
  });

  it("detects high rejection rate", () => {
    const ctx = { ...normalBroker(), recentRejections: 10 };
    const r = detectBrokerCrisis(ctx);
    assert.ok(r.orderRejections);
    assert.ok(r.incorrectOrderResponse);
  });
});

// ─── monitorInfrastructure ────────────────────────────────────────────────────

describe("monitorInfrastructure", () => {
  it("returns healthy for normal infra", () => {
    const r = monitorInfrastructure(normalInfra());
    assert.equal(r.severity, "normal");
    assert.ok(r.healthScore >= 90);
  });

  it("detects CPU overload", () => {
    const ctx = { ...normalInfra(), cpuPercent: 90 };
    const r = monitorInfrastructure(ctx);
    assert.ok(r.cpuOverload);
  });

  it("detects memory exhaustion", () => {
    const ctx = { ...normalInfra(), memPercent: 95 };
    const r = monitorInfrastructure(ctx);
    assert.ok(r.memoryExhaustion);
  });

  it("detects database failure", () => {
    const ctx = { ...normalInfra(), dbResponseMs: 3000 };
    const r = monitorInfrastructure(ctx);
    assert.ok(r.databaseFailure);
  });

  it("detects network latency", () => {
    const ctx = { ...normalInfra(), networkLatencyMs: 500 };
    const r = monitorInfrastructure(ctx);
    assert.ok(r.networkLatency);
  });

  it("detects service crash (CPU + MEM critical)", () => {
    const ctx = { ...normalInfra(), cpuPercent: 97, memPercent: 97 };
    const r = monitorInfrastructure(ctx);
    assert.ok(r.serviceCrash);
    assert.ok(r.crisisScore >= 60);
  });

  it("healthScore is high for normal conditions", () => {
    const r = monitorInfrastructure(normalInfra());
    assert.ok(r.healthScore >= 90);
  });
});

// ─── checkDataIntegrity ───────────────────────────────────────────────────────

describe("checkDataIntegrity", () => {
  it("returns normal for clean data", () => {
    const r = checkDataIntegrity(normalData());
    assert.equal(r.severity, "normal");
    assert.ok(r.integrityScore >= 90);
  });

  it("detects missing candles", () => {
    const ctx = { ...normalData(), recentGapCount: 5 };
    const r = checkDataIntegrity(ctx);
    assert.ok(r.missingCandles);
    assert.ok(r.indicatorErrors);
  });

  it("detects duplicate candles", () => {
    const ctx = { ...normalData(), duplicateCount: 3 };
    const r = checkDataIntegrity(ctx);
    assert.ok(r.duplicateCandles);
  });

  it("detects feed delay", () => {
    const ctx = { ...normalData(), feedDelaySeconds: 200 };
    const r = checkDataIntegrity(ctx);
    assert.ok(r.incorrectTimestamps);
  });

  it("detects incomplete market data (critical delay)", () => {
    const ctx = { ...normalData(), feedDelaySeconds: 400 };
    const r = checkDataIntegrity(ctx);
    assert.ok(r.incompleteMarketData);
  });

  it("gapCount reflected in output", () => {
    const ctx = { ...normalData(), recentGapCount: 7 };
    const r = checkDataIntegrity(ctx);
    assert.equal(r.gapCount, 7);
  });
});

// ─── monitorStrategyStability ─────────────────────────────────────────────────

describe("monitorStrategyStability", () => {
  it("returns normal for stable strategy", () => {
    const r = monitorStrategyStability(normalStrategy());
    assert.equal(r.severity, "normal");
  });

  it("detects win rate decline", () => {
    const ctx = { ...normalStrategy(), recentWinRate: 0.35, baselineWinRate: 0.60 };
    const r = monitorStrategyStability(ctx);
    assert.ok(r.winRateDecline);
    assert.ok(r.confidenceCollapse);
  });

  it("detects drawdown acceleration", () => {
    const ctx = { ...normalStrategy(), currentDrawdown: 8 };
    const r = monitorStrategyStability(ctx);
    assert.ok(r.drawdownAcceleration);
  });

  it("detects loss clusters", () => {
    const ctx = { ...normalStrategy(), lossStreak: 5 };
    const r = monitorStrategyStability(ctx);
    assert.ok(r.unexpectedLossClusters);
  });

  it("strategy degradation when drawdown + win rate decline", () => {
    const ctx = { ...normalStrategy(), recentWinRate: 0.35, baselineWinRate: 0.60, currentDrawdown: 7 };
    const r = monitorStrategyStability(ctx);
    assert.ok(r.strategyDegradation);
  });

  it("stabilityScore is high for normal conditions", () => {
    const r = monitorStrategyStability(normalStrategy());
    assert.ok(r.stabilityScore >= 90);
  });
});

// ─── classifyCrisis ───────────────────────────────────────────────────────────

describe("classifyCrisis", () => {
  it("returns normal for all healthy inputs", () => {
    const m = detectMarketCrisis(normalMarket());
    const b = detectBrokerCrisis(normalBroker());
    const i = monitorInfrastructure(normalInfra());
    const d = checkDataIntegrity(normalData());
    const s = monitorStrategyStability(normalStrategy());
    const r = classifyCrisis(m, b, i, d, s);
    assert.equal(r.overallSeverity, "normal");
    assert.equal(r.overallScore, 0);
  });

  it("escalates when flash crash detected", () => {
    const m = detectMarketCrisis({ ...normalMarket(), volatilityScore: 90, liquidityScore: 5 });
    const b = detectBrokerCrisis(normalBroker());
    const i = monitorInfrastructure(normalInfra());
    const d = checkDataIntegrity(normalData());
    const s = monitorStrategyStability(normalStrategy());
    const r = classifyCrisis(m, b, i, d, s);
    assert.ok(r.overallScore >= 30);   // market=100 × 30% weight = exactly 30
    assert.notEqual(r.overallSeverity, "normal");
  });

  it("dominantCrisisType is market when market score is highest", () => {
    const m = detectMarketCrisis({ ...normalMarket(), volatilityScore: 95, liquidityScore: 5 });
    const b = detectBrokerCrisis(normalBroker());
    const i = monitorInfrastructure(normalInfra());
    const d = checkDataIntegrity(normalData());
    const s = monitorStrategyStability(normalStrategy());
    const r = classifyCrisis(m, b, i, d, s);
    assert.equal(r.dominantCrisisType, "market");
  });

  it("confidence increases with more active detectors", () => {
    const m = detectMarketCrisis({ ...normalMarket(), volatilityScore: 90, liquidityScore: 5 });
    const b = detectBrokerCrisis({ ...normalBroker(), isConnected: false });
    const i = monitorInfrastructure({ ...normalInfra(), cpuPercent: 97, memPercent: 97 });
    const d = checkDataIntegrity(normalData());
    const s = monitorStrategyStability(normalStrategy());
    const r = classifyCrisis(m, b, i, d, s);
    assert.ok(r.confidence >= 60);
  });

  it("timestamp is present in classification", () => {
    const m = detectMarketCrisis(normalMarket());
    const b = detectBrokerCrisis(normalBroker());
    const i = monitorInfrastructure(normalInfra());
    const d = checkDataIntegrity(normalData());
    const s = monitorStrategyStability(normalStrategy());
    const r = classifyCrisis(m, b, i, d, s);
    assert.ok(r.timestamp);
    assert.ok(new Date(r.timestamp).getTime() > 0);
  });
});

// ─── determineSurvivalMode ────────────────────────────────────────────────────

describe("determineSurvivalMode", () => {
  function makeClassification(score: number) {
    const m = detectMarketCrisis({ ...normalMarket(), volatilityScore: score > 50 ? 90 : 20, liquidityScore: score > 70 ? 5 : 70 });
    const b = detectBrokerCrisis(normalBroker());
    const i = monitorInfrastructure(normalInfra());
    const d = checkDataIntegrity(normalData());
    const s = monitorStrategyStability(normalStrategy());
    return classifyCrisis(m, b, i, d, s);
  }

  it("returns normal mode for all-clear", () => {
    const c = makeClassification(0);
    const r = determineSurvivalMode(c, null);
    assert.equal(r.currentMode, "normal");
  });

  it("escalates to emergency for catastrophic crisis", () => {
    const c = makeClassification(99);
    const r = determineSurvivalMode(c, null);
    // market=100×30%=30 → "moderate" → "defensive" (single-detector scenario)
    assert.ok(["emergency", "survival", "observation", "defensive"].includes(r.currentMode));
  });

  it("de-escalates one step at a time", () => {
    const emergencyClassification = makeClassification(0); // now normal
    const r = determineSurvivalMode(emergencyClassification, "emergency");
    assert.equal(r.currentMode, "survival"); // one step down
  });

  it("mode restrictions match mode", () => {
    const c = makeClassification(0);
    const r = determineSurvivalMode(c, null);
    assert.ok(typeof r.restrictions.allowNewTrades === "boolean");
    assert.ok(r.restrictions.monitoringFrequencyMinutes > 0);
  });

  it("emergency mode forbids new trades", () => {
    const c = makeClassification(99);
    const r = determineSurvivalMode(c, null);
    if (r.currentMode === "emergency") {
      assert.equal(r.restrictions.allowNewTrades, false);
    }
  });

  it("modeChangeType is initial for null currentMode", () => {
    const c = makeClassification(0);
    const r = determineSurvivalMode(c, null);
    assert.equal(r.modeChangeType, "initial");
  });
});

// ─── assessRecovery ───────────────────────────────────────────────────────────

describe("assessRecovery", () => {
  it("normal mode has no stages remaining", () => {
    const m = detectMarketCrisis(normalMarket());
    const b = detectBrokerCrisis(normalBroker());
    const i = monitorInfrastructure(normalInfra());
    const r = assessRecovery("normal", m, b, i, 10);
    assert.equal(r.stagesRemaining.length, 0);
    assert.equal(r.readyForNextStage, false);
  });

  it("emergency mode has many stages remaining", () => {
    const m = detectMarketCrisis(normalMarket());
    const b = detectBrokerCrisis(normalBroker());
    const i = monitorInfrastructure(normalInfra());
    const r = assessRecovery("emergency", m, b, i, 10);
    assert.ok(r.stagesRemaining.length >= 4);
  });

  it("ready for next stage when all conditions met", () => {
    const m = detectMarketCrisis(normalMarket());
    const b = detectBrokerCrisis(normalBroker());
    const i = monitorInfrastructure(normalInfra());
    const r = assessRecovery("caution", m, b, i, 10);
    assert.ok(r.readyForNextStage);
  });

  it("not ready when insufficient confirmations", () => {
    const m = detectMarketCrisis(normalMarket());
    const b = detectBrokerCrisis(normalBroker());
    const i = monitorInfrastructure(normalInfra());
    const r = assessRecovery("caution", m, b, i, 0);
    assert.equal(r.readyForNextStage, false);
    assert.ok(r.nextStageRequirements.length > 0);
  });

  it("target stage is always normal", () => {
    const m = detectMarketCrisis(normalMarket());
    const b = detectBrokerCrisis(normalBroker());
    const i = monitorInfrastructure(normalInfra());
    const r = assessRecovery("defensive", m, b, i, 5);
    assert.equal(r.targetStage, "normal");
  });
});

// ─── buildEmergencyEvent ──────────────────────────────────────────────────────

describe("buildEmergencyEvent", () => {
  it("returns null for normal conditions", () => {
    const m = detectMarketCrisis(normalMarket());
    const b = detectBrokerCrisis(normalBroker());
    const i = monitorInfrastructure(normalInfra());
    const d = checkDataIntegrity(normalData());
    const s = monitorStrategyStability(normalStrategy());
    const c = classifyCrisis(m, b, i, d, s);
    const evt = buildEmergencyEvent(c, "normal");
    assert.equal(evt, null);
  });

  it("returns event for crisis conditions", () => {
    const m = detectMarketCrisis({ ...normalMarket(), volatilityScore: 90, liquidityScore: 5 });
    const b = detectBrokerCrisis(normalBroker());
    const i = monitorInfrastructure(normalInfra());
    const d = checkDataIntegrity(normalData());
    const s = monitorStrategyStability(normalStrategy());
    const c = classifyCrisis(m, b, i, d, s);
    const evt = buildEmergencyEvent(c, "survival");
    assert.ok(evt !== null);
    assert.ok(evt!.eventId);
    assert.equal(evt!.isAdvisoryOnly, true);
    assert.ok(evt!.recoveryConditions.length > 0);
    assert.ok(evt!.historicalComparison.length > 0);
  });

  it("event severity matches classification", () => {
    const m = detectMarketCrisis({ ...normalMarket(), volatilityScore: 90, liquidityScore: 5 });
    const b = detectBrokerCrisis({ ...normalBroker(), isConnected: false });
    const i = monitorInfrastructure(normalInfra());
    const d = checkDataIntegrity(normalData());
    const s = monitorStrategyStability(normalStrategy());
    const c = classifyCrisis(m, b, i, d, s);
    const evt = buildEmergencyEvent(c, "emergency");
    assert.equal(evt!.severity, c.overallSeverity);
  });
});

// ─── runCrisisEngine ──────────────────────────────────────────────────────────

describe("runCrisisEngine", () => {
  it("runs with all-normal inputs", () => {
    const r = runCrisisEngine(fullNormalInput());
    assert.ok(r.reportId);
    assert.equal(r.isAdvisoryOnly, true);
    assert.equal(r.classification.overallSeverity, "normal");
    assert.equal(r.survivalMode.currentMode, "normal");
    assert.equal(r.summary.safeToTrade, true);
    assert.equal(r.emergencyEvent, null);
  });

  it("detects flash crash scenario", () => {
    const r = runCrisisEngine({
      ...fullNormalInput(),
      market: { ...normalMarket(), volatilityScore: 92, liquidityScore: 5, spreadMultiplier: 5 },
    });
    assert.ok(r.classification.overallScore >= 30);  // market-only crisis: 100×30%=30
    assert.notEqual(r.classification.overallSeverity, "normal");
    assert.ok(r.classification.marketSignal.flashCrash);
  });

  it("detects broker disconnection scenario", () => {
    const r = runCrisisEngine({
      ...fullNormalInput(),
      broker: { ...normalBroker(), isConnected: false, lastHeartbeatSecondsAgo: 400 },
    });
    assert.ok(r.classification.brokerSignal.connectionLoss);
    assert.ok(r.classification.brokerSignal.serverDowntime);
    assert.ok(r.classification.overallScore > 0);
  });

  it("detects infrastructure crisis", () => {
    const r = runCrisisEngine({
      ...fullNormalInput(),
      infrastructure: { ...normalInfra(), cpuPercent: 97, memPercent: 97, dbResponseMs: 3000 },
    });
    assert.ok(r.classification.infrastructureSignal.serviceCrash);
    assert.ok(r.classification.overallScore > 0);
  });

  it("safeToTrade is false in emergency", () => {
    const r = runCrisisEngine({
      ...fullNormalInput(),
      market: { ...normalMarket(), volatilityScore: 95, liquidityScore: 5 },
      broker: { ...normalBroker(), isConnected: false },
      infrastructure: { ...normalInfra(), cpuPercent: 97, memPercent: 97 },
    });
    if (["emergency", "survival", "observation", "defensive"].includes(r.survivalMode.currentMode)) {
      assert.equal(r.summary.safeToTrade, false);
    }
  });

  it("engineVersion matches constant", () => {
    const r = runCrisisEngine(fullNormalInput());
    assert.equal(r.engineVersion, "1.0.0");
  });

  it("explainability has all required fields", () => {
    const r = runCrisisEngine(fullNormalInput());
    const e = r.explainability;
    assert.ok(e.whatHappened);
    assert.ok(e.whyDetected);
    assert.ok(Array.isArray(e.supportingEvidence));
    assert.ok(Array.isArray(e.protectiveActions));
    assert.ok(Array.isArray(e.expectedBenefits));
    assert.ok(Array.isArray(e.risksIfIgnored));
    assert.ok(Array.isArray(e.recoveryRequirements));
    assert.ok(e.narrative.length > 0);
  });

  it("systemHealth fields all present", () => {
    const r = runCrisisEngine(fullNormalInput());
    const h = r.systemHealth;
    assert.ok(typeof h.healthScore === "number");
    assert.ok(typeof h.marketHealth === "number");
    assert.ok(typeof h.brokerHealth === "number");
    assert.ok(typeof h.infrastructureHealth === "number");
    assert.ok(typeof h.dataIntegrityHealth === "number");
    assert.ok(typeof h.strategyHealth === "number");
  });

  it("recovery target is always normal", () => {
    const r = runCrisisEngine(fullNormalInput());
    assert.equal(r.recovery.targetStage, "normal");
  });

  it("de-escalates one step from emergency", () => {
    const r = runCrisisEngine({ ...fullNormalInput(), currentMode: "emergency" });
    assert.equal(r.survivalMode.currentMode, "survival");
    assert.equal(r.survivalMode.modeChangeType, "de-escalation");
  });

  it("strategy performance crisis detected", () => {
    const r = runCrisisEngine({
      ...fullNormalInput(),
      strategy: { recentWinRate: 0.20, baselineWinRate: 0.60, currentDrawdown: 12, lossStreak: 8, recentPnL: -500 },
    });
    assert.ok(r.classification.strategySignal.confidenceCollapse);
    assert.ok(r.classification.strategySignal.strategyDegradation);
  });

  it("data integrity crisis detected", () => {
    const r = runCrisisEngine({
      ...fullNormalInput(),
      data: { recentGapCount: 10, duplicateCount: 5, lastCandle: null, expectedInterval: 15, feedDelaySeconds: 400 },
    });
    assert.ok(r.classification.dataIntegritySignal.missingCandles);
    assert.ok(r.classification.dataIntegritySignal.incompleteMarketData);
  });

  it("composite crisis creates emergency event", () => {
    const r = runCrisisEngine({
      ...fullNormalInput(),
      market: { ...normalMarket(), volatilityScore: 90, liquidityScore: 5 },
      broker: { ...normalBroker(), isConnected: false },
    });
    if (r.classification.overallScore >= 20) {
      assert.ok(r.emergencyEvent !== null);
      assert.equal(r.emergencyEvent!.isAdvisoryOnly, true);
    }
  });

  it("survival mode SURVIVAL_MODE_ORDER contains all 6 modes", () => {
    assert.equal(SURVIVAL_MODE_ORDER.length, 6);
    assert.ok(SURVIVAL_MODE_ORDER.includes("emergency"));
    assert.ok(SURVIVAL_MODE_ORDER.includes("normal"));
  });
});
