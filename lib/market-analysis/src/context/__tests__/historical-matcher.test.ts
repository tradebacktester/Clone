import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SnapshotRecord } from "../../context/types.js";
import { findHistoricalMatches, computeSimilarityScore, aggregateMatchOutcomes } from "../../context/historical-matcher.js";
import type { CurrentFeatures } from "../../context/historical-matcher.js";

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

const currentFeatures: CurrentFeatures = {
  regime: "trending",
  trendDirection: "bullish",
  trendStrength: 65,
  volatilityClassification: "medium",
  volatilityPercentile: 50,
  session: "london",
  liquidityQuality: "good",
  newsEnvironment: "safe",
};

describe("findHistoricalMatches", () => {
  it("returns empty array for no snapshots", () => {
    assert.deepEqual(findHistoricalMatches(currentFeatures, [], 10, 40), []);
  });

  it("returns top N matches sorted by similarity", () => {
    const exact = makeSnapshot();
    const different = makeSnapshot({ regime: "ranging", trendDirection: "bearish", volatilityClassification: "high", session: "new_york" });
    const matches = findHistoricalMatches(currentFeatures, [exact, different], 10, 0);
    assert.equal(matches[0]!.id, exact.id, "Exact match should be first");
    assert.ok(matches[0]!.similarityScore > matches[1]!.similarityScore);
  });

  it("filters below minimum similarity", () => {
    const veryDifferent = makeSnapshot({ regime: "volatile", trendDirection: "bearish", volatilityClassification: "extreme", session: "tokyo", newsEnvironment: "blocked", liquidityQuality: "poor" });
    const matches = findHistoricalMatches(currentFeatures, [veryDifferent], 10, 80);
    assert.equal(matches.length, 0);
  });

  it("limits to topN", () => {
    const snapshots = Array.from({ length: 20 }, () => makeSnapshot());
    const matches = findHistoricalMatches(currentFeatures, snapshots, 5, 0);
    assert.ok(matches.length <= 5);
  });

  it("perfect match gets maximum similarity", () => {
    const exact = makeSnapshot({
      regime: "trending",
      trendDirection: "bullish",
      volatilityClassification: "medium",
      session: "london",
      liquidityQuality: "good",
      newsEnvironment: "safe",
      trendStrength: 65,
      volatilityPercentile: 50,
    });
    const matches = findHistoricalMatches(currentFeatures, [exact], 10, 0);
    assert.equal(matches.length, 1);
    assert.equal(matches[0]!.similarityScore, 100);
  });

  it("similarityScore is 0-100", () => {
    const snapshots = Array.from({ length: 5 }, (_, i) =>
      makeSnapshot({ regime: i % 2 === 0 ? "trending" : "ranging", trendDirection: i % 3 === 0 ? "bullish" : "bearish" }),
    );
    const matches = findHistoricalMatches(currentFeatures, snapshots, 10, 0);
    for (const m of matches) {
      assert.ok(m.similarityScore >= 0 && m.similarityScore <= 100, `Score ${m.similarityScore} out of range`);
    }
  });

  it("includes all required fields in match", () => {
    const snap = makeSnapshot();
    const [match] = findHistoricalMatches(currentFeatures, [snap], 1, 0);
    assert.ok(match, "should have at least one match");
    assert.ok("id" in match!);
    assert.ok("date" in match!);
    assert.ok("pair" in match!);
    assert.ok("regime" in match!);
    assert.ok("trendDirection" in match!);
    assert.ok("volatilityClassification" in match!);
    assert.ok("session" in match!);
    assert.ok("similarityScore" in match!);
    assert.ok("outcome" in match!);
    assert.ok("confidence" in match!);
  });

  it("high confidenceScore snapshot infers profitable outcome", () => {
    const snap = makeSnapshot({ confidenceScore: 85 });
    const [match] = findHistoricalMatches(currentFeatures, [snap], 1, 0);
    assert.equal(match!.outcome, "profitable");
  });

  it("low confidenceScore snapshot infers losing outcome", () => {
    const snap = makeSnapshot({ confidenceScore: 20 });
    const [match] = findHistoricalMatches(currentFeatures, [snap], 1, 0);
    assert.equal(match!.outcome, "losing");
  });

  it("date is derived from createdAt", () => {
    const snap = makeSnapshot({ createdAt: new Date("2024-06-15T10:00:00Z") });
    const [match] = findHistoricalMatches(currentFeatures, [snap], 1, 0);
    assert.equal(match!.date, "2024-06-15");
  });
});

describe("computeSimilarityScore", () => {
  it("identical snapshots get 100%", () => {
    const snap = makeSnapshot();
    const score = computeSimilarityScore(currentFeatures, snap);
    assert.equal(score, 100);
  });

  it("completely different snapshot gets low score", () => {
    const snap = makeSnapshot({
      regime: "volatile",
      trendDirection: "bearish",
      volatilityClassification: "extreme",
      session: "tokyo",
      liquidityQuality: "poor",
      newsEnvironment: "blocked",
    });
    const score = computeSimilarityScore(currentFeatures, snap);
    assert.ok(score < 30, `Score should be low, got ${score}`);
  });
});

describe("aggregateMatchOutcomes", () => {
  it("returns zero counts for empty matches", () => {
    const result = aggregateMatchOutcomes([]);
    assert.equal(result.avgSimilarity, 0);
    assert.equal(result.dominantOutcome, "unknown");
    assert.equal(result.profitableCount, 0);
  });

  it("identifies dominant profitable outcome", () => {
    const snap = makeSnapshot({ confidenceScore: 80 });
    const matches = findHistoricalMatches(currentFeatures, [snap, snap, snap], 10, 0);
    const summary = aggregateMatchOutcomes(matches);
    assert.equal(summary.dominantOutcome, "profitable");
    assert.ok(summary.profitableCount >= 2);
  });

  it("computes average similarity correctly", () => {
    const snap80 = makeSnapshot({ confidenceScore: 80 });
    const snap20 = makeSnapshot({ confidenceScore: 20, regime: "ranging", trendDirection: "bearish" });
    const matches = findHistoricalMatches(currentFeatures, [snap80, snap20], 10, 0);
    assert.ok(matches.length === 2);
    const summary = aggregateMatchOutcomes(matches);
    assert.ok(summary.avgSimilarity > 0 && summary.avgSimilarity <= 100);
  });
});
