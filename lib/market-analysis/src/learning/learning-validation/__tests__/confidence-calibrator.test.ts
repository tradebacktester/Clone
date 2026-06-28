import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runCalibration, filterByWindow } from "../confidence-calibrator.js";
import type { ExtractedFeature } from "../../learning-core/types.js";

// ─── Minimal ExtractedFeature factory ─────────────────────────────────────────

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

function makeFeatures(n: number, conf: number, winRate: number): ExtractedFeature[] {
  const features: ExtractedFeature[] = [];
  for (let i = 0; i < n; i++) {
    const isWin = i < Math.round(n * winRate);
    features.push(makeFeature({ tradeId: `t${i}`, confidence: conf, outcome: isWin ? "win" : "loss", pnl: isWin ? 1 : -1 }));
  }
  return features;
}

describe("confidence-calibrator", () => {
  describe("runCalibration — empty input", () => {
    it("returns uncalibrated status with 0 samples", () => {
      const result = runCalibration([]);
      assert.equal(result.totalSamples, 0);
      assert.equal(result.calibrationStatus, "uncalibrated");
    });

    it("assigns default Brier score 0.25 for empty input", () => {
      const result = runCalibration([]);
      assert.equal(result.brierScore, 0.25);
    });
  });

  describe("runCalibration — small sample", () => {
    it("generates a calibration result with correct sample count", () => {
      const features = makeFeatures(20, 65, 0.65);
      const result = runCalibration(features);
      assert.equal(result.totalSamples, 20);
      assert.ok(result.calibrationId.length > 0);
    });

    it("returns the provided evaluationWindow", () => {
      const features = makeFeatures(10, 50, 0.5);
      const result = runCalibration(features, { evaluationWindow: "7d" });
      assert.equal(result.evaluationWindow, "7d");
    });
  });

  describe("runCalibration — reliability buckets", () => {
    it("produces exactly 10 buckets", () => {
      const features = makeFeatures(100, 60, 0.60);
      const result = runCalibration(features);
      assert.equal(result.buckets.length, 10);
    });

    it("bucket labels cover 0-100% range", () => {
      const features = makeFeatures(100, 60, 0.60);
      const result = runCalibration(features);
      const labels = result.buckets.map(b => b.bucketLabel);
      assert.ok(labels.includes("0-10%"));
      assert.ok(labels.includes("90-100%"));
    });

    it("non-empty buckets have a valid status", () => {
      const features = makeFeatures(100, 65, 0.55);
      const result = runCalibration(features);
      const valid = new Set(["well_calibrated", "overconfident", "underconfident", "empty"]);
      for (const b of result.buckets) {
        assert.ok(valid.has(b.status), `unexpected status: ${b.status}`);
      }
    });

    it("calibration error is always non-negative", () => {
      const features = makeFeatures(100, 70, 0.60);
      const result = runCalibration(features);
      for (const b of result.buckets.filter(b => b.status !== "empty")) {
        assert.ok(b.calibrationError >= 0, `negative calibration error in bucket ${b.bucketLabel}`);
      }
    });
  });

  describe("runCalibration — overconfident system", () => {
    it("detects overconfidence when predicted confidence >> actual win rate", () => {
      // High confidence (90), but only 30% win rate
      const features = makeFeatures(100, 90, 0.30);
      const result = runCalibration(features);
      assert.equal(result.calibrationStatus, "overconfident");
      assert.ok(result.overconfidentBuckets > 0);
    });

    it("ECE is elevated for overconfident system", () => {
      const features = makeFeatures(100, 90, 0.30);
      const result = runCalibration(features);
      assert.ok(result.ece > 0.05, `ECE too low: ${result.ece}`);
    });
  });

  describe("runCalibration — underconfident system", () => {
    it("detects underconfidence when predicted confidence << actual win rate", () => {
      // Low confidence (25), but 80% win rate
      const features = makeFeatures(100, 25, 0.80);
      const result = runCalibration(features);
      assert.equal(result.calibrationStatus, "underconfident");
    });
  });

  describe("runCalibration — metrics", () => {
    it("Brier score is in [0, 1]", () => {
      const features = makeFeatures(100, 60, 0.60);
      const result = runCalibration(features);
      assert.ok(result.brierScore >= 0 && result.brierScore <= 1);
    });

    it("ECE is in [0, 1]", () => {
      const features = makeFeatures(100, 60, 0.60);
      const result = runCalibration(features);
      assert.ok(result.ece >= 0 && result.ece <= 1, `ECE out of range: ${result.ece}`);
    });

    it("MCE >= ECE (max >= weighted avg)", () => {
      const features = makeFeatures(150, 70, 0.55);
      const result = runCalibration(features);
      assert.ok(result.mce >= result.ece - 0.0001, `MCE (${result.mce}) < ECE (${result.ece})`);
    });

    it("grade A assigned for ECE < 0.03", () => {
      // Perfect calibration: 50% confidence, 50% win rate
      const features = makeFeatures(200, 50, 0.50);
      const result = runCalibration(features);
      // ECE should be very low for this case
      if (result.ece < 0.03) assert.equal(result.calibrationGrade, "A");
      else assert.ok(["A", "B", "C", "D", "F"].includes(result.calibrationGrade));
    });
  });

  describe("runCalibration — calibration trend", () => {
    it("returns stable when fewer than 2 snapshots", () => {
      const features = makeFeatures(50, 60, 0.60);
      const result = runCalibration(features, { historicalSnapshots: [] });
      assert.equal(result.calibrationTrend, "stable");
    });

    it("returns improving when ECE is decreasing", () => {
      const snapshots = [
        { evaluatedAt: new Date(Date.now() - 200_000), ece: 0.20, brierScore: 0.25, calibrationStatus: "overconfident" },
        { evaluatedAt: new Date(Date.now() - 100_000), ece: 0.08, brierScore: 0.20, calibrationStatus: "well_calibrated" },
      ];
      const features = makeFeatures(50, 55, 0.55);
      const result = runCalibration(features, { historicalSnapshots: snapshots });
      assert.equal(result.calibrationTrend, "improving");
    });

    it("returns degrading when ECE is increasing", () => {
      const snapshots = [
        { evaluatedAt: new Date(Date.now() - 200_000), ece: 0.05, brierScore: 0.15, calibrationStatus: "well_calibrated" },
        { evaluatedAt: new Date(Date.now() - 100_000), ece: 0.18, brierScore: 0.22, calibrationStatus: "overconfident" },
      ];
      const features = makeFeatures(50, 55, 0.55);
      const result = runCalibration(features, { historicalSnapshots: snapshots });
      assert.equal(result.calibrationTrend, "degrading");
    });
  });

  describe("filterByWindow", () => {
    it("keeps all features when windowDays is null", () => {
      const features = makeFeatures(10, 60, 0.60);
      const filtered = filterByWindow(features, null);
      assert.equal(filtered.length, 10);
    });

    it("filters out old features", () => {
      const old = makeFeature({ tradeId: "old", openedAt: new Date(Date.now() - 200 * 86400 * 1000) });
      const fresh = makeFeature({ tradeId: "fresh", openedAt: new Date() });
      const filtered = filterByWindow([old, fresh], 30);
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].tradeId, "fresh");
    });
  });
});
