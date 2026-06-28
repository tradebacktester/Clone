import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeDistributions,
  computeCorrelations,
  analyzeSkippedSetups,
  analyzeReviews,
  analyzeStatistics,
  pearson,
  computeSkewness,
} from "../learning-analysis/statistical-analyzer.js";
import type { ExtractedFeature, RawSkippedSetup, RawManualReview } from "../learning-core/types.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeFeature(overrides: Partial<ExtractedFeature> = {}): ExtractedFeature {
  return {
    tradeId: String(Math.floor(Math.random() * 99999)),
    pair: "EURUSD",
    session: "london",
    trend: "bullish",
    marketRegime: "trending",
    supplyQuality: 0,
    demandQuality: 75,
    liquidityScore: 70,
    amdScore: 65,
    confirmationQuality: 80,
    tradeDurationMins: 90,
    spreadPips: 1.2,
    volatility: "medium",
    riskPct: 1,
    rrPlanned: 2.5,
    rrActual: 2.1,
    outcome: "win",
    pnl: 100,
    pnlPercent: 1.0,
    setupScore: 75,
    confidence: 72,
    tqi: 70,
    openedAt: new Date("2024-01-15T09:00:00Z"),
    closedAt: new Date("2024-01-15T10:30:00Z"),
    ...overrides,
  };
}

function makeSkipped(overrides: Partial<RawSkippedSetup> = {}): RawSkippedSetup {
  return {
    id: Math.floor(Math.random() * 99999),
    pair: "EURUSD",
    session: "london",
    regime: "trending",
    zoneScore: 60,
    liquidityScore: 55,
    amdScore: 50,
    confirmationScore: 45,
    rejectingRule: "min_zone_score",
    rejectionReason: null,
    createdAt: new Date("2024-01-15T09:00:00Z"),
    ...overrides,
  };
}

function makeReview(overrides: Partial<RawManualReview> = {}): RawManualReview {
  return {
    id: Math.floor(Math.random() * 99999),
    tradeId: 1,
    rating: 4,
    notes: "Good trade",
    followedRules: true,
    reviewedAt: new Date("2024-01-15"),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("pearson", () => {
  it("perfect positive correlation", () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [1, 2, 3, 4, 5];
    assert.ok(Math.abs(pearson(xs, ys) - 1.0) < 1e-10);
  });

  it("perfect negative correlation", () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [5, 4, 3, 2, 1];
    assert.ok(Math.abs(pearson(xs, ys) + 1.0) < 1e-10);
  });

  it("zero correlation for uncorrelated", () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [3, 3, 3, 3, 3]; // constant → zero correlation
    assert.equal(pearson(xs, ys), 0);
  });

  it("returns 0 for < 2 samples", () => {
    assert.equal(pearson([], []), 0);
    assert.equal(pearson([1], [1]), 0);
  });

  it("result is in [-1, 1]", () => {
    const xs = [3, 1, 4, 1, 5, 9, 2, 6];
    const ys = [5, 3, 2, 8, 1, 4, 7, 3];
    const r = pearson(xs, ys);
    assert.ok(r >= -1 && r <= 1, `r=${r}`);
  });
});

describe("computeSkewness", () => {
  it("right-skewed data has positive skewness", () => {
    const vals = [1, 1, 1, 1, 2, 2, 10]; // tail on right
    const mu = vals.reduce((s, v) => s + v, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mu) ** 2, 0) / (vals.length - 1));
    const sk = computeSkewness(vals, mu, sd);
    assert.ok(sk > 0, `expected positive skewness, got ${sk}`);
  });

  it("returns 0 for empty/small inputs", () => {
    assert.equal(computeSkewness([], 0, 1), 0);
    assert.equal(computeSkewness([1, 2], 1.5, 0.7), 0);
  });

  it("returns 0 when sd=0", () => {
    assert.equal(computeSkewness([5, 5, 5, 5], 5, 0), 0);
  });
});

describe("computeDistributions", () => {
  const features = Array.from({ length: 10 }, (_, i) => makeFeature({
    tradeId: String(i),
    setupScore: 50 + i * 3,
    rrActual: 1 + i * 0.2,
  }));

  it("returns distributions for all numeric features", () => {
    const dists = computeDistributions(features);
    assert.ok(dists.length > 5, `expected multiple distributions, got ${dists.length}`);
  });

  it("each distribution has required fields", () => {
    const dists = computeDistributions(features);
    for (const d of dists) {
      assert.ok(typeof d.feature === "string");
      assert.ok(typeof d.count === "number");
      assert.ok(typeof d.mean === "number");
      assert.ok(typeof d.median === "number");
      assert.ok(typeof d.stdDev === "number");
      assert.ok(typeof d.min === "number");
      assert.ok(typeof d.max === "number");
      assert.ok(typeof d.p25 === "number");
      assert.ok(typeof d.p75 === "number");
    }
  });

  it("setupScore distribution has correct mean", () => {
    const dists = computeDistributions(features);
    const setupDist = dists.find(d => d.feature === "setupScore")!;
    assert.ok(setupDist, "setupScore distribution not found");
    // mean of 50,53,56,...,77 = (50+77)/2 = 63.5
    assert.ok(Math.abs(setupDist.mean - 63.5) < 1, `mean=${setupDist.mean}`);
  });

  it("p25 <= median <= p75", () => {
    const dists = computeDistributions(features);
    for (const d of dists) {
      if (d.count > 4) {
        assert.ok(d.p25 <= d.median + 1e-10, `${d.feature}: p25=${d.p25} > median=${d.median}`);
        assert.ok(d.median <= d.p75 + 1e-10, `${d.feature}: median=${d.median} > p75=${d.p75}`);
      }
    }
  });

  it("returns empty array for no features", () => {
    assert.equal(computeDistributions([]).length, 0);
  });
});

describe("computeCorrelations", () => {
  it("returns empty for < 5 features", () => {
    const features = Array.from({ length: 3 }, (_, i) => makeFeature({ tradeId: String(i) }));
    assert.equal(computeCorrelations(features).length, 0);
  });

  it("returns correlations for sufficient data", () => {
    const features = Array.from({ length: 15 }, (_, i) => makeFeature({
      tradeId: String(i),
      setupScore: 40 + i * 3,
      rrActual: 0.5 + i * 0.2,
    }));
    const corrs = computeCorrelations(features);
    assert.ok(corrs.length > 0);
  });

  it("each correlation has required fields", () => {
    const features = Array.from({ length: 10 }, (_, i) => makeFeature({ tradeId: String(i) }));
    const corrs = computeCorrelations(features);
    for (const c of corrs) {
      assert.ok(typeof c.featureA === "string");
      assert.ok(typeof c.featureB === "string");
      assert.ok(c.pearsonR >= -1 && c.pearsonR <= 1, `r=${c.pearsonR}`);
      assert.ok(typeof c.significant === "boolean");
    }
  });

  it("perfect correlation when scores == rrActual", () => {
    const features = Array.from({ length: 15 }, (_, i) => makeFeature({
      tradeId: String(i),
      setupScore: i * 10,
      rrActual: i * 10, // perfect positive correlation
    }));
    const corrs = computeCorrelations(features);
    const sc = corrs.find(c => c.featureA === "setupScore" && c.featureB === "rrActual");
    if (sc) {
      assert.ok(Math.abs(sc.pearsonR - 1.0) < 0.001, `expected r≈1, got ${sc.pearsonR}`);
    }
  });
});

describe("analyzeSkippedSetups", () => {
  it("handles empty array", () => {
    const result = analyzeSkippedSetups([]);
    assert.equal(result.totalSkipped, 0);
    assert.deepEqual(result.byRejectingRule, {});
  });

  it("counts by rejecting rule", () => {
    const skipped = [
      makeSkipped({ rejectingRule: "min_zone_score" }),
      makeSkipped({ rejectingRule: "min_zone_score" }),
      makeSkipped({ rejectingRule: "max_spread" }),
    ];
    const result = analyzeSkippedSetups(skipped);
    assert.equal(result.totalSkipped, 3);
    assert.equal(result.byRejectingRule["min_zone_score"], 2);
    assert.equal(result.byRejectingRule["max_spread"], 1);
  });

  it("counts by pair", () => {
    const skipped = [
      makeSkipped({ pair: "EURUSD" }),
      makeSkipped({ pair: "EURUSD" }),
      makeSkipped({ pair: "GBPUSD" }),
    ];
    const result = analyzeSkippedSetups(skipped);
    assert.equal(result.byPair["EURUSD"], 2);
    assert.equal(result.byPair["GBPUSD"], 1);
  });

  it("calculates average scores", () => {
    const skipped = [
      makeSkipped({ zoneScore: 60, liquidityScore: 50 }),
      makeSkipped({ zoneScore: 80, liquidityScore: 70 }),
    ];
    const result = analyzeSkippedSetups(skipped);
    assert.ok(Math.abs(result.avgScores.zone - 70) < 1e-10);
    assert.ok(Math.abs(result.avgScores.liquidity - 60) < 1e-10);
  });
});

describe("analyzeReviews", () => {
  it("handles empty array", () => {
    const r = analyzeReviews([]);
    assert.equal(r.totalReviewed, 0);
    assert.equal(r.avgRating, 0);
    assert.equal(r.ruleAdherenceRate, 0);
  });

  it("computes avg rating", () => {
    const reviews = [makeReview({ rating: 3 }), makeReview({ rating: 5 })];
    const r = analyzeReviews(reviews);
    assert.equal(r.avgRating, 4);
  });

  it("computes rule adherence rate", () => {
    const reviews = [
      makeReview({ followedRules: true }),
      makeReview({ followedRules: true }),
      makeReview({ followedRules: false }),
      makeReview({ followedRules: false }),
    ];
    const r = analyzeReviews(reviews);
    assert.ok(Math.abs(r.ruleAdherenceRate - 0.5) < 1e-10);
  });

  it("ignores null followedRules for adherence rate", () => {
    const reviews = [
      makeReview({ followedRules: true }),
      makeReview({ followedRules: null as any }),
    ];
    const r = analyzeReviews(reviews);
    assert.equal(r.ruleAdherenceRate, 1.0); // only 1 valid record, followedRules=true
  });
});

describe("analyzeStatistics integration", () => {
  const features = Array.from({ length: 10 }, (_, i) => makeFeature({ tradeId: String(i) }));
  const skipped = [makeSkipped(), makeSkipped({ rejectingRule: "different" })];
  const reviews = [makeReview(), makeReview({ followedRules: false })];

  const result = analyzeStatistics(features, skipped, reviews);

  it("returns all four components", () => {
    assert.ok("distributions" in result);
    assert.ok("correlations" in result);
    assert.ok("skippedSetupInsights" in result);
    assert.ok("reviewInsights" in result);
  });

  it("distributions is non-empty", () => {
    assert.ok(result.distributions.length > 0);
  });

  it("skippedSetupInsights has correct total", () => {
    assert.equal(result.skippedSetupInsights.totalSkipped, 2);
  });

  it("reviewInsights has correct total", () => {
    assert.equal(result.reviewInsights.totalReviewed, 2);
  });
});
