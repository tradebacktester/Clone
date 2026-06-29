import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { TradeRecord, SnapshotRecord } from "../../context/types.js";
import { buildMarketContext } from "../../context/market-context.js";
import type { MarketContextInput } from "../../context/market-context.js";

function makeTradeRecord(overrides: Partial<TradeRecord> = {}): TradeRecord {
  const pnl = overrides.pnl ?? 100;
  return {
    id: 1,
    pair: "EURUSD",
    direction: "buy",
    session: "london",
    regime: "trending",
    newsStatus: "safe",
    spreadPips: 0.5,
    pnl,
    riskRewardRatio: pnl > 0 ? 2 : -1,
    isWin: pnl > 0,
    isLoss: pnl < 0,
    openedAt: new Date("2024-03-14T10:00:00Z"),
    closedAt: new Date("2024-03-14T14:00:00Z"),
    trendDirection: "bullish",
    volatilityClass: "medium",
    liquidityQuality: "good",
    correlationRisk: "low",
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<SnapshotRecord> = {}): SnapshotRecord {
  return {
    id: crypto.randomUUID(),
    pair: "EURUSD",
    session: "london",
    trendDirection: "bullish",
    trendStrength: 65,
    regime: "trending",
    regimeConfidence: 75,
    volatilityClassification: "medium",
    volatilityPercentile: 50,
    liquidityQuality: "good",
    liquidityScore: 70,
    correlationRisk: "low",
    newsEnvironment: "safe",
    confidenceScore: 72,
    createdAt: new Date("2024-01-15T10:00:00Z"),
    ...overrides,
  };
}

const defaultInput: MarketContextInput = {
  pair: "EURUSD",
  currentRegime: "trending",
  currentTrendDirection: "bullish",
  currentTrendStrength: 65,
  currentVolatilityClass: "medium",
  currentVolatilityPercentile: 50,
  currentLiquidityQuality: "good",
  currentLiquidityScore: 70,
  currentCorrelationRisk: "low",
  currentSession: "london",
  currentNewsEnvironment: "safe",
  trades: [],
  snapshots: [],
};

describe("buildMarketContext", () => {
  it("returns all required top-level fields", () => {
    const ctx = buildMarketContext(defaultInput);
    assert.ok("pair" in ctx);
    assert.ok("timestamp" in ctx);
    assert.ok("mcs" in ctx);
    assert.ok("stability" in ctx);
    assert.ok("classification" in ctx);
    assert.ok("classificationEvidence" in ctx);
    assert.ok("adjustedScore" in ctx);
    assert.ok("performanceByDimension" in ctx);
    assert.ok("overallPerformance" in ctx);
    assert.ok("historicalMatches" in ctx);
    assert.ok("matchSummary" in ctx);
    assert.ok("summary" in ctx);
  });

  it("pair is passed through correctly", () => {
    const ctx = buildMarketContext({ ...defaultInput, pair: "GBPUSD" });
    assert.equal(ctx.pair, "GBPUSD");
  });

  it("timestamp is a valid ISO string", () => {
    const ctx = buildMarketContext(defaultInput);
    assert.doesNotThrow(() => new Date(ctx.timestamp));
  });

  it("mcs.score is 0-100", () => {
    const ctx = buildMarketContext(defaultInput);
    assert.ok(ctx.mcs.score >= 0 && ctx.mcs.score <= 100);
  });

  it("stability.overallStability is 0-100", () => {
    const ctx = buildMarketContext(defaultInput);
    assert.ok(ctx.stability.overallStability >= 0 && ctx.stability.overallStability <= 100);
  });

  it("classification is a valid value", () => {
    const ctx = buildMarketContext(defaultInput);
    const valid = ["excellent", "good", "neutral", "difficult", "dangerous"];
    assert.ok(valid.includes(ctx.classification), `Got ${ctx.classification}`);
  });

  it("adjustedScore is 0-100", () => {
    const ctx = buildMarketContext({ ...defaultInput, currentNewsEnvironment: "blocked" });
    assert.ok(ctx.adjustedScore >= 0 && ctx.adjustedScore <= 100);
  });

  it("classificationEvidence is non-empty array of strings", () => {
    const ctx = buildMarketContext(defaultInput);
    assert.ok(Array.isArray(ctx.classificationEvidence));
    assert.ok(ctx.classificationEvidence.length > 0);
    assert.ok(ctx.classificationEvidence.every(e => typeof e === "string"));
  });

  it("summary is a non-empty string", () => {
    const ctx = buildMarketContext(defaultInput);
    assert.ok(typeof ctx.summary === "string");
    assert.ok(ctx.summary.length > 0);
  });

  it("summary contains pair name", () => {
    const ctx = buildMarketContext({ ...defaultInput, pair: "GBPUSD" });
    assert.ok(ctx.summary.includes("GBPUSD"), "summary should mention pair");
  });

  it("historicalMatches is an array", () => {
    const ctx = buildMarketContext(defaultInput);
    assert.ok(Array.isArray(ctx.historicalMatches));
  });

  it("finds historical matches when similar snapshots exist", () => {
    const snapshots = Array.from({ length: 5 }, () => makeSnapshot({
      regime: "trending",
      trendDirection: "bullish",
      volatilityClassification: "medium",
      session: "london",
    }));
    const ctx = buildMarketContext({ ...defaultInput, snapshots });
    assert.ok(ctx.historicalMatches.length > 0, "should find some matches");
  });

  it("matchSummary has correct shape", () => {
    const ctx = buildMarketContext(defaultInput);
    assert.ok(typeof ctx.matchSummary.avgSimilarity === "number");
    assert.ok(typeof ctx.matchSummary.profitableCount === "number");
    assert.ok(typeof ctx.matchSummary.losingCount === "number");
    assert.ok(typeof ctx.matchSummary.neutralCount === "number");
  });

  it("performanceByDimension is empty when no closed trades", () => {
    const openTrade = makeTradeRecord({ closedAt: null });
    const ctx = buildMarketContext({ ...defaultInput, trades: [openTrade] });
    assert.equal(ctx.performanceByDimension.length, 0);
  });

  it("performance analysis populated with closed trades", () => {
    const trades = Array.from({ length: 10 }, (_, i) =>
      makeTradeRecord({ pnl: i % 2 === 0 ? 100 : -50, riskRewardRatio: i % 2 === 0 ? 2 : -1, isWin: i % 2 === 0, isLoss: i % 2 !== 0 }),
    );
    const ctx = buildMarketContext({ ...defaultInput, trades });
    assert.ok(ctx.performanceByDimension.length > 0);
    assert.ok(ctx.overallPerformance.sampleSize === 10);
  });

  it("all pairs work correctly", () => {
    for (const pair of ["EURUSD", "GBPUSD", "USDJPY"]) {
      const ctx = buildMarketContext({ ...defaultInput, pair });
      assert.equal(ctx.pair, pair);
      assert.ok(ctx.mcs.score >= 0);
    }
  });

  it("blocked news environment degrades classification", () => {
    const good = buildMarketContext({ ...defaultInput, currentNewsEnvironment: "safe" });
    const bad = buildMarketContext({ ...defaultInput, currentNewsEnvironment: "blocked" });
    assert.ok(bad.mcs.score <= good.mcs.score, "blocked news should not improve score");
  });

  it("uses provided now timestamp", () => {
    const now = new Date("2024-06-15T12:00:00Z");
    const ctx = buildMarketContext({ ...defaultInput, now });
    assert.ok(ctx.timestamp.startsWith("2024-06-15"));
  });

  it("stability uses snapshots for computation", () => {
    const stableSnapshots = Array.from({ length: 15 }, () => makeSnapshot({ regime: "trending", trendDirection: "bullish" }));
    const chaoticSnapshots = Array.from({ length: 15 }, (_, i) => makeSnapshot({
      regime: ["trending", "ranging", "volatile"][i % 3] as string,
      trendDirection: i % 2 === 0 ? "bullish" : "bearish",
    }));
    const stable = buildMarketContext({ ...defaultInput, snapshots: stableSnapshots });
    const chaotic = buildMarketContext({ ...defaultInput, snapshots: chaoticSnapshots });
    assert.ok(stable.stability.overallStability > chaotic.stability.overallStability,
      `stable (${stable.stability.overallStability}) should beat chaotic (${chaotic.stability.overallStability})`);
  });
});
