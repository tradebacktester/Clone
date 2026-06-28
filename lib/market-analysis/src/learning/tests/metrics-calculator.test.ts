import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateMetrics,
  computeDrawdown,
  computeSharpe,
  computeSortino,
  buildHistogram,
  mean,
  stdDev,
  median,
  percentile,
  qualityBucket,
  segmentBy,
} from "../learning-metrics/metrics-calculator.js";
import type { ExtractedFeature } from "../learning-core/types.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeFeature(overrides: Partial<ExtractedFeature> = {}): ExtractedFeature {
  return {
    tradeId: String(Math.floor(Math.random() * 100000)),
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

function makeWin(id: number) { return makeFeature({ tradeId: String(id), outcome: "win", pnl: 100, pnlPercent: 1.0, rrActual: 2.0 }); }
function makeLoss(id: number) { return makeFeature({ tradeId: String(id), outcome: "loss", pnl: -50, pnlPercent: -0.5, rrActual: -1.0 }); }
function makeBreakEven(id: number) { return makeFeature({ tradeId: String(id), outcome: "break_even", pnl: 0, pnlPercent: 0, rrActual: 0 }); }

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("mean", () => {
  it("computes correct mean", () => {
    assert.ok(Math.abs(mean([1, 2, 3, 4, 5]) - 3) < 1e-10);
  });
  it("returns 0 for empty array", () => {
    assert.equal(mean([]), 0);
  });
  it("handles single value", () => {
    assert.equal(mean([42]), 42);
  });
  it("handles negative values", () => {
    assert.ok(Math.abs(mean([-1, 1]) - 0) < 1e-10);
  });
});

describe("stdDev", () => {
  it("computes correct std dev (sample — Bessel-corrected)", () => {
    // population std=2.0; sample std = sqrt(32/7) ≈ 2.138
    const sd = stdDev([2, 4, 4, 4, 5, 5, 7, 9]);
    assert.ok(Math.abs(sd - 2.138) < 0.01, `sd=${sd}`);
  });
  it("returns 0 for single value", () => {
    assert.equal(stdDev([5]), 0);
  });
  it("returns 0 for empty array", () => {
    assert.equal(stdDev([]), 0);
  });
  it("returns 0 for identical values", () => {
    assert.equal(stdDev([5, 5, 5, 5]), 0);
  });
});

describe("median", () => {
  it("odd count", () => { assert.equal(median([1, 3, 5]), 3); });
  it("even count", () => { assert.equal(median([1, 2, 3, 4]), 2.5); });
  it("single value", () => { assert.equal(median([7]), 7); });
  it("empty", () => { assert.equal(median([]), 0); });
  it("unsorted input still correct", () => { assert.equal(median([5, 1, 3]), 3); });
});

describe("percentile", () => {
  it("p50 equals median", () => {
    const vals = [1, 2, 3, 4, 5];
    assert.ok(Math.abs(percentile(vals, 50) - median(vals)) < 1e-10);
  });
  it("p0 equals min", () => {
    assert.equal(percentile([3, 1, 4, 1, 5, 9, 2, 6], 0), 1);
  });
  it("p100 equals max", () => {
    assert.equal(percentile([3, 1, 4, 1, 5, 9, 2, 6], 100), 9);
  });
  it("empty returns 0", () => {
    assert.equal(percentile([], 50), 0);
  });
});

describe("qualityBucket", () => {
  it("low below 40", () => { assert.equal(qualityBucket(30), "low"); });
  it("medium 40–69", () => { assert.equal(qualityBucket(55), "medium"); });
  it("high 70+", () => { assert.equal(qualityBucket(75), "high"); });
  it("boundary 40 is medium", () => { assert.equal(qualityBucket(40), "medium"); });
  it("boundary 70 is high", () => { assert.equal(qualityBucket(70), "high"); });
  it("0 is low", () => { assert.equal(qualityBucket(0), "low"); });
  it("100 is high", () => { assert.equal(qualityBucket(100), "high"); });
});

describe("calculateMetrics — core metrics", () => {
  const features = [
    makeWin(1), makeWin(2), makeWin(3), makeWin(4),
    makeLoss(5), makeLoss(6),
    makeBreakEven(7),
  ];

  const m = calculateMetrics(features);

  it("total trades", () => { assert.equal(m.totalTrades, 7); });
  it("wins", () => { assert.equal(m.wins, 4); });
  it("losses", () => { assert.equal(m.losses, 2); });
  it("break evens", () => { assert.equal(m.breakEvens, 1); });
  it("win rate is 4/7", () => { assert.ok(Math.abs(m.winRate - 4 / 7) < 1e-10); });
  it("loss rate is 2/7", () => { assert.ok(Math.abs(m.lossRate - 2 / 7) < 1e-10); });
  it("total pnl is correct", () => { assert.equal(m.totalPnl, 4 * 100 + 2 * (-50) + 0); });
  it("gross profit is 400", () => { assert.equal(m.grossProfit, 400); });
  it("gross loss is 100", () => { assert.equal(m.grossLoss, 100); });
  it("profit factor is 4.0", () => { assert.ok(Math.abs(m.profitFactor - 4.0) < 1e-10); });
  it("expectancy > 0", () => { assert.ok(m.expectancy > 0); });

  it("avg win is 100", () => { assert.equal(m.avgWin, 100); });
  it("avg loss is 50", () => { assert.equal(m.avgLoss, 50); });
  it("avg rr close to 2.0 for wins", () => {
    // wins have rrActual=2.0, losses=-1.0, BE=0 → mean = (4*2 + 2*(-1) + 1*0)/7
    const expected = (4 * 2 + 2 * (-1) + 1 * 0) / 7;
    assert.ok(Math.abs(m.avgRR - expected) < 1e-6);
  });
});

describe("calculateMetrics — empty returns zero metrics", () => {
  const m = calculateMetrics([]);
  it("total trades = 0", () => { assert.equal(m.totalTrades, 0); });
  it("win rate = 0", () => { assert.equal(m.winRate, 0); });
  it("profit factor = 0", () => { assert.equal(m.profitFactor, 0); });
});

describe("calculateMetrics — dimensional breakdowns", () => {
  const features = [
    makeWin(1), makeWin(2), makeLoss(3),
    makeFeature({ tradeId: "4", pair: "GBPUSD", outcome: "win", pnl: 80, pnlPercent: 0.8, rrActual: 1.5 }),
    makeFeature({ tradeId: "5", pair: "GBPUSD", outcome: "loss", pnl: -40, pnlPercent: -0.4, rrActual: -1.0 }),
  ];
  const m = calculateMetrics(features);

  it("byPair has EURUSD and GBPUSD", () => {
    assert.ok("EURUSD" in m.byPair);
    assert.ok("GBPUSD" in m.byPair);
  });

  it("EURUSD win rate is 2/3", () => {
    assert.ok(Math.abs((m.byPair["EURUSD"].winRate) - 2 / 3) < 1e-10);
  });

  it("bySession has london", () => {
    assert.ok("london" in m.bySession);
  });

  it("byVolatility has medium", () => {
    assert.ok("medium" in m.byVolatility);
  });
});

describe("computeDrawdown", () => {
  it("zero drawdown with all wins", () => {
    const features = [makeWin(1), makeWin(2), makeWin(3)];
    const { maxDrawdownPct } = computeDrawdown(features, 300);
    assert.equal(maxDrawdownPct, 0);
  });

  it("calculates drawdown correctly", () => {
    // Equity: 100, 200, 150, 100, 200 → peak=200, trough=100 → dd=100 → 50%
    const features = [
      makeFeature({ tradeId: "1", pnl: 100, openedAt: new Date("2024-01-01") }),
      makeFeature({ tradeId: "2", pnl: 100, openedAt: new Date("2024-01-02") }),
      makeFeature({ tradeId: "3", outcome: "loss", pnl: -50, openedAt: new Date("2024-01-03") }),
      makeFeature({ tradeId: "4", outcome: "loss", pnl: -50, openedAt: new Date("2024-01-04") }),
      makeFeature({ tradeId: "5", pnl: 100, openedAt: new Date("2024-01-05") }),
    ];
    const totalPnl = 100 + 100 - 50 - 50 + 100;
    const { maxDrawdownPct, recoveryFactor } = computeDrawdown(features, totalPnl);
    assert.ok(maxDrawdownPct > 0, "drawdown should be positive");
    assert.ok(recoveryFactor > 0, "recovery factor should be positive for net profitable");
  });

  it("empty features returns zeros", () => {
    const { maxDrawdownPct, recoveryFactor } = computeDrawdown([], 0);
    assert.equal(maxDrawdownPct, 0);
    assert.equal(recoveryFactor, 0);
  });
});

describe("computeSharpe", () => {
  it("returns 0 for empty input", () => { assert.equal(computeSharpe([]), 0); });
  it("returns 0 for single record", () => { assert.equal(computeSharpe([makeWin(1)]), 0); });
  it("positive Sharpe for consistent profits", () => {
    const features = Array.from({ length: 10 }, (_, i) =>
      makeFeature({ tradeId: String(i), pnlPercent: 0.5 + i * 0.01 }),
    );
    const s = computeSharpe(features);
    assert.ok(s > 0, `expected positive Sharpe, got ${s}`);
  });
  it("negative Sharpe for consistent losses", () => {
    const features = Array.from({ length: 10 }, (_, i) =>
      makeFeature({ tradeId: String(i), outcome: "loss", pnlPercent: -0.5 - i * 0.01 }),
    );
    const s = computeSharpe(features);
    assert.ok(s < 0, `expected negative Sharpe, got ${s}`);
  });
});

describe("computeSortino", () => {
  it("returns 0 for empty input", () => { assert.equal(computeSortino([]), 0); });
  it("returns positive for all-win series", () => {
    const features = Array.from({ length: 5 }, (_, i) =>
      makeFeature({ tradeId: String(i), pnlPercent: 1.0 }),
    );
    const s = computeSortino(features);
    assert.ok(s > 0 || !isFinite(s)); // Infinity is acceptable when no downside
  });
});

describe("buildHistogram", () => {
  const features = [
    makeFeature({ confidence: 10 }),
    makeFeature({ confidence: 30 }),
    makeFeature({ confidence: 50 }),
    makeFeature({ confidence: 70 }),
    makeFeature({ confidence: 90 }),
  ];
  const bins = [
    { label: "0–50", min: 0, max: 50 },
    { label: "50–100", min: 50, max: 101 },
  ];
  const hist = buildHistogram(features, f => f.confidence, bins);

  it("produces correct bin count", () => { assert.equal(hist.length, 2); });
  it("first bin has 2 items (10, 30)", () => { assert.equal(hist[0].count, 2); });
  it("second bin has 3 items (50, 70, 90)", () => { assert.equal(hist[1].count, 3); });
  it("win rate in bins is 0–1", () => {
    for (const b of hist) assert.ok(b.winRate >= 0 && b.winRate <= 1);
  });
});

describe("segmentBy", () => {
  const features = [
    makeFeature({ pair: "EURUSD" }),
    makeFeature({ pair: "EURUSD" }),
    makeFeature({ pair: "GBPUSD" }),
  ];
  const result = segmentBy(features, f => f.pair);

  it("has both pairs", () => {
    assert.ok("EURUSD" in result);
    assert.ok("GBPUSD" in result);
  });
  it("EURUSD has 2 trades", () => {
    assert.equal(result["EURUSD"].totalTrades, 2);
  });
  it("GBPUSD has 1 trade", () => {
    assert.equal(result["GBPUSD"].totalTrades, 1);
  });
  it("labels match keys", () => {
    assert.equal(result["EURUSD"].label, "EURUSD");
  });
});
