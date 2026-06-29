import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { MarketContextScore, StabilityAnalysis } from "../../context/types.js";
import { classifyEnvironment, classificationLabel } from "../../context/environment-classifier.js";

function makeMCS(score: number, overrides: Partial<MarketContextScore> = {}): MarketContextScore {
  const label =
    score >= 80 ? "excellent" :
    score >= 65 ? "good" :
    score >= 45 ? "neutral" :
    score >= 30 ? "difficult" : "dangerous";
  return {
    score,
    label,
    components: [
      { name: "Regime Performance", dimension: "regime", condition: "trending", score: 60, weight: 0.20, weightedScore: 12, evidence: "ok", sampleSize: 30, confidence: 70 },
      { name: "Session Performance", dimension: "session", condition: "london", score: 65, weight: 0.15, weightedScore: 9.75, evidence: "ok", sampleSize: 30, confidence: 70 },
      { name: "Trend Performance", dimension: "trend", condition: "bullish", score: 65, weight: 0.15, weightedScore: 9.75, evidence: "ok", sampleSize: 30, confidence: 70 },
      { name: "Volatility Performance", dimension: "volatility", condition: "medium", score: 60, weight: 0.15, weightedScore: 9, evidence: "ok", sampleSize: 30, confidence: 70 },
      { name: "Liquidity Performance", dimension: "liquidity", condition: "good", score: 65, weight: 0.10, weightedScore: 6.5, evidence: "ok", sampleSize: 30, confidence: 70 },
      { name: "Correlation Risk", dimension: "correlation", condition: "low", score: 80, weight: 0.10, weightedScore: 8, evidence: "ok", sampleSize: 0, confidence: 85 },
      { name: "News Context", dimension: "news", condition: "safe", score: 80, weight: 0.10, weightedScore: 8, evidence: "ok", sampleSize: 0, confidence: 90 },
      { name: "Historical Confidence", dimension: "historicalConfidence", condition: "50 trades", score: 50, weight: 0.05, weightedScore: 2.5, evidence: "ok", sampleSize: 50, confidence: 50 },
    ],
    totalWeightedScore: score,
    confidence: 70,
    sampleSize: 50,
    timestamp: new Date().toISOString(),
    evidence: ["ok"],
    ...overrides,
  };
}

function makeStability(overallStability: number, label: StabilityAnalysis["label"] = "stable"): StabilityAnalysis {
  return {
    overallStability,
    label,
    regime: { name: "Regime Stability", score: overallStability, trend: "stable", warning: false, detail: "ok" },
    trend: { name: "Trend Stability", score: overallStability, trend: "stable", warning: false, detail: "ok" },
    volatility: { name: "Volatility Stability", score: overallStability, trend: "stable", warning: false, detail: "ok" },
    liquidity: { name: "Liquidity Stability", score: overallStability, trend: "stable", warning: false, detail: "ok" },
    warnings: [],
    timestamp: new Date().toISOString(),
  };
}

describe("classifyEnvironment", () => {
  it("excellent score with stable market → excellent", () => {
    const { classification } = classifyEnvironment(makeMCS(85), makeStability(80, "very_stable"));
    assert.equal(classification, "excellent");
  });

  it("good score with stable market → good", () => {
    const { classification } = classifyEnvironment(makeMCS(70), makeStability(70, "stable"));
    assert.equal(classification, "good");
  });

  it("neutral score → neutral", () => {
    const { classification } = classifyEnvironment(makeMCS(52), makeStability(60, "stable"));
    assert.equal(classification, "neutral");
  });

  it("difficult score → difficult", () => {
    const { classification } = classifyEnvironment(makeMCS(35), makeStability(50, "stable"));
    assert.equal(classification, "difficult");
  });

  it("dangerous score → dangerous", () => {
    const { classification } = classifyEnvironment(makeMCS(20), makeStability(40, "stable"));
    assert.equal(classification, "dangerous");
  });

  it("very_unstable market caps classification at neutral", () => {
    const mcs = makeMCS(90);
    const stability = makeStability(20, "very_unstable");
    const { classification, adjustedScore } = classifyEnvironment(mcs, stability);
    assert.ok(classification !== "excellent", "Very unstable should not be excellent");
    assert.ok(classification !== "good", "Very unstable should not be good");
    assert.ok(adjustedScore < 65, `Adjusted score ${adjustedScore} should be below good threshold`);
  });

  it("unstable market caps classification below excellent", () => {
    const mcs = makeMCS(90);
    const stability = makeStability(40, "unstable");
    const { classification } = classifyEnvironment(mcs, stability);
    assert.ok(classification !== "excellent");
  });

  it("blocked news environment caps at difficult", () => {
    const mcs = makeMCS(80, {
      components: [
        { name: "Regime Performance", dimension: "regime", condition: "trending", score: 80, weight: 0.20, weightedScore: 16, evidence: "", sampleSize: 30, confidence: 70 },
        { name: "Session Performance", dimension: "session", condition: "london", score: 80, weight: 0.15, weightedScore: 12, evidence: "", sampleSize: 30, confidence: 70 },
        { name: "Trend Performance", dimension: "trend", condition: "bullish", score: 80, weight: 0.15, weightedScore: 12, evidence: "", sampleSize: 30, confidence: 70 },
        { name: "Volatility Performance", dimension: "volatility", condition: "medium", score: 80, weight: 0.15, weightedScore: 12, evidence: "", sampleSize: 30, confidence: 70 },
        { name: "Liquidity Performance", dimension: "liquidity", condition: "good", score: 80, weight: 0.10, weightedScore: 8, evidence: "", sampleSize: 30, confidence: 70 },
        { name: "Correlation Risk", dimension: "correlation", condition: "low", score: 80, weight: 0.10, weightedScore: 8, evidence: "", sampleSize: 0, confidence: 85 },
        { name: "News Context", dimension: "news", condition: "blocked", score: 15, weight: 0.10, weightedScore: 1.5, evidence: "", sampleSize: 0, confidence: 90 },
        { name: "Historical Confidence", dimension: "historicalConfidence", condition: "50 trades", score: 50, weight: 0.05, weightedScore: 2.5, evidence: "", sampleSize: 50, confidence: 50 },
      ],
    });
    const { classification, adjustedScore } = classifyEnvironment(mcs, makeStability(75, "stable"));
    assert.ok(
      ["difficult", "dangerous"].includes(classification),
      `blocked news should cap at difficult, got ${classification}`,
    );
    assert.ok(adjustedScore < 45, `Score ${adjustedScore} should be below neutral threshold`);
  });

  it("evidence array is non-empty", () => {
    const { evidence } = classifyEnvironment(makeMCS(70), makeStability(70, "stable"));
    assert.ok(evidence.length > 0);
    assert.ok(evidence.every(e => typeof e === "string"));
  });

  it("adjustedScore is in [0, 100]", () => {
    const { adjustedScore } = classifyEnvironment(makeMCS(55), makeStability(55, "stable"));
    assert.ok(adjustedScore >= 0 && adjustedScore <= 100);
  });

  it("adjustedScore <= original score (caps only reduce)", () => {
    const mcs = makeMCS(85);
    const stability = makeStability(20, "very_unstable");
    const { adjustedScore } = classifyEnvironment(mcs, stability);
    assert.ok(adjustedScore <= mcs.score, `adjustedScore (${adjustedScore}) should not exceed original (${mcs.score})`);
  });

  it("extreme correlation further reduces score", () => {
    const mcsLow = makeMCS(60, {
      components: [
        { name: "Regime Performance", dimension: "regime", condition: "trending", score: 60, weight: 0.20, weightedScore: 12, evidence: "", sampleSize: 30, confidence: 70 },
        { name: "Session Performance", dimension: "session", condition: "london", score: 60, weight: 0.15, weightedScore: 9, evidence: "", sampleSize: 30, confidence: 70 },
        { name: "Trend Performance", dimension: "trend", condition: "bullish", score: 60, weight: 0.15, weightedScore: 9, evidence: "", sampleSize: 30, confidence: 70 },
        { name: "Volatility Performance", dimension: "volatility", condition: "medium", score: 60, weight: 0.15, weightedScore: 9, evidence: "", sampleSize: 30, confidence: 70 },
        { name: "Liquidity Performance", dimension: "liquidity", condition: "good", score: 60, weight: 0.10, weightedScore: 6, evidence: "", sampleSize: 30, confidence: 70 },
        { name: "Correlation Risk", dimension: "correlation", condition: "extreme", score: 15, weight: 0.10, weightedScore: 1.5, evidence: "", sampleSize: 0, confidence: 85 },
        { name: "News Context", dimension: "news", condition: "safe", score: 80, weight: 0.10, weightedScore: 8, evidence: "", sampleSize: 0, confidence: 90 },
        { name: "Historical Confidence", dimension: "historicalConfidence", condition: "50 trades", score: 50, weight: 0.05, weightedScore: 2.5, evidence: "", sampleSize: 50, confidence: 50 },
      ],
    });
    const noExtreme = makeMCS(60);
    const { adjustedScore: a1 } = classifyEnvironment(mcsLow, makeStability(75, "stable"));
    const { adjustedScore: a2 } = classifyEnvironment(noExtreme, makeStability(75, "stable"));
    assert.ok(a1 < a2, `Extreme correlation (${a1}) should reduce score vs normal (${a2})`);
  });
});

describe("classificationLabel", () => {
  it("returns correct label for each class", () => {
    const classes = ["excellent", "good", "neutral", "difficult", "dangerous"] as const;
    for (const cls of classes) {
      const result = classificationLabel(cls);
      assert.ok(result.label.length > 0);
      assert.ok(result.color.length > 0);
      assert.ok(result.description.length > 0);
    }
  });

  it("excellent has emerald color", () => {
    assert.equal(classificationLabel("excellent").color, "emerald");
  });

  it("dangerous has red color", () => {
    assert.equal(classificationLabel("dangerous").color, "red");
  });
});
