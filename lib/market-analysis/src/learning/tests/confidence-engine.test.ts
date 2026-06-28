import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  wilsonLowerBound,
  consistencyFactor,
  dataQualityFactor,
  computeSegmentConfidence,
  computeConfidenceReport,
  confidenceTier,
} from "../learning-confidence/confidence-engine.js";
import type { ExtractedFeature, DataValidationResult } from "../learning-core/types.js";

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

function makeValidation(completeness = 90): DataValidationResult {
  return {
    isValid: true,
    totalRecords: 20,
    usableRecords: 20,
    rejectedRecords: 0,
    completenessScore: completeness,
    issues: [],
    qualityNotes: [],
  };
}

function makeFeatures(n: number, winRate = 0.6): ExtractedFeature[] {
  return Array.from({ length: n }, (_, i) => makeFeature({
    tradeId: String(i),
    outcome: i < Math.floor(n * winRate) ? "win" : "loss",
    pnl: i < Math.floor(n * winRate) ? 100 : -50,
  }));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("wilsonLowerBound", () => {
  it("returns 0 for n=0", () => {
    assert.equal(wilsonLowerBound(0, 0), 0);
  });

  it("returns value in [0,1]", () => {
    const lb = wilsonLowerBound(7, 10);
    assert.ok(lb >= 0 && lb <= 1, `lb=${lb} out of range`);
  });

  it("is less than observed rate (conservative)", () => {
    const wins = 7, n = 10;
    const observed = wins / n;
    const lb = wilsonLowerBound(wins, n);
    assert.ok(lb < observed, `wilson=${lb} should be < observed=${observed}`);
  });

  it("increases with more evidence (same win rate)", () => {
    const lb10 = wilsonLowerBound(6, 10);
    const lb30 = wilsonLowerBound(18, 30);
    const lb100 = wilsonLowerBound(60, 100);
    assert.ok(lb10 < lb30, `lb10=${lb10} should be < lb30=${lb30}`);
    assert.ok(lb30 < lb100, `lb30=${lb30} should be < lb100=${lb100}`);
  });

  it("approaches observed rate with large sample", () => {
    const lb = wilsonLowerBound(600, 1000);
    assert.ok(Math.abs(lb - 0.6) < 0.05, `expected close to 0.6, got ${lb}`);
  });

  it("handles 100% win rate", () => {
    const lb = wilsonLowerBound(10, 10);
    assert.ok(lb > 0.7 && lb <= 1, `lb=${lb}`);
  });

  it("handles 0% win rate", () => {
    const lb = wilsonLowerBound(0, 10);
    assert.ok(lb >= 0 && lb < 0.1, `lb=${lb}`);
  });
});

describe("consistencyFactor", () => {
  it("returns high value for identical win rates (consistent)", () => {
    const cf = consistencyFactor([0.6, 0.6, 0.6]);
    assert.ok(cf > 0.8, `cf=${cf}`);
  });

  it("returns 0.8 for single-element array", () => {
    assert.equal(consistencyFactor([0.6]), 0.8);
  });

  it("returns lower value for inconsistent win rates", () => {
    const cfConsistent = consistencyFactor([0.6, 0.6, 0.6]);
    const cfInconsistent = consistencyFactor([0.2, 0.8, 0.1, 0.9]);
    assert.ok(cfInconsistent < cfConsistent, `inconsistent=${cfInconsistent} should be < consistent=${cfConsistent}`);
  });

  it("output is clamped to [0.1, 1.0]", () => {
    const cf = consistencyFactor([0, 1, 0, 1, 0, 1]);
    assert.ok(cf >= 0.1 && cf <= 1.0);
  });
});

describe("dataQualityFactor", () => {
  it("100% completeness → 1.0", () => { assert.equal(dataQualityFactor(100), 1.0); });
  it("0% completeness → 0.0", () => { assert.equal(dataQualityFactor(0), 0.0); });
  it("50% completeness → 0.5", () => { assert.equal(dataQualityFactor(50), 0.5); });
  it("clamped to [0,1]", () => {
    assert.equal(dataQualityFactor(150), 1.0);
    assert.equal(dataQualityFactor(-10), 0.0);
  });
});

describe("confidenceTier", () => {
  it("insufficient for n < 5", () => {
    assert.equal(confidenceTier(90, 3), "insufficient");
  });
  it("low for score < 30", () => {
    assert.equal(confidenceTier(20, 10), "low");
  });
  it("moderate for score 30–50", () => {
    assert.equal(confidenceTier(40, 10), "moderate");
  });
  it("high for score 50–75", () => {
    assert.equal(confidenceTier(60, 10), "high");
  });
  it("very_high for score >= 75", () => {
    assert.equal(confidenceTier(80, 10), "very_high");
  });
});

describe("computeSegmentConfidence", () => {
  it("returns insufficient tier for n < 5", () => {
    const features = makeFeatures(3, 0.67);
    const result = computeSegmentConfidence("test", features, features, 90);
    assert.equal(result.confidenceTier, "insufficient");
    assert.equal(result.finalConfidence, 0);
  });

  it("returns confidence > 0 for sufficient sample", () => {
    const features = makeFeatures(20, 0.6);
    const result = computeSegmentConfidence("EURUSD", features, features, 90);
    assert.ok(result.finalConfidence > 0, `finalConfidence=${result.finalConfidence}`);
  });

  it("lower confidence for poor data quality", () => {
    const features = makeFeatures(20, 0.6);
    const highQuality = computeSegmentConfidence("X", features, features, 95);
    const lowQuality = computeSegmentConfidence("X", features, features, 20);
    assert.ok(
      lowQuality.finalConfidence < highQuality.finalConfidence,
      `lowQ=${lowQuality.finalConfidence} should be < highQ=${highQuality.finalConfidence}`,
    );
  });

  it("includes all required factor fields", () => {
    const features = makeFeatures(15, 0.6);
    const result = computeSegmentConfidence("EURUSD", features, features, 80);
    assert.ok(result.factors.length > 0);
    for (const f of result.factors) {
      assert.ok(typeof f.name === "string");
      assert.ok(f.value >= 0 && f.value <= 1, `factor ${f.name} value=${f.value}`);
      assert.ok(f.weight > 0 && f.weight <= 1, `factor ${f.name} weight=${f.weight}`);
    }
  });

  it("factor weights sum to ~1.0", () => {
    const features = makeFeatures(20, 0.6);
    const result = computeSegmentConfidence("EURUSD", features, features, 80);
    const weightSum = result.factors.reduce((s, f) => s + f.weight, 0);
    assert.ok(Math.abs(weightSum - 1.0) < 0.001, `weight sum=${weightSum}`);
  });

  it("provides explanation string", () => {
    const features = makeFeatures(15, 0.6);
    const result = computeSegmentConfidence("EURUSD", features, features, 80);
    assert.ok(result.explanation.length > 20);
  });
});

describe("computeConfidenceReport", () => {
  it("overall confidence 0 with < 5 samples", () => {
    const features = makeFeatures(3, 0.67);
    const v = makeValidation(80);
    const report = computeConfidenceReport(features, v);
    assert.equal(report.overallConfidence, 0);
    assert.equal(report.minSampleReached, false);
  });

  it("minSampleReached true with 5+ samples", () => {
    const features = makeFeatures(10, 0.6);
    const v = makeValidation(80);
    const report = computeConfidenceReport(features, v);
    assert.equal(report.minSampleReached, true);
  });

  it("byPair breakdown contains at least one entry", () => {
    const features = makeFeatures(10, 0.6);
    const v = makeValidation(80);
    const report = computeConfidenceReport(features, v);
    assert.ok(Object.keys(report.byPair).length > 0);
  });

  it("dataQuality matches validation completeness", () => {
    const features = makeFeatures(10, 0.6);
    const v = makeValidation(75);
    const report = computeConfidenceReport(features, v);
    assert.equal(report.dataQuality, 75);
  });

  it("overall confidence in [0, 100]", () => {
    const features = makeFeatures(50, 0.65);
    const v = makeValidation(90);
    const report = computeConfidenceReport(features, v);
    assert.ok(report.overallConfidence >= 0 && report.overallConfidence <= 100);
  });

  it("methodology string is non-empty", () => {
    const features = makeFeatures(10, 0.6);
    const v = makeValidation(80);
    const report = computeConfidenceReport(features, v);
    assert.ok(report.methodology.length > 50);
  });
});
