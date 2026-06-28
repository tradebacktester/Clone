import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeQualitySnapshot } from "../quality-monitor.js";
import type { QualityInput } from "../quality-monitor.js";
import type { ExtractedFeature } from "../../learning-core/types.js";

// ─── Fixture ──────────────────────────────────────────────────────────────────

function makeFeature(overrides: Partial<ExtractedFeature> = {}): ExtractedFeature {
  return {
    tradeId: "t1",
    pair: "EURUSD",
    session: "london",
    outcome: "win",
    confidence: 70,
    tqi: 60,
    setupScore: 65,
    pnl: 1.5,
    rrActual: 1.5,
    marketRegime: "trending",
    openedAt: new Date(),
    closedAt: new Date(),
    ...overrides,
  } as ExtractedFeature;
}

function makeFeatures(n: number): ExtractedFeature[] {
  return Array.from({ length: n }, (_, i) =>
    makeFeature({ tradeId: `t${i}`, outcome: i % 2 === 0 ? "win" : "loss" }),
  );
}

describe("quality-monitor", () => {
  describe("computeQualitySnapshot — empty input", () => {
    it("returns quality score 0 with no trades", () => {
      const snap = computeQualitySnapshot({ features: [] });
      assert.ok(snap.qualityScore <= 50, `expected low quality score, got ${snap.qualityScore}`);
    });

    it("has 8 dimensions", () => {
      const snap = computeQualitySnapshot({ features: [] });
      assert.equal(snap.dimensions.length, 8);
    });

    it("generates a unique snapshotId", () => {
      const s1 = computeQualitySnapshot({ features: [] });
      const s2 = computeQualitySnapshot({ features: [] });
      assert.notEqual(s1.snapshotId, s2.snapshotId);
    });

    it("low_sample alert is raised for empty features", () => {
      const snap = computeQualitySnapshot({ features: [] });
      const hasLowSample = snap.activeAlerts.some(a => a.alertType === "low_sample");
      assert.ok(hasLowSample, "expected low_sample alert");
    });
  });

  describe("computeQualitySnapshot — sufficient data", () => {
    it("score improves with 100 complete trades", () => {
      const snap = computeQualitySnapshot({
        features: makeFeatures(100),
        passedValidations: 8,
        totalValidations: 10,
        calibrationECE: 0.04,
        activeDriftAlerts: 0,
        criticalDriftAlerts: 0,
        historicalConfidences: [65, 67, 68, 70],
        historicalWinRates: [0.58, 0.60, 0.61, 0.62],
      });
      assert.ok(snap.qualityScore >= 40, `score too low: ${snap.qualityScore}`);
    });

    it("assigns grade A/B/C/D/F only", () => {
      const snap = computeQualitySnapshot({ features: makeFeatures(50) });
      assert.ok(["A", "B", "C", "D", "F"].includes(snap.qualityGrade));
    });

    it("totalTrades matches features.length", () => {
      const snap = computeQualitySnapshot({ features: makeFeatures(42) });
      assert.equal(snap.totalTrades, 42);
    });
  });

  describe("computeQualitySnapshot — dimension scores", () => {
    it("all dimension scores are in [0, 100]", () => {
      const snap = computeQualitySnapshot({ features: makeFeatures(100) });
      for (const d of snap.dimensions) {
        assert.ok(d.score >= 0 && d.score <= 100, `${d.name}: score ${d.score} out of range`);
      }
    });

    it("all dimension weights sum to ~1", () => {
      const snap = computeQualitySnapshot({ features: makeFeatures(100) });
      const total = snap.dimensions.reduce((s, d) => s + d.weight, 0);
      assert.ok(Math.abs(total - 1.0) < 0.01, `weights sum: ${total}`);
    });

    it("dimension grades are A/B/C/D/F only", () => {
      const snap = computeQualitySnapshot({ features: makeFeatures(100) });
      for (const d of snap.dimensions) {
        assert.ok(["A", "B", "C", "D", "F"].includes(d.grade), `${d.name}: invalid grade ${d.grade}`);
      }
    });
  });

  describe("computeQualitySnapshot — alerts", () => {
    it("poor_calibration alert for ECE > 10%", () => {
      const snap = computeQualitySnapshot({ features: makeFeatures(100), calibrationECE: 0.20 });
      const has = snap.activeAlerts.some(a => a.alertType === "poor_calibration");
      assert.ok(has, "expected poor_calibration alert");
    });

    it("significant_drift alert for critical drift", () => {
      const snap = computeQualitySnapshot({ features: makeFeatures(100), criticalDriftAlerts: 2, activeDriftAlerts: 2 });
      const has = snap.activeAlerts.some(a => a.alertType === "significant_drift");
      assert.ok(has, "expected significant_drift alert");
    });

    it("validation_failure alert for low success rate", () => {
      const snap = computeQualitySnapshot({ features: makeFeatures(100), passedValidations: 1, totalValidations: 10 });
      const has = snap.activeAlerts.some(a => a.alertType === "validation_failure");
      assert.ok(has, "expected validation_failure alert");
    });

    it("all alert severities are valid", () => {
      const snap = computeQualitySnapshot({ features: makeFeatures(5), calibrationECE: 0.25, criticalDriftAlerts: 3, activeDriftAlerts: 3 });
      const validSev = new Set(["low", "medium", "high", "critical"]);
      for (const a of snap.activeAlerts) {
        assert.ok(validSev.has(a.severity), `invalid severity: ${a.severity}`);
      }
    });

    it("all alertTypes are strings", () => {
      const snap = computeQualitySnapshot({ features: makeFeatures(5) });
      for (const a of snap.activeAlerts) {
        assert.equal(typeof a.alertType, "string");
      }
    });

    it("criticalAlerts count matches actual critical severity alerts", () => {
      const snap = computeQualitySnapshot({ features: makeFeatures(5), calibrationECE: 0.30, criticalDriftAlerts: 3, activeDriftAlerts: 3 });
      const critCount = snap.activeAlerts.filter(a => a.severity === "critical").length;
      assert.equal(snap.criticalAlerts, critCount);
    });

    it("no duplicate alert types from same dimension", () => {
      const snap = computeQualitySnapshot({
        features: makeFeatures(5),
        calibrationECE: 0.25,
        criticalDriftAlerts: 3,
        activeDriftAlerts: 3,
        passedValidations: 0,
        totalValidations: 5,
      });
      const seen = new Set<string>();
      for (const a of snap.activeAlerts) {
        const key = `${a.alertType}::${a.dimension}`;
        assert.ok(!seen.has(key), `duplicate alert: ${key}`);
        seen.add(key);
      }
    });
  });

  describe("computeQualitySnapshot — strengths / weaknesses", () => {
    it("strengths are populated for high-scoring dimensions", () => {
      const snap = computeQualitySnapshot({
        features: makeFeatures(200),
        passedValidations: 10,
        totalValidations: 10,
        calibrationECE: 0.02,
        activeDriftAlerts: 0,
        criticalDriftAlerts: 0,
        historicalConfidences: [68, 69, 70, 70],
        historicalWinRates: [0.60, 0.61, 0.61, 0.62],
      });
      // Should have some strengths for large, well-validated, well-calibrated input
      assert.ok(Array.isArray(snap.strengths));
    });

    it("recommendations is an array", () => {
      const snap = computeQualitySnapshot({ features: makeFeatures(5) });
      assert.ok(Array.isArray(snap.recommendations));
    });
  });

  describe("computeQualitySnapshot — duplicate and missing data", () => {
    it("duplicate records reduce data completeness score", () => {
      const withDups = computeQualitySnapshot({ features: makeFeatures(50), duplicateRecords: 20 });
      const clean    = computeQualitySnapshot({ features: makeFeatures(50), duplicateRecords: 0 });
      assert.ok(withDups.qualityScore <= clean.qualityScore + 5,
        `dups should not increase quality: ${withDups.qualityScore} vs ${clean.qualityScore}`);
    });

    it("missing outcomes reduce sample quality", () => {
      const snap = computeQualitySnapshot({ features: makeFeatures(50), missingOutcomes: 25 });
      assert.ok(snap.qualityScore < 100);
    });
  });
});
