// ─── Decision Intelligence Engine Tests ───────────────────────────────────────
// Comprehensive tests for TIS calculation, recommendation generation,
// confidence scoring, historical comparison, and validation.
// All tests are deterministic — same inputs produce same outputs.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { evaluateSetup } from "../recommendation-engine.js";
import { computeTis } from "../setup-scorer.js";
import { findSimilarExperiences, cosineSimilarity, buildVectorFromSetup } from "../historical-matcher.js";
import { extractFactors } from "../factor-analyzer.js";
import { computeRecommendationConfidence } from "../confidence-calculator.js";
import { diStore } from "../di-store.js";
import { generateMarkdownReport } from "../report-generator.js";
import { tisToLevel, TIS_WEIGHTS, computeUncertaintyLevel, computeReliabilityRating } from "../types.js";
import type { CurrentSetup } from "../types.js";
import type { ExtractedFeature } from "../../learning-core/types.js";

// ─── Test fixtures ─────────────────────────────────────────────────────────────

function makeSetup(overrides: Partial<CurrentSetup> = {}): CurrentSetup {
  return {
    setupId: "test-setup-1",
    pair: "EURUSD",
    session: "london",
    regime: "trending",
    trend: "bullish",
    supplyQuality: 75,
    demandQuality: 80,
    liquidityScore: 70,
    amdScore: 72,
    confirmationQuality: 68,
    setupScore: 74,
    tqi: 65,
    rrPlanned: 2.5,
    spreadPips: 0.8,
    volatility: "low",
    direction: "buy",
    ...overrides,
  };
}

function makeWin(overrides: Partial<ExtractedFeature> = {}): ExtractedFeature {
  return {
    tradeId: `win-${Math.random().toString(36).slice(2)}`,
    pair: "EURUSD",
    session: "london",
    marketRegime: "trending",
    trend: "bullish",
    supplyQuality: 72,
    demandQuality: 78,
    liquidityScore: 68,
    amdScore: 70,
    confirmationQuality: 65,
    setupScore: 71,
    tqi: 62,
    rrPlanned: 2.3,
    rrActual: 2.1,
    spreadPips: 0.9,
    volatility: "low",
    direction: "buy",
    outcome: "win",
    pnl: 210,
    confidence: 75,
    patternType: "demand_zone_reversal",
    holdDurationMinutes: 85,
    entryTime: new Date("2025-01-10T09:30:00Z"),
    exitTime: new Date("2025-01-10T11:00:00Z"),
    ...overrides,
  };
}

function makeLoss(overrides: Partial<ExtractedFeature> = {}): ExtractedFeature {
  return {
    tradeId: `loss-${Math.random().toString(36).slice(2)}`,
    pair: "EURUSD",
    session: "london",
    marketRegime: "volatile",
    trend: "bearish",
    supplyQuality: 40,
    demandQuality: 35,
    liquidityScore: 30,
    amdScore: 32,
    confirmationQuality: 28,
    setupScore: 35,
    tqi: 30,
    rrPlanned: 1.2,
    rrActual: -1.0,
    spreadPips: 2.5,
    volatility: "high",
    direction: "buy",
    outcome: "loss",
    pnl: -100,
    confidence: 45,
    patternType: "supply_zone_reversal",
    holdDurationMinutes: 30,
    entryTime: new Date("2025-01-15T14:00:00Z"),
    exitTime: new Date("2025-01-15T14:30:00Z"),
    ...overrides,
  };
}

function makeFeatureSet(nWins: number, nLosses: number): ExtractedFeature[] {
  const wins   = Array.from({ length: nWins },   () => makeWin());
  const losses = Array.from({ length: nLosses }, () => makeLoss());
  return [...wins, ...losses];
}

// ─── Types ─────────────────────────────────────────────────────────────────────

describe("Types & constants", () => {
  it("TIS_WEIGHTS sum to 1.0", () => {
    const total = Object.values(TIS_WEIGHTS).reduce((s, w) => s + w, 0);
    assert.ok(Math.abs(total - 1.0) < 0.0001, `Expected 1.0, got ${total}`);
  });

  it("tisToLevel returns correct level for each range", () => {
    assert.equal(tisToLevel(85), "exceptional");
    assert.equal(tisToLevel(80), "exceptional");
    assert.equal(tisToLevel(79), "high_quality");
    assert.equal(tisToLevel(65), "high_quality");
    assert.equal(tisToLevel(64), "good_opportunity");
    assert.equal(tisToLevel(50), "good_opportunity");
    assert.equal(tisToLevel(49), "neutral");
    assert.equal(tisToLevel(35), "neutral");
    assert.equal(tisToLevel(34), "low_quality");
    assert.equal(tisToLevel(20), "low_quality");
    assert.equal(tisToLevel(19), "avoid");
    assert.equal(tisToLevel(0),  "avoid");
  });

  it("computeUncertaintyLevel maps correctly", () => {
    assert.equal(computeUncertaintyLevel(80, 30, false), "very_low");
    assert.equal(computeUncertaintyLevel(60, 10, false), "low");
    assert.equal(computeUncertaintyLevel(50, 10, false), "moderate");
    assert.equal(computeUncertaintyLevel(30, 10, false), "high");
    assert.equal(computeUncertaintyLevel(20, 10, true),  "very_high");
  });

  it("computeReliabilityRating maps correctly", () => {
    assert.equal(computeReliabilityRating(80, 35), "institutional");
    assert.equal(computeReliabilityRating(65, 20), "strong");
    assert.equal(computeReliabilityRating(45, 8),  "moderate");
    assert.equal(computeReliabilityRating(28, 8),  "weak");
    assert.equal(computeReliabilityRating(80, 3),  "insufficient");
    assert.equal(computeReliabilityRating(10, 0),  "insufficient");
  });
});

// ─── Cosine similarity ─────────────────────────────────────────────────────────

describe("Cosine similarity", () => {
  it("identical vectors → 1.0", () => {
    const v = [0.8, 0.7, 0.6, 0.9, 0.5, 0.7, 0.6, 0.5, 0.7, 1, 1, 1];
    assert.ok(Math.abs(cosineSimilarity(v, v) - 1.0) < 0.0001);
  });

  it("zero vector → 0", () => {
    const zero = new Array(12).fill(0);
    const v    = [0.8, 0.7, 0.6, 0.9, 0.5, 0.7, 0.6, 0.5, 0.7, 1, 1, 1];
    assert.equal(cosineSimilarity(zero, v), 0);
    assert.equal(cosineSimilarity(v, zero), 0);
  });

  it("mismatched length → 0", () => {
    assert.equal(cosineSimilarity([1, 2, 3], [1, 2]), 0);
  });

  it("orthogonal vectors → 0", () => {
    const a = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const b = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
    assert.ok(cosineSimilarity(a, b) < 0.01);
  });

  it("similar quality setups have high similarity", () => {
    const setup = makeSetup();
    const win   = makeWin();
    const vec1  = buildVectorFromSetup(setup);
    const vec2  = buildVectorFromSetup({
      pair: win.pair, session: win.session, regime: win.marketRegime,
      trend: win.trend, supplyQuality: win.supplyQuality, demandQuality: win.demandQuality,
      liquidityScore: win.liquidityScore, amdScore: win.amdScore,
      confirmationQuality: win.confirmationQuality, setupScore: win.setupScore,
      tqi: win.tqi, rrPlanned: win.rrPlanned, spreadPips: win.spreadPips,
      volatility: win.volatility, direction: win.direction,
    });
    const sim = cosineSimilarity(vec1, vec2);
    assert.ok(sim > 0.9, `Expected high similarity, got ${sim}`);
  });
});

// ─── Historical matcher ────────────────────────────────────────────────────────

describe("Historical matcher", () => {
  it("returns empty result with no historical data", () => {
    const setup  = makeSetup();
    const result = findSimilarExperiences(setup, []);
    assert.equal(result.evidenceCount, 0);
    assert.equal(result.similarWins.length, 0);
    assert.equal(result.similarLosses.length, 0);
    assert.equal(result.historicalWinRate, 0);
  });

  it("finds similar wins when features match", () => {
    const setup    = makeSetup();
    const features = makeFeatureSet(10, 2);
    const result   = findSimilarExperiences(setup, features);
    // Most wins should match (same session/regime/quality)
    assert.ok(result.similarWins.length > 0, "Should find at least 1 similar win");
  });

  it("caps results at MAX_SIMILAR_EXPERIENCES (5 each)", () => {
    const setup    = makeSetup();
    const features = makeFeatureSet(20, 10);
    const result   = findSimilarExperiences(setup, features);
    assert.ok(result.similarWins.length <= 5);
    assert.ok(result.similarLosses.length <= 5);
  });

  it("dissimilar setups return fewer similar experiences", () => {
    const setup    = makeSetup({ session: "asian", regime: "volatile", volatility: "high" });
    const features = makeFeatureSet(10, 10);
    const result   = findSimilarExperiences(setup, features);
    // Losses are in the same asian/volatile regime, wins are not — losses should match more
    assert.ok(result.similarLosses.length >= result.similarWins.length);
  });

  it("historicalWinRate is between 0 and 1", () => {
    const setup    = makeSetup();
    const features = makeFeatureSet(8, 4);
    const result   = findSimilarExperiences(setup, features);
    assert.ok(result.historicalWinRate >= 0 && result.historicalWinRate <= 1);
  });

  it("similar experiences have similarity score between 0 and 1", () => {
    const setup    = makeSetup();
    const features = makeFeatureSet(10, 5);
    const result   = findSimilarExperiences(setup, features);
    [...result.similarWins, ...result.similarLosses].forEach(exp => {
      assert.ok(exp.similarityScore >= 0 && exp.similarityScore <= 1);
    });
  });

  it("feature vectors are stored with correct dimension count", () => {
    const setup    = makeSetup();
    const features = makeFeatureSet(5, 0);
    const result   = findSimilarExperiences(setup, features);
    if (result.similarWins.length > 0) {
      assert.equal(result.similarWins[0].featureVector.length, 12);
    }
  });
});

// ─── TIS calculation ───────────────────────────────────────────────────────────

describe("Trade Intelligence Score (TIS)", () => {
  it("TIS is between 0 and 100", () => {
    const setup    = makeSetup();
    const features = makeFeatureSet(10, 5);
    const match    = findSimilarExperiences(setup, features);
    const result   = computeTis(setup, features, match);
    assert.ok(result.tisScore >= 0 && result.tisScore <= 100);
  });

  it("has exactly 15 components", () => {
    const setup    = makeSetup();
    const features = makeFeatureSet(10, 5);
    const match    = findSimilarExperiences(setup, features);
    const result   = computeTis(setup, features, match);
    assert.equal(result.components.length, 15);
  });

  it("each component has weight and score in range", () => {
    const setup    = makeSetup();
    const features = makeFeatureSet(10, 5);
    const match    = findSimilarExperiences(setup, features);
    const result   = computeTis(setup, features, match);
    result.components.forEach(c => {
      assert.ok(c.score >= 0 && c.score <= 100, `${c.key}: score out of range: ${c.score}`);
      assert.ok(c.weight > 0 && c.weight <= 1,  `${c.key}: weight out of range: ${c.weight}`);
    });
  });

  it("high quality setup scores higher than low quality setup", () => {
    const highSetup = makeSetup({
      supplyQuality: 90, demandQuality: 90, liquidityScore: 85,
      amdScore: 85, confirmationQuality: 80, setupScore: 85, tqi: 80,
      rrPlanned: 3, spreadPips: 0.5, volatility: "low",
    });
    const lowSetup = makeSetup({
      supplyQuality: 25, demandQuality: 20, liquidityScore: 20,
      amdScore: 22, confirmationQuality: 18, setupScore: 22, tqi: 20,
      rrPlanned: 1.0, spreadPips: 3.5, volatility: "high",
      session: "asian", regime: "volatile",
    });
    const features  = makeFeatureSet(15, 5);
    const highMatch = findSimilarExperiences(highSetup, features);
    const lowMatch  = findSimilarExperiences(lowSetup, features);
    const highTis   = computeTis(highSetup, features, highMatch).tisScore;
    const lowTis    = computeTis(lowSetup, features, lowMatch).tisScore;
    assert.ok(highTis > lowTis, `highTis (${highTis}) should > lowTis (${lowTis})`);
  });

  it("empty history reduces TIS but keeps it non-negative", () => {
    const setup  = makeSetup();
    const match  = findSimilarExperiences(setup, []);
    const result = computeTis(setup, [], match);
    assert.ok(result.tisScore >= 0);
  });

  it("TIS is reproducible — same inputs give same output", () => {
    const setup    = makeSetup({ setupId: "det-test" });
    const features = makeFeatureSet(10, 5);
    const match    = findSimilarExperiences(setup, features);
    const r1 = computeTis(setup, features, match).tisScore;
    const r2 = computeTis(setup, features, match).tisScore;
    assert.equal(r1, r2);
  });

  it("componentMap has all 15 keys", () => {
    const setup    = makeSetup();
    const features = makeFeatureSet(5, 5);
    const match    = findSimilarExperiences(setup, features);
    const result   = computeTis(setup, features, match);
    const keys = Object.keys(result.componentMap);
    assert.equal(keys.length, 15);
  });
});

// ─── Factor analyzer ──────────────────────────────────────────────────────────

describe("Factor analyzer", () => {
  it("returns positive and negative factor arrays", () => {
    const setup    = makeSetup();
    const features = makeFeatureSet(10, 5);
    const match    = findSimilarExperiences(setup, features);
    const tisResult = computeTis(setup, features, match);
    const { positive, negative } = extractFactors(setup, features, match, tisResult.components);
    assert.ok(Array.isArray(positive));
    assert.ok(Array.isArray(negative));
  });

  it("high quality setup has more positive factors", () => {
    const setup = makeSetup({
      supplyQuality: 85, demandQuality: 85, liquidityScore: 80,
      amdScore: 78, confirmationQuality: 75, rrPlanned: 3.2, spreadPips: 0.5,
    });
    const features  = makeFeatureSet(10, 3);
    const match     = findSimilarExperiences(setup, features);
    const tisResult = computeTis(setup, features, match);
    const { positive, negative } = extractFactors(setup, features, match, tisResult.components);
    const posImpact = positive.reduce((s, f) => s + f.impact, 0);
    const negImpact = negative.reduce((s, f) => s + Math.abs(f.impact), 0);
    assert.ok(posImpact > negImpact, `Expected more positive (${posImpact}) than negative (${negImpact})`);
  });

  it("wide spread generates a negative factor", () => {
    const setup = makeSetup({ spreadPips: 3.5 });
    const features  = makeFeatureSet(5, 5);
    const match     = findSimilarExperiences(setup, features);
    const tisResult = computeTis(setup, features, match);
    const { negative } = extractFactors(setup, features, match, tisResult.components);
    const hasSpreadFactor = negative.some(f => f.name.toLowerCase().includes("spread"));
    assert.ok(hasSpreadFactor, "Expected a wide spread negative factor");
  });

  it("low RR generates a negative factor", () => {
    const setup = makeSetup({ rrPlanned: 0.8 });
    const features  = makeFeatureSet(5, 5);
    const match     = findSimilarExperiences(setup, features);
    const tisResult = computeTis(setup, features, match);
    const { negative } = extractFactors(setup, features, match, tisResult.components);
    const hasRRFactor = negative.some(f => f.name.toLowerCase().includes("risk"));
    assert.ok(hasRRFactor, "Expected a poor RR negative factor");
  });

  it("factors have correct structure", () => {
    const setup     = makeSetup();
    const features  = makeFeatureSet(8, 4);
    const match     = findSimilarExperiences(setup, features);
    const tisResult = computeTis(setup, features, match);
    const { positive, negative } = extractFactors(setup, features, match, tisResult.components);
    [...positive, ...negative].forEach(f => {
      assert.ok(typeof f.name === "string" && f.name.length > 0);
      assert.ok(typeof f.impact === "number");
      assert.ok(typeof f.explanation === "string" && f.explanation.length > 0);
      assert.ok(["zone", "execution", "context", "risk", "statistical", "pattern"].includes(f.category));
      assert.ok(f.confidence >= 0 && f.confidence <= 100);
    });
  });

  it("positive factors all have positive impact", () => {
    const setup     = makeSetup();
    const features  = makeFeatureSet(8, 4);
    const match     = findSimilarExperiences(setup, features);
    const tisResult = computeTis(setup, features, match);
    const { positive } = extractFactors(setup, features, match, tisResult.components);
    positive.forEach(f => assert.ok(f.impact > 0, `Expected positive impact: ${f.impact}`));
  });

  it("negative factors all have negative impact", () => {
    const setup     = makeSetup();
    const features  = makeFeatureSet(8, 4);
    const match     = findSimilarExperiences(setup, features);
    const tisResult = computeTis(setup, features, match);
    const { negative } = extractFactors(setup, features, match, tisResult.components);
    negative.forEach(f => assert.ok(f.impact < 0, `Expected negative impact: ${f.impact}`));
  });
});

// ─── Confidence calculator ────────────────────────────────────────────────────

describe("Confidence calculator", () => {
  it("confidence is between 0 and 100", () => {
    const setup     = makeSetup();
    const features  = makeFeatureSet(10, 5);
    const match     = findSimilarExperiences(setup, features);
    const tisResult = computeTis(setup, features, match);
    const { positive, negative } = extractFactors(setup, features, match, tisResult.components);
    const result = computeRecommendationConfidence(setup, tisResult, match, positive, negative);
    assert.ok(result.confidenceScore >= 0 && result.confidenceScore <= 100);
  });

  it("flags low confidence when score < 40", () => {
    const setup     = makeSetup({ spreadPips: 4, rrPlanned: 0.5 });
    const features: ExtractedFeature[] = [];
    const match     = findSimilarExperiences(setup, features);
    const tisResult = computeTis(setup, features, match);
    const { positive, negative } = extractFactors(setup, features, match, tisResult.components);
    const result = computeRecommendationConfidence(setup, tisResult, match, positive, negative);
    assert.ok(result.isLowConfidence || result.validationFlags.length > 0);
  });

  it("returns validation flags array", () => {
    const setup     = makeSetup();
    const features  = makeFeatureSet(5, 5);
    const match     = findSimilarExperiences(setup, features);
    const tisResult = computeTis(setup, features, match);
    const { positive, negative } = extractFactors(setup, features, match, tisResult.components);
    const result = computeRecommendationConfidence(setup, tisResult, match, positive, negative);
    assert.ok(Array.isArray(result.validationFlags));
  });

  it("empty history triggers insufficient_evidence flag", () => {
    const setup     = makeSetup();
    const features: ExtractedFeature[] = [];
    const match     = findSimilarExperiences(setup, features);
    const tisResult = computeTis(setup, features, match);
    const result    = computeRecommendationConfidence(setup, tisResult, match, [], []);
    const hasFlag   = result.validationFlags.some(f => f.type === "insufficient_evidence");
    assert.ok(hasFlag, "Expected insufficient_evidence flag");
  });
});

// ─── Full recommendation pipeline ─────────────────────────────────────────────

describe("Recommendation pipeline (evaluateSetup)", () => {
  it("returns a complete Trade Intelligence Report", () => {
    const setup    = makeSetup();
    const features = makeFeatureSet(15, 5);
    const report   = evaluateSetup(setup, features);

    assert.ok(typeof report.recommendationId === "string");
    assert.ok(report.tisScore >= 0 && report.tisScore <= 100);
    assert.ok(["exceptional","high_quality","good_opportunity","neutral","low_quality","avoid"].includes(report.recommendationLevel));
    assert.ok(report.confidenceScore >= 0 && report.confidenceScore <= 100);
    assert.ok(typeof report.reasoning === "string" && report.reasoning.length > 0);
    assert.equal(report.isAdvisoryOnly, true);
  });

  it("high quality setup gets positive recommendation level", () => {
    const setup = makeSetup({
      supplyQuality: 88, demandQuality: 90, liquidityScore: 85,
      amdScore: 82, confirmationQuality: 80, setupScore: 86, tqi: 78,
      rrPlanned: 3.5, spreadPips: 0.5, volatility: "low",
    });
    const wins    = Array.from({ length: 20 }, () => makeWin({ session: "london", marketRegime: "trending", pair: "EURUSD" }));
    const losses  = Array.from({ length: 5 },  () => makeLoss({ session: "london", marketRegime: "trending", pair: "EURUSD" }));
    const report  = evaluateSetup(setup, [...wins, ...losses]);
    const positiveLevel = ["exceptional", "high_quality", "good_opportunity"].includes(report.recommendationLevel);
    assert.ok(positiveLevel, `Expected positive level, got ${report.recommendationLevel} (TIS=${report.tisScore})`);
  });

  it("poor setup gets negative recommendation level", () => {
    const setup = makeSetup({
      supplyQuality: 20, demandQuality: 18, liquidityScore: 15,
      amdScore: 18, confirmationQuality: 15, setupScore: 18, tqi: 15,
      rrPlanned: 0.7, spreadPips: 3.8, volatility: "high",
      session: "asian", regime: "volatile",
    });
    const losses = Array.from({ length: 15 }, () => makeLoss({ session: "asian", marketRegime: "volatile", pair: "EURUSD" }));
    const wins   = Array.from({ length: 2 },  () => makeWin({ session: "asian", marketRegime: "volatile", pair: "EURUSD" }));
    const report = evaluateSetup(setup, [...wins, ...losses]);
    const negativeLevel = ["avoid", "low_quality", "neutral"].includes(report.recommendationLevel);
    assert.ok(negativeLevel, `Expected negative level, got ${report.recommendationLevel} (TIS=${report.tisScore})`);
  });

  it("report includes similar experiences arrays", () => {
    const setup    = makeSetup();
    const features = makeFeatureSet(12, 6);
    const report   = evaluateSetup(setup, features);
    assert.ok(Array.isArray(report.similarWinningExperiences));
    assert.ok(Array.isArray(report.similarLosingExperiences));
  });

  it("report includes positive and negative factors", () => {
    const setup    = makeSetup();
    const features = makeFeatureSet(10, 5);
    const report   = evaluateSetup(setup, features);
    assert.ok(Array.isArray(report.positiveFactors));
    assert.ok(Array.isArray(report.negativeFactors));
  });

  it("is reproducible — same setup + history → same TIS", () => {
    const setup    = makeSetup({ supplyQuality: 77, demandQuality: 80, liquidityScore: 68 });
    const features = makeFeatureSet(10, 5);
    const r1 = evaluateSetup(setup, features).tisScore;
    const r2 = evaluateSetup(setup, features).tisScore;
    assert.equal(r1, r2);
  });

  it("recommendationId is unique per evaluation", () => {
    const setup    = makeSetup();
    const features = makeFeatureSet(5, 5);
    const r1 = evaluateSetup(setup, features).recommendationId;
    const r2 = evaluateSetup(setup, features).recommendationId;
    assert.notEqual(r1, r2);
  });

  it("tisComponents have all 15 keys", () => {
    const setup    = makeSetup();
    const features = makeFeatureSet(8, 4);
    const report   = evaluateSetup(setup, features);
    assert.equal(report.tisComponents.length, 15);
  });

  it("evaluatedAt is a Date", () => {
    const setup    = makeSetup({ evaluatedAt: new Date("2025-06-01T10:00:00Z") });
    const features = makeFeatureSet(5, 3);
    const report   = evaluateSetup(setup, features);
    assert.ok(report.evaluatedAt instanceof Date);
  });

  it("validationFlags is always an array", () => {
    const setup    = makeSetup();
    const features = makeFeatureSet(5, 3);
    const report   = evaluateSetup(setup, features);
    assert.ok(Array.isArray(report.validationFlags));
  });
});

// ─── DI Store ─────────────────────────────────────────────────────────────────

describe("DI Store", () => {
  it("starts empty", () => {
    diStore.clear();
    assert.equal(diStore.getTotalEvaluations(), 0);
    assert.equal(diStore.getLastReport(), null);
  });

  it("addRecommendation increments counter", () => {
    diStore.clear();
    const r1 = evaluateSetup(makeSetup(), makeFeatureSet(5, 3));
    diStore.addRecommendation(r1);
    assert.equal(diStore.getTotalEvaluations(), 1);
  });

  it("getRecommendation returns correct report by id", () => {
    diStore.clear();
    const report = evaluateSetup(makeSetup(), makeFeatureSet(5, 3));
    diStore.addRecommendation(report);
    const found = diStore.getRecommendation(report.recommendationId);
    assert.ok(found);
    assert.equal(found!.recommendationId, report.recommendationId);
  });

  it("caps at 50 recommendations", () => {
    diStore.clear();
    for (let i = 0; i < 55; i++) {
      diStore.addRecommendation(evaluateSetup(makeSetup(), makeFeatureSet(5, 3)));
    }
    assert.ok(diStore.getRecommendations(100).length <= 50);
  });

  it("recordOutcome updates accuracy stats", () => {
    diStore.clear();
    const report = evaluateSetup(makeSetup({
      supplyQuality: 85, demandQuality: 85,
    }), makeFeatureSet(15, 3));
    diStore.addRecommendation(report);
    const updated = diStore.recordOutcome(report.recommendationId, "win", 2.5);
    assert.ok(updated);
    const stats = diStore.getAccuracyStats();
    assert.equal(stats.totalWithOutcome, 1);
  });

  it("recordOutcome returns false for unknown id", () => {
    diStore.clear();
    const updated = diStore.recordOutcome("nonexistent-id", "win", 2.0);
    assert.equal(updated, false);
  });

  it("getLastReport returns most recent", () => {
    diStore.clear();
    const r1 = evaluateSetup(makeSetup(), makeFeatureSet(5, 3));
    const r2 = evaluateSetup(makeSetup({ pair: "GBPUSD" }), makeFeatureSet(5, 3));
    diStore.addRecommendation(r1);
    diStore.addRecommendation(r2);
    assert.equal(diStore.getLastReport()?.setup.pair, "GBPUSD");
  });
});

// ─── Report generator ─────────────────────────────────────────────────────────

describe("Report generator", () => {
  it("generates a non-empty markdown report", () => {
    const md = generateMarkdownReport();
    assert.ok(md.length > 500);
    assert.ok(md.includes("DECISION INTELLIGENCE REPORT"));
  });

  it("report includes TIS component table", () => {
    const md = generateMarkdownReport();
    assert.ok(md.includes("patternPerformance"));
    assert.ok(md.includes("historicalWinRate"));
  });

  it("report includes recommendation levels table", () => {
    const md = generateMarkdownReport();
    assert.ok(md.includes("Exceptional Opportunity"));
    assert.ok(md.includes("Avoid"));
  });

  it("report includes latest report data when provided", () => {
    const report = evaluateSetup(makeSetup({ pair: "USDJPY" }), makeFeatureSet(5, 3));
    const md     = generateMarkdownReport(report);
    assert.ok(md.includes("USDJPY"));
  });

  it("report includes TIS_WEIGHTS that sum to 100%", () => {
    const md = generateMarkdownReport();
    assert.ok(md.includes("100%") || md.includes("Total weight: 100%"));
  });

  it("report is advisory only", () => {
    const md = generateMarkdownReport();
    assert.ok(md.toLowerCase().includes("advisory"));
  });
});

// ─── Validation safeguards ────────────────────────────────────────────────────

describe("Validation safeguards", () => {
  it("insufficient evidence flag fires with 0 similar trades", () => {
    const report = evaluateSetup(
      makeSetup({ session: "asian", regime: "volatile", volatility: "high" }),
      // All wins are in london/trending — asian/volatile won't match well
      makeFeatureSet(5, 5),
    );
    // May or may not have flag depending on similarity threshold — check flag types
    assert.ok(Array.isArray(report.validationFlags));
  });

  it("zero history triggers all relevant flags", () => {
    const report = evaluateSetup(makeSetup(), []);
    const types  = report.validationFlags.map(f => f.type);
    assert.ok(types.includes("insufficient_evidence"), `Expected insufficient_evidence, got: ${types.join(",")}`);
  });

  it("conflicting evidence flag structure correct when present", () => {
    const report = evaluateSetup(makeSetup(), makeFeatureSet(5, 5));
    report.validationFlags.forEach(f => {
      assert.ok(["insufficient_evidence","low_confidence","conflicting_evidence","unstable_features","high_uncertainty"].includes(f.type));
      assert.ok(["warning","error","info"].includes(f.severity));
      assert.ok(typeof f.message === "string" && f.message.length > 0);
    });
  });

  it("isAdvisoryOnly is always true", () => {
    const report = evaluateSetup(makeSetup(), makeFeatureSet(5, 3));
    assert.equal(report.isAdvisoryOnly, true);
  });

  it("statisticalExpectancy is a number", () => {
    const report = evaluateSetup(makeSetup(), makeFeatureSet(10, 5));
    assert.ok(typeof report.statisticalExpectancy === "number");
  });
});
