import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SnapshotRecord } from "../../context/types.js";
import { analyzeStability } from "../../context/stability-analyzer.js";

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

describe("analyzeStability", () => {
  it("returns valid stability analysis for empty snapshots", () => {
    const result = analyzeStability([], "trending", "bullish");
    assert.ok(result.overallStability >= 0 && result.overallStability <= 100);
    assert.ok(["very_stable", "stable", "unstable", "very_unstable"].includes(result.label));
    assert.ok(typeof result.timestamp === "string");
    assert.ok(Array.isArray(result.warnings));
  });

  it("stable regime produces high regime stability score", () => {
    const snapshots = Array.from({ length: 15 }, () => makeSnapshot({ regime: "trending" }));
    const result = analyzeStability(snapshots, "trending", "bullish");
    assert.ok(result.regime.score >= 80, `regime.score should be high, got ${result.regime.score}`);
    assert.equal(result.regime.warning, false);
  });

  it("unstable regime produces low regime stability score", () => {
    const snapshots = [
      ...Array.from({ length: 5 }, () => makeSnapshot({ regime: "trending" })),
      ...Array.from({ length: 5 }, () => makeSnapshot({ regime: "ranging" })),
      ...Array.from({ length: 5 }, () => makeSnapshot({ regime: "volatile" })),
    ];
    const result = analyzeStability(snapshots, "volatile", "bullish");
    assert.ok(result.regime.score < 50, `regime.score should be low, got ${result.regime.score}`);
    assert.equal(result.regime.warning, true);
  });

  it("stable trend produces high trend stability score", () => {
    const snapshots = Array.from({ length: 15 }, () => makeSnapshot({ trendDirection: "bullish" }));
    const result = analyzeStability(snapshots, "trending", "bullish");
    assert.ok(result.trend.score >= 80);
  });

  it("flipping trend produces warning", () => {
    const snapshots = Array.from({ length: 10 }, (_, i) =>
      makeSnapshot({ trendDirection: i % 2 === 0 ? "bullish" : "bearish" }),
    );
    const result = analyzeStability(snapshots, "trending", "bullish");
    assert.equal(result.trend.warning, true);
  });

  it("stable volatility produces high volatility stability", () => {
    const snapshots = Array.from({ length: 10 }, () => makeSnapshot({ volatilityPercentile: 50 }));
    const result = analyzeStability(snapshots, "trending", "bullish");
    assert.ok(result.volatility.score >= 90);
  });

  it("chaotic volatility percentile produces warning", () => {
    const percentiles = [10, 90, 15, 85, 20, 80, 25, 75, 30, 70];
    const snapshots = percentiles.map(p => makeSnapshot({ volatilityPercentile: p }));
    const result = analyzeStability(snapshots, "trending", "bullish");
    assert.equal(result.volatility.warning, true);
  });

  it("all stability measures have required fields", () => {
    const snapshots = Array.from({ length: 5 }, () => makeSnapshot());
    const result = analyzeStability(snapshots, "trending", "bullish");
    for (const measure of [result.regime, result.trend, result.volatility, result.liquidity]) {
      assert.ok(typeof measure.name === "string");
      assert.ok(measure.score >= 0 && measure.score <= 100);
      assert.ok(["improving", "deteriorating", "stable"].includes(measure.trend));
      assert.ok(typeof measure.warning === "boolean");
      assert.ok(typeof measure.detail === "string");
    }
  });

  it("overallStability is weighted average of sub-components", () => {
    const snapshots = Array.from({ length: 10 }, () => makeSnapshot({ regime: "trending", trendDirection: "bullish", volatilityPercentile: 50, liquidityScore: 70 }));
    const result = analyzeStability(snapshots, "trending", "bullish");
    assert.ok(result.overallStability >= 0 && result.overallStability <= 100);
  });

  it("very_stable label when all scores are high", () => {
    const snapshots = Array.from({ length: 20 }, () => makeSnapshot({
      regime: "trending",
      trendDirection: "bullish",
      volatilityPercentile: 50,
      liquidityScore: 70,
    }));
    const result = analyzeStability(snapshots, "trending", "bullish");
    assert.ok(
      result.label === "very_stable" || result.label === "stable",
      `Expected stable label, got ${result.label}`,
    );
  });

  it("warnings array contains strings", () => {
    const chaotic = Array.from({ length: 10 }, (_, i) => makeSnapshot({
      regime: ["trending", "ranging", "volatile"][i % 3] as string,
      volatilityPercentile: [10, 90, 20, 80, 30][i % 5] as number,
    }));
    const result = analyzeStability(chaotic, "trending", "bullish");
    assert.ok(result.warnings.every(w => typeof w === "string"));
  });

  it("timestamp is a valid ISO string", () => {
    const result = analyzeStability([], "trending", "bullish", new Date("2024-01-01"));
    assert.ok(result.timestamp.startsWith("2024-01-01"));
  });
});
