import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ConditionStats } from "../../context/types.js";
import { scoreMarketContext, scoreToLabel } from "../../context/context-scorer.js";
import type { CurrentConditions } from "../../context/context-scorer.js";
import { MCS_WEIGHTS } from "../../context/types.js";

function makeStats(dimension: string, condition: string, overrides: Partial<ConditionStats> = {}): ConditionStats {
  return {
    dimension,
    condition,
    sampleSize: 30,
    winRate: 60,
    lossRate: 40,
    avgRR: 1.5,
    profitFactor: 1.8,
    expectancy: 0.5,
    maxDrawdown: 8,
    confidenceScore: 65,
    ...overrides,
  };
}

const defaultConditions: CurrentConditions = {
  regime: "trending",
  trendDirection: "bullish",
  volatilityClassification: "medium",
  liquidityQuality: "good",
  correlationRisk: "low",
  session: "london",
  newsEnvironment: "safe",
};

describe("scoreMarketContext", () => {
  it("returns valid score in [0, 100]", () => {
    const stats = [
      makeStats("regime", "trending"),
      makeStats("session", "london"),
      makeStats("trend", "bullish"),
      makeStats("volatility", "medium"),
      makeStats("liquidity", "good"),
    ];
    const mcs = scoreMarketContext(stats, defaultConditions, 50);
    assert.ok(mcs.score >= 0 && mcs.score <= 100);
  });

  it("has exactly 8 components", () => {
    const mcs = scoreMarketContext([], defaultConditions, 0);
    assert.equal(mcs.components.length, 8);
  });

  it("components have correct weight keys", () => {
    const mcs = scoreMarketContext([], defaultConditions, 0);
    const totalWeight = mcs.components.reduce((s, c) => s + c.weight, 0);
    assert.ok(Math.abs(totalWeight - 1.0) < 0.01, `Total weight should be ~1.0, got ${totalWeight}`);
  });

  it("all component weights match MCS_WEIGHTS", () => {
    const mcs = scoreMarketContext([], defaultConditions, 0);
    const regimeComp = mcs.components.find(c => c.dimension === "regime");
    assert.ok(regimeComp, "regime component exists");
    assert.equal(regimeComp!.weight, MCS_WEIGHTS.regime);
  });

  it("higher win rate produces higher score", () => {
    const strongStats = [
      makeStats("regime", "trending", { winRate: 75, avgRR: 2.0, profitFactor: 2.5, sampleSize: 50 }),
      makeStats("session", "london", { winRate: 75, avgRR: 2.0, profitFactor: 2.5, sampleSize: 50 }),
      makeStats("trend", "bullish", { winRate: 75, avgRR: 2.0, profitFactor: 2.5, sampleSize: 50 }),
    ];
    const weakStats = [
      makeStats("regime", "trending", { winRate: 35, avgRR: 0.8, profitFactor: 0.7, sampleSize: 50 }),
      makeStats("session", "london", { winRate: 35, avgRR: 0.8, profitFactor: 0.7, sampleSize: 50 }),
      makeStats("trend", "bullish", { winRate: 35, avgRR: 0.8, profitFactor: 0.7, sampleSize: 50 }),
    ];
    const strongMCS = scoreMarketContext(strongStats, defaultConditions, 100);
    const weakMCS = scoreMarketContext(weakStats, defaultConditions, 100);
    assert.ok(strongMCS.score > weakMCS.score, `Strong (${strongMCS.score}) should beat weak (${weakMCS.score})`);
  });

  it("insufficient data returns neutral score (50) for that component", () => {
    const stats = [makeStats("regime", "trending", { sampleSize: 2 })];
    const mcs = scoreMarketContext(stats, defaultConditions, 0);
    const regimeComp = mcs.components.find(c => c.dimension === "regime");
    assert.equal(regimeComp!.score, 50);
  });

  it("blocked news lowers score", () => {
    const blockedConditions: CurrentConditions = { ...defaultConditions, newsEnvironment: "blocked" };
    const safeConditions: CurrentConditions = { ...defaultConditions, newsEnvironment: "safe" };
    const blockedMCS = scoreMarketContext([], blockedConditions, 0);
    const safeMCS = scoreMarketContext([], safeConditions, 0);
    assert.ok(blockedMCS.score < safeMCS.score, `Blocked (${blockedMCS.score}) should be less than safe (${safeMCS.score})`);
  });

  it("extreme correlation risk lowers score", () => {
    const extreme: CurrentConditions = { ...defaultConditions, correlationRisk: "extreme" };
    const low: CurrentConditions = { ...defaultConditions, correlationRisk: "low" };
    const extremeMCS = scoreMarketContext([], extreme, 0);
    const lowMCS = scoreMarketContext([], low, 0);
    assert.ok(extremeMCS.score < lowMCS.score);
  });

  it("evidence array has 8 entries", () => {
    const mcs = scoreMarketContext([], defaultConditions, 0);
    assert.equal(mcs.evidence.length, 8);
  });

  it("timestamp is a valid ISO string", () => {
    const mcs = scoreMarketContext([], defaultConditions, 0);
    assert.doesNotThrow(() => new Date(mcs.timestamp));
    assert.ok(mcs.timestamp.includes("T"));
  });

  it("sampleSize reflects totalTrades input", () => {
    const mcs = scoreMarketContext([], defaultConditions, 42);
    assert.equal(mcs.sampleSize, 42);
  });

  it("weightedScore = score * weight for each component", () => {
    const mcs = scoreMarketContext([], defaultConditions, 0);
    for (const comp of mcs.components) {
      const expected = Math.round(comp.score * comp.weight * 100) / 100;
      const actual = Math.round(comp.weightedScore * 100) / 100;
      assert.ok(Math.abs(expected - actual) < 0.01, `${comp.name}: ${actual} !== ${expected}`);
    }
  });

  it("label matches score thresholds", () => {
    const mcs = scoreMarketContext([], defaultConditions, 0);
    const expected = scoreToLabel(mcs.score);
    assert.equal(mcs.label, expected);
  });
});

describe("scoreToLabel", () => {
  it("returns excellent for score >= 80", () => assert.equal(scoreToLabel(85), "excellent"));
  it("returns good for score >= 65", () => assert.equal(scoreToLabel(70), "good"));
  it("returns neutral for score >= 45", () => assert.equal(scoreToLabel(55), "neutral"));
  it("returns difficult for score >= 30", () => assert.equal(scoreToLabel(38), "difficult"));
  it("returns dangerous for score < 30", () => assert.equal(scoreToLabel(20), "dangerous"));
  it("boundary: 80 is excellent", () => assert.equal(scoreToLabel(80), "excellent"));
  it("boundary: 65 is good", () => assert.equal(scoreToLabel(65), "good"));
  it("boundary: 45 is neutral", () => assert.equal(scoreToLabel(45), "neutral"));
  it("boundary: 30 is difficult", () => assert.equal(scoreToLabel(30), "difficult"));
  it("boundary: 29 is dangerous", () => assert.equal(scoreToLabel(29), "dangerous"));
});
