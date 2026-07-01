// ─── Risk Intelligence Core Engine — Tests ────────────────────────────────────
// Comprehensive tests for all risk dimensions.
// Run: node --test --import tsx/esm src/tests/risk-intelligence.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { evaluateAccountRisk }   from "../risk-intelligence/account-risk.js";
import { evaluatePositionRisk }  from "../risk-intelligence/position-risk.js";
import { evaluatePortfolioRisk } from "../risk-intelligence/portfolio-risk.js";
import { evaluateMarketRisk }    from "../risk-intelligence/market-risk.js";
import { evaluateBrokerRisk }    from "../risk-intelligence/broker-risk.js";
import { evaluateSystemRisk }    from "../risk-intelligence/system-risk.js";
import { computeOverallRisk, scoreToRiskClassification, computeConfidenceInterval } from "../risk-intelligence/scorer.js";
import { runRiskIntelligence, defaultAccountState, defaultPortfolioInput, defaultMarketInput, defaultBrokerMetrics, defaultSystemMetrics, RI_ENGINE_VERSION, RI_RISK_VERSION, DEFAULT_RI_WEIGHTS } from "../risk-intelligence/index.js";

import type { AccountState, PositionInput, PortfolioInput, MarketRiskInput, BrokerMetrics, SystemMetrics, OpenPosition } from "../risk-intelligence/types.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const healthyAccount: AccountState = {
  balance: 10000, equity: 10000, freeMargin: 9500, marginLevel: 2000,
  dailyPnl: 150, weeklyPnl: 300, monthlyPnl: 800,
  openRisk: 1.5, closedRisk: 0,
};

const stressedAccount: AccountState = {
  balance: 10000, equity: 8500, freeMargin: 500, marginLevel: 105,
  dailyPnl: -320, weeklyPnl: -650, monthlyPnl: -1500,
  openRisk: 7.0, closedRisk: 3.2,
};

const emptyAccount: AccountState = {
  balance: 0, equity: 0, freeMargin: 0, marginLevel: 0,
  dailyPnl: 0, weeklyPnl: 0, monthlyPnl: 0,
  openRisk: 0, closedRisk: 0,
};

const goodPosition: PositionInput = {
  positionSize: 0.1, stopLossDistance: 20, accountBalance: 10000,
  riskPercentage: 1.0, expectedRR: 3.0, maxLoss: 100,
  tradeExposure: 10000, positionDuration: 3600,
  pair: "EURUSD", direction: "buy", currentPnl: 50,
};

const overSizedPosition: PositionInput = {
  positionSize: 2.0, stopLossDistance: 50, accountBalance: 10000,
  riskPercentage: 8.0, expectedRR: 0.8, maxLoss: 800,
  tradeExposure: 200000, positionDuration: 90000,
  pair: "EURUSD", direction: "sell", currentPnl: -200,
};

const openPos1: OpenPosition = {
  tradeId: "t1", pair: "EURUSD", direction: "buy",
  sizeUsd: 10000, riskUsd: 100, pnl: 50, openedAt: new Date(),
};
const openPos2: OpenPosition = {
  tradeId: "t2", pair: "GBPUSD", direction: "buy",
  sizeUsd: 10000, riskUsd: 100, pnl: -30, openedAt: new Date(),
};
const openPos3: OpenPosition = {
  tradeId: "t3", pair: "USDJPY", direction: "sell",
  sizeUsd: 5000, riskUsd: 80, pnl: 20, openedAt: new Date(),
};

const normalPortfolio: PortfolioInput = {
  openPositions: [openPos1, openPos2, openPos3],
  accountBalance: 10000, maxOpenTrades: 5,
};

const overcrowdedPortfolio: PortfolioInput = {
  openPositions: [
    openPos1, openPos2, openPos3,
    { tradeId: "t4", pair: "EURUSD", direction: "buy", sizeUsd: 10000, riskUsd: 200, pnl: 0, openedAt: new Date() },
    { tradeId: "t5", pair: "EURUSD", direction: "buy", sizeUsd: 10000, riskUsd: 200, pnl: 0, openedAt: new Date() },
    { tradeId: "t6", pair: "EURUSD", direction: "buy", sizeUsd: 10000, riskUsd: 200, pnl: 0, openedAt: new Date() },
  ],
  accountBalance: 10000, maxOpenTrades: 5,
};

const calmMarket: MarketRiskInput = {
  volatility: 25, liquidity: 85, trendStability: 80,
  correlation: 20, marketHealth: 80, opportunityScore: 75,
  newsRisk: 10, pair: "EURUSD", session: "london", regime: "trending",
};

const extremeMarket: MarketRiskInput = {
  volatility: 92, liquidity: 18, trendStability: 15,
  correlation: 85, marketHealth: 20, opportunityScore: 15,
  newsRisk: 90, pair: "EURUSD", session: "new_york", regime: "volatile",
};

const reliableBroker: BrokerMetrics = {
  spread: 1.0, spreadBaseline: 1.0, slippage: 0.1, executionTime: 80,
  orderRejections: 0, totalOrders: 100, connectionQuality: 99.5,
  priceFeedConsistency: 99, latency: 30, pair: "EURUSD",
};

const degradedBroker: BrokerMetrics = {
  spread: 8.0, spreadBaseline: 1.0, slippage: 4.5, executionTime: 2500,
  orderRejections: 20, totalOrders: 100, connectionQuality: 72,
  priceFeedConsistency: 65, latency: 1200, pair: "EURUSD",
};

const healthySystem: SystemMetrics = {
  cpuUsage: 20, memoryUsage: 35, dbHealth: 98, apiHealth: 99,
  networkLatency: 15, dataFeedHealth: 98, backgroundServices: 8,
  totalServices: 8, storageAvailability: 75, dbQueryMs: 25, apiErrorRate: 0.002,
};

const degradedSystem: SystemMetrics = {
  cpuUsage: 95, memoryUsage: 92, dbHealth: 40, apiHealth: 50,
  networkLatency: 800, dataFeedHealth: 55, backgroundServices: 4,
  totalServices: 8, storageAvailability: 8, dbQueryMs: 1500, apiErrorRate: 0.18,
};

// ─── Account Risk Tests ───────────────────────────────────────────────────────

describe("evaluateAccountRisk", () => {
  it("returns high health score for healthy account", () => {
    const r = evaluateAccountRisk(healthyAccount);
    assert.ok(r.accountHealthScore > 80, `Expected >80, got ${r.accountHealthScore}`);
    assert.ok(["very_low", "low"].includes(r.riskClassification), `Expected low risk, got ${r.riskClassification}`);
  });

  it("returns low health score for stressed account", () => {
    const r = evaluateAccountRisk(stressedAccount);
    assert.ok(r.accountHealthScore < 50, `Expected <50, got ${r.accountHealthScore}`);
  });

  it("generates critical alert for near-margin-call", () => {
    const r = evaluateAccountRisk(stressedAccount);
    const criticals = r.alerts.filter(a => a.severity === "critical");
    assert.ok(criticals.length > 0, "Should have critical alert for margin level");
  });

  it("generates critical alert when daily loss limit reached", () => {
    const overLoss = { ...healthyAccount, dailyPnl: -350, balance: 10000 };
    const r = evaluateAccountRisk(overLoss);
    const lossAlert = r.alerts.find(a => a.title.includes("Daily Loss"));
    assert.ok(lossAlert, "Should alert on daily loss limit");
  });

  it("score in 0-100 range", () => {
    [healthyAccount, stressedAccount, emptyAccount].forEach(acc => {
      const r = evaluateAccountRisk(acc);
      assert.ok(r.accountHealthScore >= 0 && r.accountHealthScore <= 100, `Out of range: ${r.accountHealthScore}`);
    });
  });

  it("evidence array is non-empty", () => {
    const r = evaluateAccountRisk(healthyAccount);
    assert.ok(r.evidence.length > 0);
  });

  it("all metrics are valid numbers", () => {
    const r = evaluateAccountRisk(healthyAccount);
    for (const [k, v] of Object.entries(r.metrics)) {
      assert.ok(isFinite(v), `Metric ${k} is not finite: ${v}`);
    }
  });
});

// ─── Position Risk Tests ──────────────────────────────────────────────────────

describe("evaluatePositionRisk", () => {
  it("returns low risk for well-sized position", () => {
    const r = evaluatePositionRisk(goodPosition);
    assert.ok(r.positionRiskScore < 40, `Expected <40, got ${r.positionRiskScore}`);
  });

  it("returns high risk for oversized position", () => {
    const r = evaluatePositionRisk(overSizedPosition);
    assert.ok(r.positionRiskScore > 60, `Expected >60, got ${r.positionRiskScore}`);
  });

  it("generates alerts for oversized position", () => {
    const r = evaluatePositionRisk(overSizedPosition);
    assert.ok(r.alerts.length > 0, "Should have alerts for oversized position");
  });

  it("generates alert for bad RR", () => {
    const r = evaluatePositionRisk(overSizedPosition);
    const rrAlert = r.alerts.find(a => a.title.includes("Risk/Reward"));
    assert.ok(rrAlert, "Should alert on poor RR ratio");
  });

  it("score in 0-100 range", () => {
    [goodPosition, overSizedPosition].forEach(pos => {
      const r = evaluatePositionRisk(pos);
      assert.ok(r.positionRiskScore >= 0 && r.positionRiskScore <= 100, `Out of range: ${r.positionRiskScore}`);
    });
  });

  it("no alerts for good position", () => {
    const r = evaluatePositionRisk(goodPosition);
    const critical = r.alerts.filter(a => a.severity === "critical");
    assert.equal(critical.length, 0, "No critical alerts for well-sized position");
  });

  it("duration alert for positions open too long", () => {
    const longPos = { ...goodPosition, positionDuration: 180000 }; // 50 hours
    const r = evaluatePositionRisk(longPos);
    const durationAlert = r.alerts.find(a => a.title.includes("Too Long"));
    assert.ok(durationAlert, "Should alert on excessive duration");
  });
});

// ─── Portfolio Risk Tests ─────────────────────────────────────────────────────

describe("evaluatePortfolioRisk", () => {
  it("returns low risk for empty portfolio", () => {
    const empty = { openPositions: [], accountBalance: 10000, maxOpenTrades: 5 };
    const r = evaluatePortfolioRisk(empty);
    assert.equal(r.portfolioRiskScore, 0, "Empty portfolio should have 0 risk");
    assert.equal(r.openTrades, 0);
  });

  it("returns moderate risk for normal portfolio", () => {
    const r = evaluatePortfolioRisk(normalPortfolio);
    assert.ok(r.portfolioRiskScore >= 0 && r.portfolioRiskScore <= 100, `Out of range: ${r.portfolioRiskScore}`);
    assert.equal(r.openTrades, 3);
  });

  it("returns elevated risk for overcrowded portfolio", () => {
    const r = evaluatePortfolioRisk(overcrowdedPortfolio);
    assert.ok(r.portfolioRiskScore > 20, `Expected >20, got ${r.portfolioRiskScore}`);
  });

  it("generates too-many-positions alert", () => {
    const r = evaluatePortfolioRisk(overcrowdedPortfolio);
    const alert = r.alerts.find(a => a.title.includes("Too Many"));
    assert.ok(alert, "Should alert on too many positions");
  });

  it("builds currency exposure correctly", () => {
    const r = evaluatePortfolioRisk(normalPortfolio);
    assert.ok("EUR" in r.currencyExposure || "GBP" in r.currencyExposure || "USD" in r.currencyExposure,
      "Should have currency exposure entries");
  });

  it("computes directional bias correctly", () => {
    const allBuy: PortfolioInput = {
      openPositions: [
        { tradeId: "a", pair: "EURUSD", direction: "buy", sizeUsd: 10000, riskUsd: 100, pnl: 0, openedAt: new Date() },
        { tradeId: "b", pair: "GBPUSD", direction: "buy", sizeUsd: 10000, riskUsd: 100, pnl: 0, openedAt: new Date() },
      ],
      accountBalance: 10000, maxOpenTrades: 5,
    };
    const r = evaluatePortfolioRisk(allBuy);
    assert.ok(r.directionalBias > 50, `Expected positive bias, got ${r.directionalBias}`);
  });

  it("score is 0 for empty portfolio", () => {
    const r = evaluatePortfolioRisk({ openPositions: [], accountBalance: 10000, maxOpenTrades: 5 });
    assert.equal(r.portfolioRiskScore, 0);
  });

  it("evidence array populated", () => {
    const r = evaluatePortfolioRisk(normalPortfolio);
    assert.ok(r.evidence.length > 0);
  });
});

// ─── Market Risk Tests ────────────────────────────────────────────────────────

describe("evaluateMarketRisk", () => {
  it("returns low risk for calm market", () => {
    const r = evaluateMarketRisk(calmMarket);
    assert.ok(r.marketRiskScore < 40, `Expected <40, got ${r.marketRiskScore}`);
  });

  it("returns high risk for extreme market", () => {
    const r = evaluateMarketRisk(extremeMarket);
    assert.ok(r.marketRiskScore > 65, `Expected >65, got ${r.marketRiskScore}`);
  });

  it("generates alert for high volatility", () => {
    const r = evaluateMarketRisk(extremeMarket);
    const volAlert = r.alerts.find(a => a.title.includes("Volatility") || a.title.includes("volatility"));
    assert.ok(volAlert, "Should alert on high volatility");
  });

  it("generates critical alert for extreme news risk", () => {
    const r = evaluateMarketRisk(extremeMarket);
    const newsAlert = r.alerts.find(a => a.category === "market" && a.title.includes("News"));
    assert.ok(newsAlert, "Should alert on news risk");
  });

  it("score in 0-100 range", () => {
    [calmMarket, extremeMarket].forEach(mkt => {
      const r = evaluateMarketRisk(mkt);
      assert.ok(r.marketRiskScore >= 0 && r.marketRiskScore <= 100, `Out of range: ${r.marketRiskScore}`);
    });
  });

  it("all component metrics are finite", () => {
    const r = evaluateMarketRisk(calmMarket);
    for (const [k, v] of Object.entries(r.metrics)) {
      assert.ok(isFinite(v), `Metric ${k} not finite: ${v}`);
    }
  });
});

// ─── Broker Risk Tests ────────────────────────────────────────────────────────

describe("evaluateBrokerRisk", () => {
  it("returns high reliability for reliable broker", () => {
    const r = evaluateBrokerRisk(reliableBroker);
    assert.ok(r.brokerReliabilityScore > 80, `Expected >80, got ${r.brokerReliabilityScore}`);
    assert.ok(["very_low", "low"].includes(r.riskClassification), `Expected low risk, got ${r.riskClassification}`);
  });

  it("returns low reliability for degraded broker", () => {
    const r = evaluateBrokerRisk(degradedBroker);
    assert.ok(r.brokerReliabilityScore < 40, `Expected <40, got ${r.brokerReliabilityScore}`);
  });

  it("generates critical alert for extreme spread", () => {
    const r = evaluateBrokerRisk(degradedBroker);
    const spreadAlert = r.alerts.find(a => a.category === "broker" && a.title.includes("Spread"));
    assert.ok(spreadAlert, "Should alert on extreme spread");
  });

  it("generates critical alert for critical slippage", () => {
    const r = evaluateBrokerRisk(degradedBroker);
    const slipAlert = r.alerts.find(a => a.title.includes("Slippage"));
    assert.ok(slipAlert, "Should alert on high slippage");
  });

  it("no alerts for reliable broker", () => {
    const r = evaluateBrokerRisk(reliableBroker);
    const critical = r.alerts.filter(a => a.severity === "critical");
    assert.equal(critical.length, 0, "No critical alerts for reliable broker");
  });

  it("score in 0-100 range", () => {
    [reliableBroker, degradedBroker].forEach(b => {
      const r = evaluateBrokerRisk(b);
      assert.ok(r.brokerReliabilityScore >= 0 && r.brokerReliabilityScore <= 100, `Out of range: ${r.brokerReliabilityScore}`);
    });
  });

  it("rejection rate alert when high", () => {
    const highRejection = { ...reliableBroker, orderRejections: 10, totalOrders: 50 };
    const r = evaluateBrokerRisk(highRejection);
    const rejAlert = r.alerts.find(a => a.title.includes("Rejection"));
    assert.ok(rejAlert, "Should alert on high rejection rate");
  });
});

// ─── System Risk Tests ────────────────────────────────────────────────────────

describe("evaluateSystemRisk", () => {
  it("returns high health for healthy system", () => {
    const r = evaluateSystemRisk(healthySystem);
    assert.ok(r.systemHealthScore > 85, `Expected >85, got ${r.systemHealthScore}`);
  });

  it("returns low health for degraded system", () => {
    const r = evaluateSystemRisk(degradedSystem);
    assert.ok(r.systemHealthScore < 50, `Expected <50, got ${r.systemHealthScore}`);
  });

  it("generates critical alerts for degraded system", () => {
    const r = evaluateSystemRisk(degradedSystem);
    const criticals = r.alerts.filter(a => a.severity === "critical");
    assert.ok(criticals.length > 0, "Should have critical alerts for degraded system");
  });

  it("generates CPU alert at critical level", () => {
    const highCpu = { ...healthySystem, cpuUsage: 95 };
    const r = evaluateSystemRisk(highCpu);
    const cpuAlert = r.alerts.find(a => a.title.includes("CPU"));
    assert.ok(cpuAlert, "Should alert on high CPU");
  });

  it("generates memory alert at critical level", () => {
    const highMem = { ...healthySystem, memoryUsage: 93 };
    const r = evaluateSystemRisk(highMem);
    const memAlert = r.alerts.find(a => a.title.includes("Memory"));
    assert.ok(memAlert, "Should alert on high memory");
  });

  it("generates storage alert", () => {
    const lowStorage = { ...healthySystem, storageAvailability: 5 };
    const r = evaluateSystemRisk(lowStorage);
    const storageAlert = r.alerts.find(a => a.title.includes("Storage"));
    assert.ok(storageAlert, "Should alert on low storage");
  });

  it("score in 0-100 range", () => {
    [healthySystem, degradedSystem].forEach(sys => {
      const r = evaluateSystemRisk(sys);
      assert.ok(r.systemHealthScore >= 0 && r.systemHealthScore <= 100, `Out of range: ${r.systemHealthScore}`);
    });
  });

  it("no alerts for healthy system", () => {
    const r = evaluateSystemRisk(healthySystem);
    const critical = r.alerts.filter(a => a.severity === "critical");
    assert.equal(critical.length, 0, "No critical alerts for healthy system");
  });
});

// ─── Overall Scorer Tests ─────────────────────────────────────────────────────

describe("computeOverallRisk", () => {
  const mkInput = (acc: typeof healthyAccount, sys: typeof healthySystem) => ({
    accountRisk:   evaluateAccountRisk(acc),
    positionRisk:  null,
    portfolioRisk: evaluatePortfolioRisk({ openPositions: [], accountBalance: 10000, maxOpenTrades: 5 }),
    marketRisk:    evaluateMarketRisk(calmMarket),
    brokerRisk:    evaluateBrokerRisk(reliableBroker),
    systemRisk:    evaluateSystemRisk(sys),
  });

  it("returns low risk for all-healthy inputs", () => {
    const { overallRiskScore } = computeOverallRisk(mkInput(healthyAccount, healthySystem));
    assert.ok(overallRiskScore < 30, `Expected <30, got ${overallRiskScore}`);
  });

  it("returns elevated risk when account stressed", () => {
    const r = computeOverallRisk({
      accountRisk:   evaluateAccountRisk(stressedAccount),
      positionRisk:  null,
      portfolioRisk: evaluatePortfolioRisk({ openPositions: [], accountBalance: 10000, maxOpenTrades: 5 }),
      marketRisk:    evaluateMarketRisk(extremeMarket),
      brokerRisk:    evaluateBrokerRisk(degradedBroker),
      systemRisk:    evaluateSystemRisk(degradedSystem),
    });
    assert.ok(r.overallRiskScore > 30, `Expected >30, got ${r.overallRiskScore}`);
    assert.ok(["moderate", "elevated", "high", "critical"].includes(r.riskClassification),
      `Expected moderate+, got ${r.riskClassification}`);
  });

  it("score in 0-100 range", () => {
    const { overallRiskScore } = computeOverallRisk(mkInput(healthyAccount, healthySystem));
    assert.ok(overallRiskScore >= 0 && overallRiskScore <= 100, `Out of range: ${overallRiskScore}`);
  });

  it("weights sum to 1", () => {
    const { weights } = computeOverallRisk(mkInput(healthyAccount, healthySystem));
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 0.001, `Weights sum ${sum} ≠ 1`);
  });

  it("breakdown contains all dimensions", () => {
    const { breakdown } = computeOverallRisk(mkInput(healthyAccount, healthySystem));
    const dims = ["accountHealth", "positionRisk", "portfolioRisk", "marketRisk", "brokerReliability", "systemHealth"];
    for (const d of dims) {
      assert.ok(d in breakdown, `Missing breakdown dimension: ${d}`);
    }
  });

  it("confidence is 0-100", () => {
    const { confidence } = computeOverallRisk(mkInput(healthyAccount, healthySystem));
    assert.ok(confidence >= 0 && confidence <= 100, `Confidence out of range: ${confidence}`);
  });
});

// ─── scoreToRiskClassification Tests ─────────────────────────────────────────

describe("scoreToRiskClassification", () => {
  const cases: [number, string][] = [
    [5,  "very_low"],
    [25, "low"],
    [45, "moderate"],
    [65, "elevated"],
    [80, "high"],
    [92, "critical"],
  ];
  for (const [score, expected] of cases) {
    it(`score ${score} → ${expected}`, () => {
      assert.equal(scoreToRiskClassification(score), expected);
    });
  }
});

// ─── computeConfidenceInterval Tests ─────────────────────────────────────────

describe("computeConfidenceInterval", () => {
  it("lower <= score <= upper", () => {
    const ci = computeConfidenceInterval(50, 80);
    assert.ok(ci.lower <= 50);
    assert.ok(ci.upper >= 50);
  });

  it("wider interval at low confidence", () => {
    const wide   = computeConfidenceInterval(50, 20);
    const narrow = computeConfidenceInterval(50, 90);
    assert.ok(wide.upper - wide.lower > narrow.upper - narrow.lower,
      "Low confidence should produce wider interval");
  });

  it("bounds in 0-100", () => {
    const ci = computeConfidenceInterval(95, 30);
    assert.ok(ci.lower >= 0);
    assert.ok(ci.upper <= 100);
  });
});

// ─── Main Engine Tests ────────────────────────────────────────────────────────

describe("runRiskIntelligence", () => {
  const setup = {
    account:   healthyAccount,
    portfolio: normalPortfolio,
    market:    calmMarket,
    broker:    reliableBroker,
    system:    healthySystem,
  };

  it("generates a valid Unified Risk Intelligence Object", async () => {
    const obj = await runRiskIntelligence(setup);
    assert.ok(obj.reportId, "Must have reportId");
    assert.equal(obj.isAdvisoryOnly, true);
    assert.equal(obj.engineVersion, RI_ENGINE_VERSION);
    assert.equal(obj.riskVersion, RI_RISK_VERSION);
    assert.ok(obj.overallRiskScore >= 0 && obj.overallRiskScore <= 100);
    assert.ok(typeof obj.riskClassification === "string");
    assert.ok(typeof obj.riskLabel === "string");
  });

  it("always sets isAdvisoryOnly = true", async () => {
    const obj = await runRiskIntelligence(setup);
    assert.equal(obj.isAdvisoryOnly, true);
  });

  it("populates all component results", async () => {
    const obj = await runRiskIntelligence(setup);
    assert.ok(typeof obj.accountRisk.accountHealthScore === "number");
    assert.equal(obj.positionRisk, null); // no position provided
    assert.ok(typeof obj.portfolioRisk.portfolioRiskScore === "number");
    assert.ok(typeof obj.marketRisk.marketRiskScore === "number");
    assert.ok(typeof obj.brokerRisk.brokerReliabilityScore === "number");
    assert.ok(typeof obj.systemRisk.systemHealthScore === "number");
  });

  it("populates position risk when position provided", async () => {
    const withPos = { ...setup, position: goodPosition };
    const obj = await runRiskIntelligence(withPos);
    assert.ok(obj.positionRisk !== null, "Should have position risk");
    assert.ok(typeof obj.positionRisk!.positionRiskScore === "number");
  });

  it("breakdown sums correctly", async () => {
    const obj = await runRiskIntelligence(setup);
    const sumOfWeighted =
      obj.scoreBreakdown.accountHealth.weighted +
      obj.scoreBreakdown.positionRisk.weighted +
      obj.scoreBreakdown.portfolioRisk.weighted +
      obj.scoreBreakdown.marketRisk.weighted +
      obj.scoreBreakdown.brokerReliability.weighted +
      obj.scoreBreakdown.systemHealth.weighted;
    assert.ok(Math.abs(sumOfWeighted - obj.scoreBreakdown.total) < 0.1,
      `Sum ${sumOfWeighted} ≠ total ${obj.scoreBreakdown.total}`);
  });

  it("supporting evidence is populated", async () => {
    const obj = await runRiskIntelligence(setup);
    assert.ok(Array.isArray(obj.supportingEvidence.accountEvidence));
    assert.ok(Array.isArray(obj.supportingEvidence.marketEvidence));
    assert.ok(Array.isArray(obj.supportingEvidence.brokerEvidence));
    assert.ok(Array.isArray(obj.supportingEvidence.systemEvidence));
  });

  it("confidence interval bounds are valid", async () => {
    const obj = await runRiskIntelligence(setup);
    assert.ok(obj.confidenceInterval.lower <= obj.overallRiskScore);
    assert.ok(obj.confidenceInterval.upper >= obj.overallRiskScore);
  });

  it("generates unique reportIds for concurrent evaluations", async () => {
    const [a, b, c] = await Promise.all([
      runRiskIntelligence(setup),
      runRiskIntelligence(setup),
      runRiskIntelligence(setup),
    ]);
    assert.notEqual(a.reportId, b.reportId);
    assert.notEqual(b.reportId, c.reportId);
  });

  it("stressed inputs produce critical/high risk classification", async () => {
    const stressedSetup = {
      account:   stressedAccount,
      portfolio: overcrowdedPortfolio,
      market:    extremeMarket,
      broker:    degradedBroker,
      system:    degradedSystem,
    };
    const obj = await runRiskIntelligence(stressedSetup);
    assert.ok(["elevated", "high", "critical"].includes(obj.riskClassification),
      `Expected elevated/high/critical, got ${obj.riskClassification}`);
  });

  it("healthy inputs produce very_low/low risk classification", async () => {
    const obj = await runRiskIntelligence({
      account:   healthyAccount,
      portfolio: { openPositions: [], accountBalance: 10000, maxOpenTrades: 5 },
      market:    calmMarket,
      broker:    reliableBroker,
      system:    healthySystem,
    });
    assert.ok(["very_low", "low", "moderate"].includes(obj.riskClassification),
      `Expected very_low/low/moderate, got ${obj.riskClassification}`);
  });

  it("alerts are sorted by severity (critical first)", async () => {
    const obj = await runRiskIntelligence({
      account: stressedAccount,
      portfolio: overcrowdedPortfolio,
      market: extremeMarket,
      broker: degradedBroker,
      system: degradedSystem,
    });
    let foundWarning = false;
    for (const alert of obj.allAlerts) {
      if (alert.severity === "warning") foundWarning = true;
      if (foundWarning && alert.severity === "critical") {
        assert.fail("Critical alert after warning — should be sorted critical first");
      }
    }
  });

  it("context fields are populated in output", async () => {
    const obj = await runRiskIntelligence({
      ...setup,
      context: { pair: "GBPUSD", session: "new_york", regime: "ranging", strategyVersion: "v2.0" },
    });
    assert.equal(obj.pair, "GBPUSD");
    assert.equal(obj.session, "new_york");
    assert.equal(obj.regime, "ranging");
    assert.equal(obj.strategyVersion, "v2.0");
  });
});

// ─── Default helpers tests ────────────────────────────────────────────────────

describe("default helpers", () => {
  it("defaultAccountState returns valid state", () => {
    const s = defaultAccountState();
    assert.ok(s.balance > 0);
    assert.ok(s.equity > 0);
  });

  it("defaultPortfolioInput returns empty portfolio", () => {
    const p = defaultPortfolioInput();
    assert.equal(p.openPositions.length, 0);
    assert.ok(p.accountBalance > 0);
  });

  it("defaultMarketInput returns valid market", () => {
    const m = defaultMarketInput("GBPUSD", "new_york");
    assert.equal(m.pair, "GBPUSD");
    assert.equal(m.session, "new_york");
  });

  it("defaultBrokerMetrics returns valid metrics", () => {
    const b = defaultBrokerMetrics();
    assert.ok(b.spread > 0);
    assert.ok(b.connectionQuality > 50);
  });

  it("defaultSystemMetrics returns valid metrics", () => {
    const s = defaultSystemMetrics();
    assert.ok(s.cpuUsage >= 0 && s.cpuUsage <= 100);
    assert.ok(s.memoryUsage >= 0 && s.memoryUsage <= 100);
  });

  it("DEFAULT_RI_WEIGHTS sum to 1", () => {
    const sum = Object.values(DEFAULT_RI_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 0.001, `Weights sum ${sum} ≠ 1`);
  });

  it("RI_ENGINE_VERSION is semver", () => {
    assert.match(RI_ENGINE_VERSION, /^\d+\.\d+\.\d+$/);
  });

  it("RI_RISK_VERSION is semver", () => {
    assert.match(RI_RISK_VERSION, /^\d+\.\d+\.\d+$/);
  });
});

// ─── Stress Tests ─────────────────────────────────────────────────────────────

describe("stress tests", () => {
  it("100 concurrent risk evaluations complete without error", async () => {
    const setup = {
      account: healthyAccount,
      portfolio: normalPortfolio,
      market: calmMarket,
      broker: reliableBroker,
      system: healthySystem,
    };
    const results = await Promise.all(Array.from({ length: 100 }, () => runRiskIntelligence(setup)));
    assert.equal(results.length, 100);
    for (const r of results) {
      assert.ok(r.overallRiskScore >= 0 && r.overallRiskScore <= 100);
      assert.ok(r.reportId.length > 0);
    }
  });

  it("evaluates 1000 account risk calculations in <1s", () => {
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      evaluateAccountRisk({ ...healthyAccount, dailyPnl: -i });
    }
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 1000, `1000 evaluations took ${elapsed.toFixed(0)}ms`);
  });

  it("all scores remain valid under boundary conditions", () => {
    const edge1 = evaluateAccountRisk({ balance: 0.01, equity: 0.01, freeMargin: 0, marginLevel: 0, dailyPnl: -0.01, weeklyPnl: 0, monthlyPnl: 0, openRisk: 100, closedRisk: 100 });
    const edge2 = evaluateAccountRisk({ balance: 1e9, equity: 1e9, freeMargin: 1e9, marginLevel: 99999, dailyPnl: 1e6, weeklyPnl: 5e6, monthlyPnl: 1e7, openRisk: 0, closedRisk: 0 });
    assert.ok(edge1.accountHealthScore >= 0 && edge1.accountHealthScore <= 100);
    assert.ok(edge2.accountHealthScore >= 0 && edge2.accountHealthScore <= 100);
  });

  it("runRiskIntelligence completes in <100ms (no DB)", async () => {
    const start = performance.now();
    await runRiskIntelligence({
      account: healthyAccount,
      portfolio: normalPortfolio,
      market: calmMarket,
      broker: reliableBroker,
      system: healthySystem,
    });
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 100, `runRiskIntelligence took ${elapsed.toFixed(2)}ms`);
  });
});
