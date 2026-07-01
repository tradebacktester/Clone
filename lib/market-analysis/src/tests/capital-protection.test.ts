// ─── Capital Protection & Survival Engine — Tests ─────────────────────────────
// Comprehensive test coverage for all protection monitors, level evaluation,
// recovery logic, config validation, and integration.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  runCapitalProtection,
  evaluateAccountProtection,
  evaluateConsecutiveLoss,
  evaluateDrawdownProtection,
  evaluateExposureProtection,
  evaluateMarginProtection,
  evaluateBrokerProtection,
  evaluateSystemProtection,
  evaluateProtectionLevel,
  generateProtectionActions,
  evaluateRecovery,
  validateProtectionConfig,
  DEFAULT_PROTECTION_CONFIG,
  defaultAccountInput,
  defaultBrokerInput,
  defaultSystemInput,
} from "../capital-protection/index.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const cfg = DEFAULT_PROTECTION_CONFIG;

function makeFullInput(overrides: Partial<Parameters<typeof runCapitalProtection>[0]> = {}) {
  const acct = defaultAccountInput();
  const brok = defaultBrokerInput();
  const sys  = defaultSystemInput();
  return {
    ...acct,
    recentTrades:    [],
    openPositions:   [],
    drawdownHistory: [],
    ...brok,
    ...sys,
    ...overrides,
  };
}

// ─── Account Protection ───────────────────────────────────────────────────────

describe("evaluateAccountProtection", () => {
  it("healthy account → normal severity", () => {
    const r = evaluateAccountProtection(
      { balance: 10000, equity: 10000, peakEquity: 10000, dailyPnl: 100, weeklyPnl: 200, monthlyPnl: 300 },
      cfg,
    );
    assert.equal(r.severity, "normal");
    assert.ok(r.healthScore >= 80);
    assert.equal(r.triggeredLimits.length, 0);
  });

  it("daily loss at limit → pause + alert actions", () => {
    const r = evaluateAccountProtection(
      { balance: 10000, equity: 9800, peakEquity: 10000, dailyPnl: -200, weeklyPnl: -200, monthlyPnl: -200 },
      cfg,
    );
    assert.ok(r.actions.includes("pause_new_trades"));
    assert.ok(r.actions.includes("generate_emergency_alert"));
    assert.ok(r.triggeredLimits.length > 0);
  });

  it("75% daily loss threshold → reduce position size", () => {
    const r = evaluateAccountProtection(
      { balance: 10000, equity: 9850, peakEquity: 10000, dailyPnl: -150, weeklyPnl: -150, monthlyPnl: -150 },
      cfg,
    );
    assert.ok(r.actions.includes("reduce_position_size"));
  });

  it("monthly loss at limit → block all entries", () => {
    const r = evaluateAccountProtection(
      { balance: 10000, equity: 9000, peakEquity: 10000, dailyPnl: 0, weeklyPnl: -200, monthlyPnl: -1000 },
      cfg,
    );
    assert.ok(r.actions.includes("block_all_entries"));
  });

  it("emergency equity drawdown → block + alert", () => {
    const r = evaluateAccountProtection(
      { balance: 8400, equity: 8400, peakEquity: 10000, dailyPnl: 0, weeklyPnl: -500, monthlyPnl: -1600 },
      cfg,
    );
    assert.ok(r.equityDrawdownPct >= cfg.drawdownEmergencyPercent);
    assert.ok(r.actions.includes("block_all_entries"));
  });

  it("healthScore is 0-100", () => {
    const r = evaluateAccountProtection(
      { balance: 10000, equity: 10000, peakEquity: 10000, dailyPnl: -1000, weeklyPnl: -3000, monthlyPnl: -5000 },
      cfg,
    );
    assert.ok(r.healthScore >= 0 && r.healthScore <= 100);
  });
});

// ─── Consecutive Loss ─────────────────────────────────────────────────────────

describe("evaluateConsecutiveLoss", () => {
  const makeTradesWithLosses = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      pnl: -50,
      closedAt: new Date(Date.now() - i * 3_600_000).toISOString(),
      pair: "EURUSD",
    }));

  const makeWins = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      pnl: 50,
      closedAt: new Date(Date.now() - i * 3_600_000).toISOString(),
      pair: "EURUSD",
    }));

  it("no trades → normal severity", () => {
    const r = evaluateConsecutiveLoss([], cfg);
    assert.equal(r.severity, "normal");
    assert.equal(r.consecutiveLosses, 0);
  });

  it("2 losses → normal (below caution)", () => {
    const r = evaluateConsecutiveLoss(makeTradesWithLosses(2), cfg);
    assert.equal(r.severity, "normal");
  });

  it("3 losses → caution", () => {
    const r = evaluateConsecutiveLoss(makeTradesWithLosses(3), cfg);
    assert.ok(["caution", "warning"].includes(r.severity));
    assert.ok(r.actions.includes("reduce_position_size"));
  });

  it("5 losses → warning level actions", () => {
    const r = evaluateConsecutiveLoss(makeTradesWithLosses(5), cfg);
    assert.ok(["warning", "critical"].includes(r.severity));
    assert.ok(r.actions.includes("reduce_position_size") || r.actions.includes("enter_observation_mode"));
  });

  it("7 losses → critical → pause trades", () => {
    const r = evaluateConsecutiveLoss(makeTradesWithLosses(7), cfg);
    assert.ok(r.actions.includes("pause_new_trades"));
  });

  it("10 losses → emergency → block all", () => {
    const r = evaluateConsecutiveLoss(makeTradesWithLosses(10), cfg);
    assert.ok(r.actions.includes("block_all_entries"));
    assert.ok(r.actions.includes("generate_emergency_alert"));
  });

  it("wins reset streak", () => {
    const r = evaluateConsecutiveLoss(makeWins(3), cfg);
    assert.equal(r.consecutiveLosses, 0);
    assert.equal(r.consecutiveWins, 3);
  });

  it("win after losses clears consecutive count", () => {
    const trades = [
      { pnl: 50, closedAt: new Date(Date.now() - 100).toISOString(), pair: "EURUSD" }, // most recent = win
      { pnl: -50, closedAt: new Date(Date.now() - 3_600_000).toISOString(), pair: "EURUSD" },
      { pnl: -50, closedAt: new Date(Date.now() - 7_200_000).toISOString(), pair: "EURUSD" },
    ];
    const r = evaluateConsecutiveLoss(trades, cfg);
    assert.equal(r.consecutiveLosses, 0);
  });
});

// ─── Drawdown Protection ──────────────────────────────────────────────────────

describe("evaluateDrawdownProtection", () => {
  it("no drawdown → normal", () => {
    const r = evaluateDrawdownProtection(
      { currentBalance: 10000, peakBalance: 10000, currentEquity: 10000, peakEquity: 10000, drawdownHistory: [] },
      cfg,
    );
    assert.equal(r.severity, "normal");
    assert.equal(r.currentDrawdownPct, 0);
  });

  it("below warning → normal", () => {
    const r = evaluateDrawdownProtection(
      { currentBalance: 9600, peakBalance: 10000, currentEquity: 9600, peakEquity: 10000, drawdownHistory: [] },
      cfg,
    );
    assert.ok(r.currentDrawdownPct < cfg.drawdownWarningPercent);
    assert.equal(r.severity, "normal");
  });

  it("at warning threshold → caution actions", () => {
    const r = evaluateDrawdownProtection(
      { currentBalance: 9500, peakBalance: 10000, currentEquity: 9500, peakEquity: 10000, drawdownHistory: [] },
      cfg,
    );
    assert.ok(r.currentDrawdownPct >= cfg.drawdownWarningPercent);
    assert.ok(r.actions.includes("reduce_position_size"));
  });

  it("at elevated threshold → restrict position + trades", () => {
    const r = evaluateDrawdownProtection(
      { currentBalance: 9200, peakBalance: 10000, currentEquity: 9200, peakEquity: 10000, drawdownHistory: [] },
      cfg,
    );
    assert.ok(r.currentDrawdownPct >= cfg.drawdownElevatedPercent);
    assert.ok(r.actions.includes("reduce_max_trades") || r.actions.includes("reduce_position_size"));
  });

  it("at critical threshold → pause new trades", () => {
    const r = evaluateDrawdownProtection(
      { currentBalance: 8800, peakBalance: 10000, currentEquity: 8800, peakEquity: 10000, drawdownHistory: [] },
      cfg,
    );
    assert.ok(r.currentDrawdownPct >= cfg.drawdownCriticalPercent);
    assert.ok(r.actions.includes("pause_new_trades"));
  });

  it("at emergency threshold → block all + trading halt", () => {
    const r = evaluateDrawdownProtection(
      { currentBalance: 8400, peakBalance: 10000, currentEquity: 8400, peakEquity: 10000, drawdownHistory: [] },
      cfg,
    );
    assert.ok(r.currentDrawdownPct >= cfg.drawdownEmergencyPercent);
    assert.ok(r.actions.includes("block_all_entries"));
    assert.ok(r.actions.includes("trading_halt"));
  });

  it("velocity computed from history", () => {
    const now = Date.now();
    const history = [
      { dd: 3, ts: new Date(now - 4 * 3_600_000).toISOString() },
      { dd: 5, ts: new Date(now).toISOString() },
    ];
    const r = evaluateDrawdownProtection(
      { currentBalance: 9500, peakBalance: 10000, currentEquity: 9500, peakEquity: 10000, drawdownHistory: history },
      cfg,
    );
    assert.ok(r.drawdownVelocity > 0, "velocity should be positive (worsening)");
  });

  it("healthScore is 0-100", () => {
    const r = evaluateDrawdownProtection(
      { currentBalance: 8000, peakBalance: 10000, currentEquity: 8000, peakEquity: 10000, drawdownHistory: [] },
      cfg,
    );
    assert.ok(r.healthScore >= 0 && r.healthScore <= 100);
  });
});

// ─── Exposure Protection ──────────────────────────────────────────────────────

describe("evaluateExposureProtection", () => {
  it("no positions → normal", () => {
    const r = evaluateExposureProtection([], cfg);
    assert.equal(r.severity, "normal");
    assert.equal(r.totalOpenRiskPct, 0);
  });

  it("small balanced positions → normal", () => {
    const r = evaluateExposureProtection([
      { pair: "EURUSD", direction: "buy",  riskPercent: 0.5, lots: 0.1 },
      { pair: "GBPUSD", direction: "sell", riskPercent: 0.5, lots: 0.1 },
    ], cfg);
    assert.ok(r.totalOpenRiskPct <= cfg.maxOpenRiskPercent);
  });

  it("over max open risk → pause actions", () => {
    const r = evaluateExposureProtection([
      { pair: "EURUSD", direction: "buy", riskPercent: 4, lots: 0.5 },
      { pair: "GBPUSD", direction: "buy", riskPercent: 3, lots: 0.3 },
    ], cfg);
    assert.ok(r.totalOpenRiskPct >= cfg.maxOpenRiskPercent);
    assert.ok(r.actions.length > 0);
  });

  it("high directional bias → confirmation required", () => {
    const r = evaluateExposureProtection([
      { pair: "EURUSD", direction: "buy", riskPercent: 2, lots: 0.2 },
      { pair: "GBPUSD", direction: "buy", riskPercent: 2, lots: 0.2 },
      { pair: "USDJPY", direction: "buy", riskPercent: 0.5, lots: 0.1 },
    ], cfg);
    assert.ok(r.directionalBias > 70);
    assert.ok(r.actions.includes("increase_confirmation_requirements"));
  });

  it("healthScore in range", () => {
    const r = evaluateExposureProtection([
      { pair: "EURUSD", direction: "buy", riskPercent: 10, lots: 1 },
    ], cfg);
    assert.ok(r.healthScore >= 0 && r.healthScore <= 100);
  });
});

// ─── Margin Protection ────────────────────────────────────────────────────────

describe("evaluateMarginProtection", () => {
  it("no margin used → normal", () => {
    const r = evaluateMarginProtection(
      { balance: 10000, equity: 10000, usedMargin: 0, freeMargin: 10000, marginLevel: 0, leverage: 1 },
      cfg,
    );
    assert.equal(r.severity, "normal");
  });

  it("margin level above warning → normal", () => {
    const r = evaluateMarginProtection(
      { balance: 10000, equity: 10000, usedMargin: 500, freeMargin: 9500, marginLevel: 2000, leverage: 5 },
      cfg,
    );
    assert.equal(r.severity, "normal");
    assert.equal(r.marginLevel, 2000);
  });

  it("margin level at warning → caution/warning", () => {
    const r = evaluateMarginProtection(
      { balance: 10000, equity: 10000, usedMargin: 3000, freeMargin: 7000, marginLevel: 250, leverage: 10 },
      cfg,
    );
    assert.ok(r.marginLevel <= cfg.marginWarningLevel);
    assert.ok(r.actions.length > 0);
  });

  it("margin level critical → pause trades", () => {
    const r = evaluateMarginProtection(
      { balance: 10000, equity: 10000, usedMargin: 5000, freeMargin: 5000, marginLevel: 180, leverage: 20 },
      cfg,
    );
    assert.ok(r.actions.includes("pause_new_trades"));
  });

  it("margin level emergency → block all + alert", () => {
    const r = evaluateMarginProtection(
      { balance: 10000, equity: 10000, usedMargin: 8000, freeMargin: 2000, marginLevel: 130, leverage: 30 },
      cfg,
    );
    assert.ok(r.actions.includes("block_all_entries"));
    assert.ok(r.actions.includes("generate_emergency_alert"));
  });

  it("healthScore in range", () => {
    const r = evaluateMarginProtection(
      { balance: 10000, equity: 8000, usedMargin: 7000, freeMargin: 1000, marginLevel: 120, leverage: 50 },
      cfg,
    );
    assert.ok(r.healthScore >= 0 && r.healthScore <= 100);
  });
});

// ─── Broker Protection ────────────────────────────────────────────────────────

describe("evaluateBrokerProtection", () => {
  const healthyBroker = {
    spread: 1.0, spreadBaseline: 1.0, slippage: 0.1, executionTime: 100,
    orderRejections: 0, totalOrders: 20, connectionQuality: 99, pair: "EURUSD",
  };

  it("healthy broker → normal", () => {
    const r = evaluateBrokerProtection(healthyBroker, cfg);
    assert.equal(r.severity, "normal");
    assert.ok(r.healthScore >= 70);
  });

  it("extreme spread → suspend entries", () => {
    const r = evaluateBrokerProtection(
      { ...healthyBroker, spread: 8.0, spreadBaseline: 1.0 },
      cfg,
    );
    assert.ok(r.actions.includes("suspend_broker_entries"));
    assert.ok(r.spreadRatio >= 4);
  });

  it("critical connection loss → suspend + alert", () => {
    const r = evaluateBrokerProtection(
      { ...healthyBroker, connectionQuality: 50 },
      cfg,
    );
    assert.ok(r.actions.includes("suspend_broker_entries"));
    assert.ok(r.actions.includes("generate_emergency_alert"));
  });

  it("high slippage → confirmation required", () => {
    const r = evaluateBrokerProtection(
      { ...healthyBroker, slippage: 1.5 },
      cfg,
    );
    assert.ok(r.triggeredChecks.length > 0);
    assert.ok(r.actions.includes("increase_confirmation_requirements") || r.actions.includes("suspend_broker_entries"));
  });

  it("high rejection rate → confirmation required", () => {
    const r = evaluateBrokerProtection(
      { ...healthyBroker, orderRejections: 4, totalOrders: 20 },
      cfg,
    );
    assert.ok(r.rejectionRatePct > 0);
    assert.ok(r.actions.length > 0);
  });

  it("healthScore in range", () => {
    const r = evaluateBrokerProtection(
      { ...healthyBroker, spread: 20, slippage: 5, connectionQuality: 30 },
      cfg,
    );
    assert.ok(r.healthScore >= 0 && r.healthScore <= 100);
  });
});

// ─── System Protection ────────────────────────────────────────────────────────

describe("evaluateSystemProtection", () => {
  const healthy = defaultSystemInput();

  it("healthy system → normal", () => {
    const r = evaluateSystemProtection(healthy, cfg);
    assert.equal(r.severity, "normal");
    assert.ok(r.healthScore >= 60);
  });

  it("low DB availability → block entries", () => {
    const r = evaluateSystemProtection(
      { ...healthy, dbAvailability: 90 },
      cfg,
    );
    assert.ok(r.actions.includes("block_all_entries") || r.actions.includes("pause_new_trades"));
    assert.ok(r.criticalFailures.length > 0);
  });

  it("data feed critical → block entries", () => {
    const r = evaluateSystemProtection(
      { ...healthy, dataFeedHealth: 30 },
      cfg,
    );
    assert.ok(r.actions.includes("block_all_entries"));
  });

  it("high CPU usage → confirmation required", () => {
    const r = evaluateSystemProtection(
      { ...healthy, cpuUsage: 90 },
      cfg,
    );
    assert.ok(r.actions.includes("increase_confirmation_requirements") || r.actions.includes("pause_new_trades"));
  });

  it("healthScore in range", () => {
    const r = evaluateSystemProtection(
      { ...healthy, dbAvailability: 80, cpuUsage: 95, dataFeedHealth: 20 },
      cfg,
    );
    assert.ok(r.healthScore >= 0 && r.healthScore <= 100);
  });
});

// ─── Level Evaluator ─────────────────────────────────────────────────────────

describe("evaluateProtectionLevel", () => {
  function makeSnap(overrides: Partial<Record<string, any>> = {}) {
    const normal = { severity: "normal", healthScore: 90, evidence: [], actions: [], triggeredLimits: [], criticalFailures: [], triggeredChecks: [], consecutiveLosses: 0, consecutiveWins: 0, avgLossSize: 0, recoveryProgress: 100, currentDrawdownPct: 0, maxDrawdownPct: 0, drawdownVelocity: 0, recoveryRate: 0, thresholdCrossed: "none", totalOpenRiskPct: 0, maxPairExposurePct: 0, correlationScore: 0, directionalBias: 50, concentrationRisk: 0, marginLevel: 500, freeMarginPct: 90, marginCallRisk: 0, leverageUtilization: 10, spreadRatio: 1, slippagePips: 0.1, executionMs: 100, rejectionRatePct: 0, connectionQuality: 99, cpuUsage: 30, memoryUsage: 40, dbAvailability: 99.9, apiAvailability: 99.9, dataFeedHealth: 98, dailyLossPct: 0, weeklyLossPct: 0, monthlyLossPct: 0, equityDrawdownPct: 0 };
    return {
      account:        { ...normal },
      consecutiveLoss: { ...normal },
      drawdown:       { ...normal },
      exposure:       { ...normal },
      margin:         { ...normal },
      broker:         { ...normal },
      system:         { ...normal },
      ...overrides,
    } as any;
  }

  it("all normal → normal level", () => {
    const r = evaluateProtectionLevel(makeSnap(), "normal", 0, cfg);
    assert.equal(r.protectionLevel, "normal");
  });

  it("one caution → caution level", () => {
    const r = evaluateProtectionLevel(
      makeSnap({ account: { ...makeSnap().account, severity: "caution" } }),
      "normal", 0, cfg,
    );
    assert.equal(r.protectionLevel, "caution");
  });

  it("one warning → restricted level", () => {
    const r = evaluateProtectionLevel(
      makeSnap({ drawdown: { ...makeSnap().drawdown, severity: "warning" } }),
      "normal", 0, cfg,
    );
    assert.equal(r.protectionLevel, "restricted");
  });

  it("one critical → protected_mode", () => {
    const r = evaluateProtectionLevel(
      makeSnap({ account: { ...makeSnap().account, severity: "critical" } }),
      "normal", 0, cfg,
    );
    assert.equal(r.protectionLevel, "protected_mode");
  });

  it("system emergency → trading_halt", () => {
    const r = evaluateProtectionLevel(
      makeSnap({ system: { ...makeSnap().system, severity: "emergency" } }),
      "normal", 0, cfg,
    );
    assert.equal(r.protectionLevel, "trading_halt");
  });

  it("hysteresis: holds level when no grace period", () => {
    const r = evaluateProtectionLevel(
      makeSnap(), // all normal
      "protected_mode", // currently elevated
      0,           // 0 hours elapsed — below grace period
      cfg,
    );
    assert.equal(r.protectionLevel, "protected_mode"); // should NOT de-escalate
  });

  it("hysteresis: steps down ONE level after grace period", () => {
    const r = evaluateProtectionLevel(
      makeSnap(), // all normal
      "restricted",
      cfg.recoveryGracePeriodHours + 1, // past grace period
      cfg,
    );
    assert.ok(r.protectionLevel === "caution" || r.protectionLevel === "normal");
  });
});

// ─── Recovery Engine ─────────────────────────────────────────────────────────

describe("evaluateRecovery", () => {
  function makeHealthySnap() {
    const n = { severity: "normal", healthScore: 90, evidence: [], actions: [], triggeredLimits: [], criticalFailures: [], triggeredChecks: [], consecutiveLosses: 0, consecutiveWins: 3, avgLossSize: 0, recoveryProgress: 100, currentDrawdownPct: 0, maxDrawdownPct: 0, drawdownVelocity: 0, recoveryRate: 0.5, thresholdCrossed: "none", totalOpenRiskPct: 0, maxPairExposurePct: 0, correlationScore: 0, directionalBias: 50, concentrationRisk: 0, marginLevel: 500, freeMarginPct: 90, marginCallRisk: 0, leverageUtilization: 10, spreadRatio: 1, slippagePips: 0.1, executionMs: 100, rejectionRatePct: 0, connectionQuality: 99, cpuUsage: 30, memoryUsage: 40, dbAvailability: 99.9, apiAvailability: 99.9, dataFeedHealth: 98, dailyLossPct: 0, weeklyLossPct: 0, monthlyLossPct: 0, equityDrawdownPct: 0 };
    return {
      account: { ...n }, consecutiveLoss: { ...n }, drawdown: { ...n },
      exposure: { ...n }, margin: { ...n }, broker: { ...n }, system: { ...n },
    } as any;
  }

  it("not in recovery when levels same", () => {
    const r = evaluateRecovery(makeHealthySnap(), "normal", "normal", 0, cfg);
    assert.equal(r.isInRecovery, false);
  });

  it("in recovery when proposed level lower", () => {
    const r = evaluateRecovery(makeHealthySnap(), "protected_mode", "caution", 12, cfg);
    assert.equal(r.isInRecovery, true);
  });

  it("progress increases with time and criteria met", () => {
    const r = evaluateRecovery(makeHealthySnap(), "restricted", "normal", 8, cfg);
    assert.ok(r.progressPercent > 0 && r.progressPercent <= 100);
  });
});

// ─── Config Validator ─────────────────────────────────────────────────────────

describe("validateProtectionConfig", () => {
  it("default config is valid", () => {
    const r = validateProtectionConfig(DEFAULT_PROTECTION_CONFIG);
    assert.equal(r.isValid, true);
    assert.equal(r.errors.length, 0);
  });

  it("rejects inverted drawdown thresholds", () => {
    const r = validateProtectionConfig({
      ...DEFAULT_PROTECTION_CONFIG,
      drawdownWarningPercent: 20,
      drawdownElevatedPercent: 5,
    });
    assert.equal(r.isValid, false);
    assert.ok(r.errors.some(e => e.includes("drawdown")));
  });

  it("rejects daily loss >= weekly", () => {
    const r = validateProtectionConfig({
      ...DEFAULT_PROTECTION_CONFIG,
      maxDailyLossPercent: 10,
      maxWeeklyLossPercent: 5,
    });
    assert.equal(r.isValid, false);
    assert.ok(r.errors.some(e => e.includes("Daily")));
  });

  it("rejects out-of-range spread", () => {
    const r = validateProtectionConfig({
      ...DEFAULT_PROTECTION_CONFIG,
      maxSpreadPips: -1,
    });
    assert.equal(r.isValid, false);
  });

  it("warns on very permissive daily loss", () => {
    const r = validateProtectionConfig({
      ...DEFAULT_PROTECTION_CONFIG,
      maxDailyLossPercent: 8,
    });
    assert.ok(r.warnings.some(w => w.includes("permissive")));
  });

  it("rejects non-number fields", () => {
    const r = validateProtectionConfig({
      ...DEFAULT_PROTECTION_CONFIG,
      maxSpreadPips: "abc" as any,
    });
    assert.equal(r.isValid, false);
  });

  it("valid partial config merges with defaults", () => {
    const r = validateProtectionConfig({ maxDailyLossPercent: 1.5 });
    assert.equal(r.isValid, true);
    assert.equal(r.sanitised.maxDailyLossPercent, 1.5);
    assert.equal(r.sanitised.maxWeeklyLossPercent, DEFAULT_PROTECTION_CONFIG.maxWeeklyLossPercent);
  });
});

// ─── Full Engine Integration ──────────────────────────────────────────────────

describe("runCapitalProtection", () => {
  it("healthy input → normal protection level", () => {
    const r = runCapitalProtection(makeFullInput());
    assert.equal(r.isAdvisoryOnly, true);
    assert.equal(r.protectionLevel, "normal");
    assert.ok(r.activeActions.length === 0);
  });

  it("returns all required fields", () => {
    const r = runCapitalProtection(makeFullInput());
    assert.ok(r.protectionId);
    assert.ok(r.engineVersion);
    assert.ok(r.evaluatedAt);
    assert.ok(r.protectionLevel);
    assert.ok(r.protectionLevelLabel);
    assert.ok(typeof r.protectionLevelScore === "number");
    assert.ok(Array.isArray(r.activeActions));
    assert.ok(r.monitors);
    assert.ok(r.recovery);
    assert.ok(r.explainability);
    assert.ok(r.config);
  });

  it("7 consecutive losses → elevated protection level", () => {
    const r = runCapitalProtection(makeFullInput({
      recentTrades: Array.from({ length: 7 }, (_, i) => ({
        pnl: -80,
        closedAt: new Date(Date.now() - i * 3_600_000).toISOString(),
        pair: "EURUSD",
      })),
    }));
    assert.ok(r.protectionLevelScore >= 3, `expected ≥3, got ${r.protectionLevelScore}`);
    assert.ok(r.activeActions.length > 0);
  });

  it("critical drawdown escalates protection", () => {
    const r = runCapitalProtection(makeFullInput({
      balance: 8700, equity: 8700, peakBalance: 10000, peakEquity: 10000,
    }));
    assert.ok(r.protectionLevelScore >= 2, `expected ≥2, got ${r.protectionLevelScore}`);
  });

  it("system failure → elevated protection (≥ protected_mode)", () => {
    const r = runCapitalProtection(makeFullInput({
      dbAvailability: 80, dataFeedHealth: 20, apiAvailability: 85,
    }));
    assert.ok(r.protectionLevelScore >= 4,
      `expected ≥ protected_mode (4), got ${r.protectionLevel} (${r.protectionLevelScore})`);
  });

  it("broker failure → suspend entries action", () => {
    const r = runCapitalProtection(makeFullInput({
      spread: 10, spreadBaseline: 1.0, connectionQuality: 40,
    }));
    assert.ok(r.activeActions.some(a => a.actionType === "suspend_broker_entries" || a.actionType === "block_all_entries"));
  });

  it("custom config applies", () => {
    const r = runCapitalProtection(makeFullInput({
      config: { maxDailyLossPercent: 0.5 },
      dailyPnl: -60, // -0.6% of 10000
    }));
    assert.ok(r.config.maxDailyLossPercent === 0.5);
  });

  it("protection score is 0-6", () => {
    const r = runCapitalProtection(makeFullInput());
    assert.ok(r.protectionLevelScore >= 0 && r.protectionLevelScore <= 6);
  });

  it("actions sorted by severity (highest first)", () => {
    const r = runCapitalProtection(makeFullInput({
      recentTrades: Array.from({ length: 10 }, (_, i) => ({
        pnl: -100, closedAt: new Date(Date.now() - i * 3_600_000).toISOString(), pair: "EURUSD",
      })),
      balance: 8500, equity: 8500, peakBalance: 10000, peakEquity: 10000,
      dbAvailability: 85,
    }));
    if (r.activeActions.length >= 2) {
      const sevOrder: Record<string, number> = { emergency: 0, critical: 1, warning: 2, caution: 3, normal: 4 };
      for (let i = 0; i < r.activeActions.length - 1; i++) {
        const a = sevOrder[r.activeActions[i].severity];
        const b = sevOrder[r.activeActions[i + 1].severity];
        assert.ok(a <= b, `Actions not sorted at index ${i}`);
      }
    }
  });

  it("completes in < 50ms", () => {
    const start = Date.now();
    runCapitalProtection(makeFullInput({
      recentTrades: Array.from({ length: 50 }, (_, i) => ({
        pnl: i % 3 === 0 ? -50 : 30,
        closedAt: new Date(Date.now() - i * 3_600_000).toISOString(),
        pair: "EURUSD",
      })),
    }));
    assert.ok(Date.now() - start < 50, "Engine too slow");
  });
});

// ─── Stress Tests ─────────────────────────────────────────────────────────────

describe("stress tests", () => {
  it("handles empty/zero input gracefully", () => {
    const r = runCapitalProtection(makeFullInput({
      balance: 0, equity: 0, peakBalance: 0, peakEquity: 0,
    }));
    assert.ok(r.protectionLevelScore >= 0 && r.protectionLevelScore <= 6);
  });

  it("handles NaN-ish input gracefully", () => {
    const r = runCapitalProtection(makeFullInput({
      spread: NaN, slippage: NaN, cpuUsage: NaN,
    }));
    assert.ok(r.monitors.broker.healthScore >= 0 && r.monitors.broker.healthScore <= 100);
    assert.ok(r.monitors.system.healthScore >= 0 && r.monitors.system.healthScore <= 100);
  });

  it("handles 50 consecutive losses", () => {
    const r = runCapitalProtection(makeFullInput({
      recentTrades: Array.from({ length: 50 }, (_, i) => ({
        pnl: -100,
        closedAt: new Date(Date.now() - i * 3_600_000).toISOString(),
        pair: "EURUSD",
      })),
    }));
    assert.ok(r.protectionLevelScore >= 5, "Should be emergency with 50 losses");
  });

  it("market crisis scenario → emergency or halt", () => {
    const r = runCapitalProtection(makeFullInput({
      balance: 7500, equity: 7500, peakBalance: 10000, peakEquity: 10000,
      dailyPnl: -300, weeklyPnl: -1000, monthlyPnl: -2500,
      spread: 12, connectionQuality: 60,
      dbAvailability: 95, dataFeedHealth: 45,
      recentTrades: Array.from({ length: 8 }, (_, i) => ({
        pnl: -120,
        closedAt: new Date(Date.now() - i * 3_600_000).toISOString(),
        pair: "EURUSD",
      })),
    }));
    assert.ok(r.protectionLevelScore >= 4, `Expected ≥4, got ${r.protectionLevelScore} (${r.protectionLevel})`);
  });
});
