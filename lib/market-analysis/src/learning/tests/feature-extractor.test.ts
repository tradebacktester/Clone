import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractFeatures,
  buildFeatureSummary,
} from "../learning-analysis/feature-extractor.js";
import type { RawTradeRecord, ExtractedFeature } from "../learning-core/types.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let idSeed = 1;

function makeRec(overrides: Partial<RawTradeRecord> = {}): RawTradeRecord {
  return {
    id: idSeed++,
    pair: "EURUSD",
    direction: "buy",
    session: "london",
    regime: "trending",
    regimeConfidence: 80,
    zoneScore: 75,
    liquidityScore: 70,
    amdScore: 65,
    confirmationScore: 80,
    finalScore: 73,
    confidence: 72,
    riskRewardPlanned: 2.5,
    riskRewardActual: 2.1,
    outcome: "win",
    pnl: 100,
    pnlPercent: 1.0,
    timeInTradeMins: 90,
    openedAt: new Date("2024-01-15T09:00:00Z"),
    closedAt: new Date("2024-01-15T10:30:00Z"),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("extractFeatures", () => {
  describe("Filtering", () => {
    it("excludes records without a valid outcome", () => {
      const recs = [
        makeRec({ outcome: "win" }),
        makeRec({ outcome: null as any }),
        makeRec({ outcome: "open" }),      // unknown outcome
        makeRec({ outcome: "loss" }),
        makeRec({ outcome: "break_even" }),
      ];
      const features = extractFeatures(recs);
      assert.equal(features.length, 3);
    });

    it("accepts all three valid outcomes", () => {
      const recs = [
        makeRec({ outcome: "win" }),
        makeRec({ outcome: "loss" }),
        makeRec({ outcome: "break_even" }),
      ];
      const features = extractFeatures(recs);
      assert.equal(features.length, 3);
      const outcomes = features.map(f => f.outcome);
      assert.ok(outcomes.includes("win"));
      assert.ok(outcomes.includes("loss"));
      assert.ok(outcomes.includes("break_even"));
    });

    it("empty input returns empty", () => {
      assert.equal(extractFeatures([]).length, 0);
    });
  });

  describe("Pair normalisation", () => {
    it("normalises EURUSD", () => {
      const [f] = extractFeatures([makeRec({ pair: "EURUSD" })]);
      assert.equal(f.pair, "EURUSD");
    });

    it("normalises EUR/USD (with slash)", () => {
      const [f] = extractFeatures([makeRec({ pair: "EUR/USD" })]);
      assert.equal(f.pair, "EURUSD");
    });

    it("normalises lowercase eurusd", () => {
      const [f] = extractFeatures([makeRec({ pair: "eurusd" })]);
      assert.equal(f.pair, "EURUSD");
    });

    it("unknown pair falls back to EURUSD", () => {
      const [f] = extractFeatures([makeRec({ pair: "XAUUSD" })]);
      assert.equal(f.pair, "EURUSD");
    });

    it("handles null pair", () => {
      const [f] = extractFeatures([makeRec({ pair: null as any })]);
      assert.equal(f.pair, "EURUSD");
    });
  });

  describe("Session normalisation", () => {
    it("normalises london", () => {
      const [f] = extractFeatures([makeRec({ session: "london" })]);
      assert.equal(f.session, "london");
    });

    it("normalises new_york", () => {
      const [f] = extractFeatures([makeRec({ session: "new_york" })]);
      assert.equal(f.session, "new_york");
    });

    it("normalises newyork alias", () => {
      const [f] = extractFeatures([makeRec({ session: "newyork" })]);
      assert.equal(f.session, "new_york");
    });

    it("unknown session falls back to unknown", () => {
      const [f] = extractFeatures([makeRec({ session: "tokyo" })]);
      assert.equal(f.session, "unknown");
    });
  });

  describe("Supply/Demand quality", () => {
    it("buy direction → demandQuality = zoneScore, supplyQuality = 0", () => {
      const [f] = extractFeatures([makeRec({ direction: "buy", zoneScore: 80 })]);
      assert.equal(f.demandQuality, 80);
      assert.equal(f.supplyQuality, 0);
    });

    it("sell direction → supplyQuality = zoneScore, demandQuality = 0", () => {
      const [f] = extractFeatures([makeRec({ direction: "sell", zoneScore: 70 })]);
      assert.equal(f.supplyQuality, 70);
      assert.equal(f.demandQuality, 0);
    });

    it("long alias works same as buy", () => {
      const [f] = extractFeatures([makeRec({ direction: "long", zoneScore: 65 })]);
      assert.equal(f.demandQuality, 65);
    });

    it("short alias works same as sell", () => {
      const [f] = extractFeatures([makeRec({ direction: "short", zoneScore: 75 })]);
      assert.equal(f.supplyQuality, 75);
    });
  });

  describe("Score clamping", () => {
    it("scores clamped to [0, 100]", () => {
      const [f] = extractFeatures([makeRec({ zoneScore: 150, liquidityScore: -10 })]);
      assert.equal(f.liquidityScore, 0);
      // demandQuality = buy → zoneScore clamped to 100
      assert.equal(f.demandQuality, 100);
    });
  });

  describe("Volatility derivation", () => {
    it("volatile regime → high volatility", () => {
      const [f] = extractFeatures([makeRec({ regime: "volatile" })]);
      assert.equal(f.volatility, "high");
    });

    it("low_volatility regime → low volatility", () => {
      const [f] = extractFeatures([makeRec({ regime: "low_volatility" })]);
      assert.equal(f.volatility, "low");
    });

    it("trending with high confidence → low volatility", () => {
      const [f] = extractFeatures([makeRec({ regime: "trending", regimeConfidence: 90 })]);
      assert.equal(f.volatility, "low");
    });
  });

  describe("Trend derivation", () => {
    it("trending + buy → bullish", () => {
      const [f] = extractFeatures([makeRec({ regime: "trending", direction: "buy" })]);
      assert.equal(f.trend, "bullish");
    });

    it("trending + sell → bearish", () => {
      const [f] = extractFeatures([makeRec({ regime: "trending", direction: "sell" })]);
      assert.equal(f.trend, "bearish");
    });

    it("ranging → ranging", () => {
      const [f] = extractFeatures([makeRec({ regime: "ranging" })]);
      assert.equal(f.trend, "ranging");
    });
  });

  describe("Dates", () => {
    it("openedAt is a Date object", () => {
      const [f] = extractFeatures([makeRec()]);
      assert.ok(f.openedAt instanceof Date);
    });

    it("closedAt is null when not provided", () => {
      const [f] = extractFeatures([makeRec({ closedAt: null })]);
      assert.equal(f.closedAt, null);
    });
  });

  describe("tradeId", () => {
    it("tradeId is string of numeric id", () => {
      const [f] = extractFeatures([makeRec({ id: 42 })]);
      assert.equal(f.tradeId, "42");
    });
  });
});

describe("buildFeatureSummary", () => {
  it("handles empty features", () => {
    const summary = buildFeatureSummary([]);
    assert.equal(summary.count, 0);
    assert.deepEqual(summary.pairCounts, {});
  });

  it("counts pairs correctly", () => {
    const recs = [
      makeRec({ pair: "EURUSD" }),
      makeRec({ pair: "EURUSD" }),
      makeRec({ pair: "GBPUSD" }),
    ];
    const features = extractFeatures(recs);
    const summary = buildFeatureSummary(features);
    assert.equal(summary.count, 3);
    assert.equal(summary.pairCounts["EURUSD"], 2);
    assert.equal(summary.pairCounts["GBPUSD"], 1);
  });

  it("counts outcomes correctly", () => {
    const recs = [
      makeRec({ outcome: "win" }),
      makeRec({ outcome: "win" }),
      makeRec({ outcome: "loss" }),
    ];
    const features = extractFeatures(recs);
    const summary = buildFeatureSummary(features);
    assert.equal(summary.outcomeCounts["win"], 2);
    assert.equal(summary.outcomeCounts["loss"], 1);
  });

  it("computes avg scores correctly", () => {
    const recs = [
      makeRec({ finalScore: 60, liquidityScore: 70 }),
      makeRec({ finalScore: 80, liquidityScore: 90 }),
    ];
    const features = extractFeatures(recs);
    const summary = buildFeatureSummary(features);
    assert.ok(Math.abs(summary.avgSetupScore - 70) < 1e-10);
    assert.ok(Math.abs(summary.avgLiquidityScore - 80) < 1e-10);
  });

  it("extractedAt is a Date", () => {
    const summary = buildFeatureSummary(extractFeatures([makeRec()]));
    assert.ok(summary.extractedAt instanceof Date);
  });
});
