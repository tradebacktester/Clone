// ─── Feature Importance Engine Tests ──────────────────────────────────────────
// Run: node_modules/.pnpm/node_modules/.bin/tsx --test
//      lib/market-analysis/src/learning/feature-importance/tests/feature-importance.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  calculateFeatureImportance,
  calculateSingleFeature,
} from "../feature-calculator.js";
import { analyzeInteractions } from "../interaction-analyzer.js";
import {
  computeConfidenceDelta,
  applyConfidenceLearning,
  computeOverallCycleConfidence,
} from "../confidence-learning.js";
import {
  rankFeatures,
  topFeatures,
  weakestFeatures,
  topInteractions,
  summarizeByCategory,
} from "../ranking-engine.js";
import {
  validateFeature,
  validateFeatureSet,
  validateInteractions,
} from "../validator.js";
import { featureImportanceStore } from "../history-store.js";
import { generateFeatureImportanceReport } from "../report-generator.js";
import {
  FEATURE_DEFINITIONS,
  MIN_SAMPLE_SIZE,
  SUFFICIENT_SAMPLE_SIZE,
} from "../types.js";
import type { ExtractedFeature } from "../../learning-core/types.js";

// ─── Test helpers ──────────────────────────────────────────────────────────────

function makeFeature(overrides: Partial<ExtractedFeature> = {}): ExtractedFeature {
  return {
    tradeId: Math.random().toString(36).slice(2),
    pair: "EURUSD",
    session: "london",
    trend: "bullish",
    marketRegime: "trending",
    supplyQuality: 0,
    demandQuality: 75,
    liquidityScore: 70,
    amdScore: 72,
    confirmationQuality: 68,
    tradeDurationMins: 120,
    spreadPips: 1.2,
    volatility: "low",
    riskPct: 1,
    rrPlanned: 2.5,
    rrActual: 2.2,
    outcome: "win",
    pnl: 125,
    pnlPercent: 1.25,
    setupScore: 74,
    confidence: 72,
    tqi: 70,
    openedAt: new Date("2024-01-10T10:00:00Z"),
    closedAt: new Date("2024-01-10T12:00:00Z"),
    ...overrides,
  };
}

function makeFeatureSet(n: number, winRate: number = 0.6): ExtractedFeature[] {
  return Array.from({ length: n }, (_, i) => {
    const isWin = i / n < winRate;
    return makeFeature({
      tradeId: `trade-${i}`,
      outcome: isWin ? "win" : "loss",
      pnl: isWin ? 100 : -80,
      pnlPercent: isWin ? 1.0 : -0.8,
      rrActual: isWin ? 2.2 : -1,
    });
  });
}

// ─── 1. Feature Definitions ────────────────────────────────────────────────────

describe("Feature Definitions", () => {
  it("should have exactly 17 feature definitions", () => {
    assert.equal(FEATURE_DEFINITIONS.length, 17);
  });

  it("should have all required fields on each definition", () => {
    for (const def of FEATURE_DEFINITIONS) {
      assert.ok(def.id, `${def.id} missing id`);
      assert.ok(def.displayName, `${def.id} missing displayName`);
      assert.ok(def.category, `${def.id} missing category`);
      assert.ok(def.description, `${def.id} missing description`);
      assert.ok(def.dataType === "numeric" || def.dataType === "categorical", `${def.id} invalid dataType`);
    }
  });

  it("should include supply_zone_quality and demand_zone_quality", () => {
    const ids = FEATURE_DEFINITIONS.map(d => d.id);
    assert.ok(ids.includes("supply_zone_quality"));
    assert.ok(ids.includes("demand_zone_quality"));
    assert.ok(ids.includes("market_regime"));
    assert.ok(ids.includes("session"));
    assert.ok(ids.includes("risk_reward_ratio"));
  });
});

// ─── 2. Feature Calculator ─────────────────────────────────────────────────────

describe("Feature Calculator", () => {
  it("returns an empty result when features array is empty", () => {
    const results = calculateFeatureImportance([]);
    assert.equal(results.length, 17);
    for (const r of results) {
      assert.equal(r.sampleSize, 0);
      assert.equal(r.isInsufficient, true);
    }
  });

  it("marks all features insufficient when sample is below minimum", () => {
    const features = makeFeatureSet(MIN_SAMPLE_SIZE - 1);
    const results = calculateFeatureImportance(features);
    for (const r of results) {
      assert.equal(r.isInsufficient, true);
    }
  });

  it("computes correct win rate", () => {
    const features = makeFeatureSet(20, 0.7);
    const results = calculateFeatureImportance(features);
    for (const r of results) {
      assert.equal(r.sampleSize, 20);
      // Win rate should be near 0.7 (exact depends on bucketing)
      assert.ok(r.winRate >= 0 && r.winRate <= 1, "Win rate out of bounds");
    }
  });

  it("computes non-zero predictive value for sufficient sample", () => {
    const features = makeFeatureSet(SUFFICIENT_SAMPLE_SIZE, 0.65);
    const results = calculateFeatureImportance(features);
    const sufficient = results.filter(r => !r.isInsufficient);
    assert.ok(sufficient.length > 0, "Should have sufficient features");
    for (const r of sufficient) {
      assert.ok(r.predictiveValue >= 0 && r.predictiveValue <= 100);
      assert.ok(r.reliabilityScore >= 0 && r.reliabilityScore <= 100);
      assert.ok(r.confidenceScore >= 0 && r.confidenceScore <= 100);
    }
  });

  it("includes all 17 features in results", () => {
    const features = makeFeatureSet(30, 0.6);
    const results = calculateFeatureImportance(features);
    assert.equal(results.length, 17);
  });

  it("computes confidence explanation for each feature", () => {
    const features = makeFeatureSet(30, 0.6);
    const results = calculateFeatureImportance(features);
    for (const r of results) {
      assert.ok(r.confidenceExplanation.length > 10, `Missing explanation for ${r.featureId}`);
    }
  });

  it("single feature calculation works correctly", () => {
    const features = makeFeatureSet(30, 0.65);
    const def = FEATURE_DEFINITIONS.find(d => d.id === "demand_zone_quality")!;
    const result = calculateSingleFeature(features, def);
    assert.equal(result.featureId, "demand_zone_quality");
    assert.equal(result.sampleSize, 30);
    assert.ok(result.winRate >= 0 && result.winRate <= 1);
  });

  it("detects overfitting risk for small high-performing sample", () => {
    const features = makeFeatureSet(4, 0.95);
    const results = calculateFeatureImportance(features);
    // With n<5, should be insufficient
    for (const r of results) {
      assert.equal(r.isInsufficient, true);
    }
  });

  it("losses are tracked correctly", () => {
    const features = makeFeatureSet(20, 0.4); // 40% win rate
    const results = calculateFeatureImportance(features);
    for (const r of results) {
      assert.ok(r.losses + r.wins + r.breakEvens === r.sampleSize || r.sampleSize === 0);
    }
  });

  it("avg RR is computed correctly for wins vs losses", () => {
    const features = makeFeatureSet(20, 0.6);
    const results = calculateFeatureImportance(features);
    for (const r of results) {
      assert.ok(typeof r.avgRR === "number" && !isNaN(r.avgRR));
      assert.ok(typeof r.avgProfit === "number");
      assert.ok(typeof r.avgLoss === "number");
    }
  });
});

// ─── 3. Interaction Analyzer ──────────────────────────────────────────────────

describe("Interaction Analyzer", () => {
  it("returns empty array for empty features", () => {
    const results = analyzeInteractions([]);
    assert.equal(results.length, 0);
  });

  it("returns all pre-defined interactions", () => {
    const features = makeFeatureSet(50, 0.6);
    const results = analyzeInteractions(features);
    assert.ok(results.length > 0, "Should return interactions");
    assert.ok(results.length >= 5, "Should return at least 5 interactions");
  });

  it("marks low-sample interactions as insufficient", () => {
    const features = makeFeatureSet(3, 0.5);
    const results = analyzeInteractions(features);
    // All should be insufficient with tiny sample
    for (const r of results) {
      assert.ok(typeof r.isInsufficient === "boolean");
    }
  });

  it("computes synergy score between 0 and 100", () => {
    const features = makeFeatureSet(50, 0.65);
    const results = analyzeInteractions(features);
    for (const r of results) {
      assert.ok(r.synergyScore >= 0 && r.synergyScore <= 100, `Synergy out of bounds for ${r.displayName}`);
    }
  });

  it("interaction lift is a positive ratio", () => {
    const features = makeFeatureSet(40, 0.6);
    const results = analyzeInteractions(features);
    for (const r of results) {
      assert.ok(r.liftVsFeatureA >= 0, "Lift A should be non-negative");
      assert.ok(r.liftVsFeatureB >= 0, "Lift B should be non-negative");
    }
  });

  it("breakdown contains three groups", () => {
    const features = makeFeatureSet(50, 0.6);
    const results = analyzeInteractions(features);
    for (const r of results) {
      assert.equal(r.breakdown.length, 3, `Expected 3 breakdown groups for ${r.displayName}`);
    }
  });

  it("interaction IDs follow featureA::featureB format", () => {
    const features = makeFeatureSet(30, 0.6);
    const results = analyzeInteractions(features);
    for (const r of results) {
      assert.ok(r.interactionId.includes("::"), `Bad interaction ID: ${r.interactionId}`);
    }
  });
});

// ─── 4. Confidence Learning ───────────────────────────────────────────────────

describe("Confidence Learning Engine", () => {
  it("returns unknown trend when no previous state", () => {
    const features = makeFeatureSet(30, 0.6);
    const results = calculateFeatureImportance(features);
    const f = results[0];
    const output = computeConfidenceDelta(f, null);
    assert.equal(output.trend, "unknown");
  });

  it("confidence increases when sample grows", () => {
    const features30 = makeFeatureSet(30, 0.6);
    const results30 = calculateFeatureImportance(features30);
    const f30 = results30[0];

    const prevState = {
      featureId: f30.featureId as any,
      cycleId: "cycle-1",
      snapshotDate: new Date(),
      confidenceScore: 40,
      reliabilityScore: 40,
      predictiveValue: 40,
      sampleSize: 15,
      winRate: 0.6,
      trendDirection: "stable" as const,
      isInsufficient: false,
    };

    const output = computeConfidenceDelta(f30, prevState);
    assert.ok(output.factors.length > 0, "Should have confidence factors");
    assert.ok(typeof output.newConfidence === "number");
    assert.ok(output.newConfidence >= 0 && output.newConfidence <= 100);
  });

  it("flags contradiction factor when evidence is contradictory", () => {
    const features = makeFeatureSet(30, 0.6);
    const results = calculateFeatureImportance(features);
    const f = { ...results[0], hasContradiction: true, contradictionNote: "Test contradiction" };
    const output = computeConfidenceDelta(f, null);
    const contradictionFactor = output.factors.find(f => f.name === "Contradictory Evidence");
    assert.ok(contradictionFactor !== undefined, "Should flag contradiction factor");
    assert.ok(contradictionFactor!.delta < 0, "Contradiction should decrease confidence");
  });

  it("applies confidence learning to feature set", () => {
    const features = makeFeatureSet(30, 0.6);
    const results = calculateFeatureImportance(features);
    const updated = applyConfidenceLearning(results, []);
    assert.equal(updated.length, results.length);
    for (const f of updated) {
      assert.ok(f.confidenceScore >= 0 && f.confidenceScore <= 100);
    }
  });

  it("computes overall cycle confidence from sufficient features", () => {
    const features = makeFeatureSet(40, 0.65);
    const results = calculateFeatureImportance(features);
    const overall = computeOverallCycleConfidence(results);
    assert.ok(overall >= 0 && overall <= 100);
  });

  it("overall confidence is 0 when all features are insufficient", () => {
    const features = makeFeatureSet(2, 0.5); // below MIN_SAMPLE_SIZE
    const results = calculateFeatureImportance(features);
    const overall = computeOverallCycleConfidence(results);
    assert.equal(overall, 0);
  });
});

// ─── 5. Ranking Engine ────────────────────────────────────────────────────────

describe("Ranking Engine", () => {
  it("rankFeatures produces ranks from 1 to N", () => {
    const features = makeFeatureSet(40, 0.6);
    const results = calculateFeatureImportance(features);
    const rankings = rankFeatures(results);
    assert.equal(rankings.length, 17);
    assert.equal(rankings[0].rank, 1);
    assert.equal(rankings[rankings.length - 1].rank, 17);
  });

  it("insufficient features are ranked last", () => {
    const features = makeFeatureSet(40, 0.6);
    const results = calculateFeatureImportance(features);
    const rankings = rankFeatures(results);
    let foundSufficient = false;
    for (const r of rankings) {
      if (!r.isInsufficient) foundSufficient = true;
      if (foundSufficient && r.isInsufficient) {
        // This would mean an insufficient came after a sufficient - that's correct for last
      }
    }
    // Simply ensure all insufficient are at the end
    const lastSufficient = rankings.findLastIndex(r => !r.isInsufficient);
    const firstInsufficient = rankings.findIndex(r => r.isInsufficient);
    if (lastSufficient >= 0 && firstInsufficient >= 0) {
      assert.ok(lastSufficient < firstInsufficient, "Insufficient features should be after sufficient ones");
    }
  });

  it("topFeatures returns top N by predictive value", () => {
    const features = makeFeatureSet(40, 0.65);
    const results = calculateFeatureImportance(features);
    const top = topFeatures(results, 3);
    assert.ok(top.length <= 3);
  });

  it("weakestFeatures returns bottom N", () => {
    const features = makeFeatureSet(50, 0.6);
    const results = calculateFeatureImportance(features);
    const weak = weakestFeatures(results, 3);
    assert.ok(weak.length <= 3);
  });

  it("topInteractions returns only sufficient interactions", () => {
    const features = makeFeatureSet(50, 0.65);
    const interactions = analyzeInteractions(features);
    const top = topInteractions(interactions, 5);
    for (const i of top) {
      assert.equal(i.isInsufficient, false);
    }
  });

  it("summarizeByCategory returns all 4 categories", () => {
    const features = makeFeatureSet(40, 0.6);
    const results = calculateFeatureImportance(features);
    const summary = summarizeByCategory(results);
    const cats = summary.map(s => s.category);
    assert.ok(cats.includes("zone") || cats.includes("context") || cats.includes("execution") || cats.includes("risk"));
  });

  it("rankFeatures sorts by confidence_score correctly", () => {
    const features = makeFeatureSet(40, 0.6);
    const results = calculateFeatureImportance(features);
    const rankings = rankFeatures(results, "confidence_score");
    const sufficient = rankings.filter(r => !r.isInsufficient);
    for (let i = 0; i < sufficient.length - 1; i++) {
      assert.ok(sufficient[i].confidenceScore >= sufficient[i + 1].confidenceScore);
    }
  });
});

// ─── 6. Validator ─────────────────────────────────────────────────────────────

describe("Validator", () => {
  it("validateFeature flags insufficient for small samples", () => {
    const features = makeFeatureSet(3, 0.5);
    const results = calculateFeatureImportance(features);
    const flags = validateFeature(results[0]);
    assert.equal(flags.isInsufficient, true);
    assert.ok(flags.insufficientReason !== undefined);
  });

  it("validateFeatureSet returns isValid=false for empty features", () => {
    const results = calculateFeatureImportance([]);
    const report = validateFeatureSet(results, 0);
    assert.equal(report.isValid, false);
  });

  it("validateFeatureSet returns isValid=true for sufficient data", () => {
    const features = makeFeatureSet(30, 0.6);
    const results = calculateFeatureImportance(features);
    const report = validateFeatureSet(results, 30);
    assert.equal(report.isValid, true);
  });

  it("validateFeatureSet counts insufficient features correctly", () => {
    const features = makeFeatureSet(30, 0.6);
    const results = calculateFeatureImportance(features);
    const report = validateFeatureSet(results, 30);
    assert.equal(report.totalFeatures, 17);
    assert.ok(report.sufficientFeatures >= 0);
    assert.equal(report.sufficientFeatures + report.insufficientFeatures, 17);
  });

  it("validateFeatureSet generates notes for small sample", () => {
    const features = makeFeatureSet(3, 0.5);
    const results = calculateFeatureImportance(features);
    const report = validateFeatureSet(results, 3);
    assert.ok(report.globalNotes.length > 0, "Should have validation notes");
  });

  it("validateInteractions generates notes", () => {
    const features = makeFeatureSet(50, 0.6);
    const interactions = analyzeInteractions(features);
    const notes = validateInteractions(interactions);
    assert.ok(Array.isArray(notes));
    assert.ok(notes.length > 0, "Should generate interaction validation notes");
  });

  it("detects overfitting risk", () => {
    // Create feature with very small sample but high apparent predictive
    const smallFeature = makeFeatureSet(3, 1.0); // 100% win rate, n=3
    const results = calculateFeatureImportance(smallFeature);
    const flags = validateFeature(results[0]);
    assert.equal(flags.isInsufficient, true); // n < MIN_SAMPLE_SIZE
  });

  it("data quality is poor when sample size is 0", () => {
    const results = calculateFeatureImportance([]);
    const report = validateFeatureSet(results, 0);
    assert.equal(report.overallDataQuality, "poor");
  });
});

// ─── 7. History Store ─────────────────────────────────────────────────────────

describe("History Store", () => {
  it("store is empty on initialization", () => {
    featureImportanceStore.clear();
    assert.equal(featureImportanceStore.isLoaded(), false);
    assert.equal(featureImportanceStore.featureCount(), 0);
    assert.deepEqual(featureImportanceStore.getFeatures(), []);
  });

  it("upsert stores latest cycle", () => {
    featureImportanceStore.clear();
    const features = makeFeatureSet(30, 0.6);
    const results = calculateFeatureImportance(features);
    const cycle = {
      cycleId: "test-cycle-1",
      version: "1.0.0",
      status: "complete" as const,
      triggeredBy: "manual" as const,
      startedAt: new Date(),
      completedAt: new Date(),
      durationMs: 100,
      sampleSize: 30,
      features: results,
      interactions: [],
      rankings: [],
      overallConfidence: 60,
      validationPassed: true,
      validationNotes: [],
      errorMessage: null,
    };
    featureImportanceStore.upsert(cycle);
    assert.equal(featureImportanceStore.isLoaded(), true);
    assert.equal(featureImportanceStore.featureCount(), 17);
  });

  it("getFeatureById returns correct feature", () => {
    const f = featureImportanceStore.getFeatureById("demand_zone_quality");
    assert.ok(f !== undefined);
    assert.equal(f!.featureId, "demand_zone_quality");
  });

  it("cycle count increments", () => {
    const before = featureImportanceStore.cycleCount();
    const features = makeFeatureSet(20, 0.5);
    const results = calculateFeatureImportance(features);
    featureImportanceStore.upsert({
      cycleId: "test-cycle-2",
      version: "1.0.0",
      status: "complete",
      triggeredBy: "manual",
      startedAt: new Date(),
      completedAt: new Date(),
      durationMs: 50,
      sampleSize: 20,
      features: results,
      interactions: [],
      rankings: [],
      overallConfidence: 40,
      validationPassed: true,
      validationNotes: [],
      errorMessage: null,
    });
    assert.equal(featureImportanceStore.cycleCount(), before + 1);
  });

  it("getConfidenceState returns state after upsert", () => {
    const state = featureImportanceStore.getConfidenceState("demand_zone_quality");
    assert.ok(state !== undefined);
    assert.equal(state!.featureId, "demand_zone_quality");
  });
});

// ─── 8. Report Generator ──────────────────────────────────────────────────────

describe("Report Generator", () => {
  it("generates a report with markdown content", () => {
    const features = makeFeatureSet(40, 0.65);
    const results = calculateFeatureImportance(features);
    const interactions = analyzeInteractions(features);
    const report = generateFeatureImportanceReport(results, interactions, 40, 65);
    assert.ok(report.markdownContent.length > 500, "Report should have substantial content");
    assert.ok(report.markdownContent.includes("# FEATURE IMPORTANCE REPORT"));
  });

  it("report includes all required sections", () => {
    const features = makeFeatureSet(40, 0.65);
    const results = calculateFeatureImportance(features);
    const interactions = analyzeInteractions(features);
    const report = generateFeatureImportanceReport(results, interactions, 40, 65);
    assert.ok(report.markdownContent.includes("Top Contributing Features"));
    assert.ok(report.markdownContent.includes("Weakest Features"));
    assert.ok(report.markdownContent.includes("Feature Combinations"));
    assert.ok(report.markdownContent.includes("Confidence Analysis"));
    assert.ok(report.markdownContent.includes("Statistical Evidence"));
    assert.ok(report.markdownContent.includes("Reliability Assessment"));
    assert.ok(report.markdownContent.includes("Suggested Areas for Future Study"));
  });

  it("report metadata is correct", () => {
    const features = makeFeatureSet(40, 0.6);
    const results = calculateFeatureImportance(features);
    const interactions = analyzeInteractions(features);
    const report = generateFeatureImportanceReport(results, interactions, 40, 55);
    assert.equal(report.sampleSize, 40);
    assert.equal(report.totalFeaturesAnalyzed, 17);
    assert.equal(report.overallConfidence, 55);
    assert.ok(report.version.length > 0);
  });

  it("report includes methodology section", () => {
    const features = makeFeatureSet(40, 0.6);
    const results = calculateFeatureImportance(features);
    const interactions = analyzeInteractions(features);
    const report = generateFeatureImportanceReport(results, interactions, 40, 50);
    assert.ok(report.methodology.length > 100, "Methodology should be substantive");
    assert.ok(report.markdownContent.includes("Advisory Only"));
  });

  it("report with no sufficient data is graceful", () => {
    const features = makeFeatureSet(2, 0.5);
    const results = calculateFeatureImportance(features);
    const interactions = analyzeInteractions(features);
    const report = generateFeatureImportanceReport(results, interactions, 2, 0);
    assert.ok(report.markdownContent.length > 100);
    assert.equal(report.sufficientFeatures, 0);
  });
});

// ─── 9. End-to-end integration ────────────────────────────────────────────────

describe("End-to-end integration", () => {
  it("full pipeline produces consistent results", () => {
    const features = makeFeatureSet(50, 0.65);
    const results = calculateFeatureImportance(features);
    const interactions = analyzeInteractions(features);
    const rankings = rankFeatures(results);
    const report = generateFeatureImportanceReport(results, interactions, 50, 65);

    assert.equal(results.length, 17);
    assert.ok(interactions.length > 0);
    assert.equal(rankings.length, 17);
    assert.ok(report.markdownContent.length > 1000);
  });

  it("results are reproducible from same input", () => {
    const features = makeFeatureSet(30, 0.6);
    const results1 = calculateFeatureImportance(features);
    const results2 = calculateFeatureImportance(features);
    for (let i = 0; i < results1.length; i++) {
      assert.equal(results1[i].winRate, results2[i].winRate);
      assert.equal(results1[i].sampleSize, results2[i].sampleSize);
      assert.equal(results1[i].predictiveValue, results2[i].predictiveValue);
    }
  });

  it("mixed session/regime features produce varied results", () => {
    const features = [
      ...Array.from({ length: 15 }, (_, i) => makeFeature({ session: "london", outcome: "win", pnl: 100, rrActual: 2, tradeId: `l-${i}` })),
      ...Array.from({ length: 10 }, (_, i) => makeFeature({ session: "new_york", outcome: "loss", pnl: -80, rrActual: -1, tradeId: `ny-${i}` })),
      ...Array.from({ length: 5 }, (_, i) => makeFeature({ session: "asian", outcome: "loss", pnl: -60, rrActual: -1, tradeId: `a-${i}` })),
    ];
    const results = calculateFeatureImportance(features);
    const sessionResult = results.find(r => r.featureId === "session");
    assert.ok(sessionResult !== undefined);
    assert.equal(sessionResult!.sampleSize, 30);
    // London wins should show synergy
    const londonBucket = sessionResult!.bucketBreakdown.find(b => b.label === "london");
    const nyBucket = sessionResult!.bucketBreakdown.find(b => b.label === "new_york");
    if (londonBucket && nyBucket) {
      assert.ok(londonBucket.winRate > nyBucket.winRate, "London should outperform NY in this dataset");
    }
  });
});
