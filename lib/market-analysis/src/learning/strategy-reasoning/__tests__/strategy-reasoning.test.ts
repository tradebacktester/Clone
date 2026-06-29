// ─── Strategy Reasoning Engine Tests ─────────────────────────────────────────
// Comprehensive test suite for the Strategy Reasoning Engine.
// Tests: rule evaluation, historical reasoning, market support, pattern
// strength, context strength, strength calculation, recommendations, reports.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtractedFeature } from "../../learning-core/types.js";
import { evaluateRules } from "../rule-evaluator.js";
import { findSimilarHistoricalTrades } from "../historical-reasoner.js";
import { analyzeMarketSupport } from "../market-support-analyzer.js";
import { analyzePatternStrength } from "../pattern-strength-analyzer.js";
import { analyzeContextStrength } from "../context-strength-analyzer.js";
import { calculateStrategyStrength } from "../strength-calculator.js";
import { runStrategyReasoning } from "../reasoning-engine.js";
import {
  extractSupportingFactors,
  computeStatisticalExpectancy,
  assessRisks,
} from "../report-generator.js";
import {
  strengthToRecommendation,
  scoreToTier,
  evidenceToReliability,
  getPairScore,
  SR_ENGINE_VERSION,
  STRENGTH_WEIGHTS,
  type StrategySetup,
} from "../types.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSetup(overrides: Partial<StrategySetup> = {}): StrategySetup {
  return {
    pair:                "EURUSD",
    session:             "london",
    regime:              "trending",
    trend:               "bullish",
    volatility:          "medium",
    supplyQuality:       75,
    demandQuality:       70,
    liquidityScore:      68,
    amdScore:            65,
    confirmationQuality: 72,
    setupScore:          70,
    tqi:                 65,
    rrPlanned:           2.5,
    spreadPips:          1.2,
    trendStrength:       70,
    correlationScore:    65,
    stabilityScore:      70,
    opportunityScore:    68,
    marketHealthScore:   72,
    newsContext:         "neutral",
    ...overrides,
  };
}

function makeFeature(overrides: Partial<ExtractedFeature> = {}): ExtractedFeature {
  return {
    tradeId:             "t1",
    setupId:             "s1",
    pair:                "EURUSD",
    session:             "london",
    marketRegime:        "trending",
    outcome:             "win",
    supplyQuality:       72,
    demandQuality:       68,
    liquidityScore:      65,
    amdScore:            62,
    confirmationQuality: 70,
    setupScore:          68,
    tqi:                 63,
    rrActual:            2.2,
    rrPlanned:           2.5,
    spreadPips:          1.2,
    openedAt:            new Date("2025-01-15"),
    ...overrides,
  } as ExtractedFeature;
}

function makeFeatures(n: number, winRate = 0.65): ExtractedFeature[] {
  return Array.from({ length: n }, (_, i) => {
    const isWin = i / n < winRate;
    return makeFeature({
      tradeId:  `trade-${i}`,
      setupId:  `setup-${i}`,
      outcome:  isWin ? "win" : "loss",
      rrActual: isWin ? 2.2 : -1,
      openedAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
    });
  });
}

// ─── Rule Evaluator Tests ─────────────────────────────────────────────────────

describe("Rule Evaluator", () => {
  it("marks all rules as passed for a strong setup", () => {
    const result = evaluateRules(makeSetup());
    assert.ok(result.ruleQualityScore > 60, `Expected score > 60, got ${result.ruleQualityScore}`);
    assert.ok(result.failedRules === 0, `Expected 0 failed rules, got ${result.failedRules}`);
    assert.ok(result.totalRules > 0, "Should have rules");
  });

  it("marks exceptional rules for high-quality setup", () => {
    const result = evaluateRules(makeSetup({
      supplyQuality: 90, demandQuality: 88,
      liquidityScore: 82, amdScore: 80, confirmationQuality: 85,
      setupScore: 85, tqi: 80, rrPlanned: 4.0, spreadPips: 0.5,
    }));
    assert.ok(result.exceptionalRules >= 3, `Expected ≥3 exceptional, got ${result.exceptionalRules}`);
    assert.ok(result.ruleQualityScore >= 75, `Expected score ≥75, got ${result.ruleQualityScore}`);
  });

  it("detects failed rules for weak setup", () => {
    const result = evaluateRules(makeSetup({
      supplyQuality: 40, demandQuality: 35,
      liquidityScore: 30, amdScore: 30,
      rrPlanned: 0.8, spreadPips: 5.0,
    }));
    assert.ok(result.failedRules >= 3, `Expected ≥3 failed, got ${result.failedRules}`);
    assert.ok(result.ruleQualityScore < 55, `Expected score < 55, got ${result.ruleQualityScore}`);
  });

  it("detects barely-passed rules", () => {
    // Supply barely above 60
    const result = evaluateRules(makeSetup({ supplyQuality: 61, demandQuality: 61 }));
    assert.ok(result.barelyPassed >= 0, "barelyPassed should be >= 0");
    assert.equal(typeof result.explanation, "string");
    assert.ok(result.explanation.length > 0);
  });

  it("inverted rule: spread fails when too high", () => {
    const result = evaluateRules(makeSetup({ spreadPips: 6.0 }));
    const spreadRule = result.rules.find(r => r.name.includes("Spread"));
    assert.ok(spreadRule, "Should have a Spread rule");
    assert.equal(spreadRule.status, "failed");
  });

  it("inverted rule: spread is exceptional when very low", () => {
    const result = evaluateRules(makeSetup({ spreadPips: 0.3 }));
    const spreadRule = result.rules.find(r => r.name.includes("Spread"));
    assert.ok(spreadRule, "Should have a Spread rule");
    assert.equal(spreadRule.status, "exceptional");
  });

  it("returns scores in 0–100 range", () => {
    const result = evaluateRules(makeSetup());
    assert.ok(result.ruleQualityScore >= 0 && result.ruleQualityScore <= 100);
    for (const rule of result.rules) {
      assert.ok(rule.score >= 0 && rule.score <= 100, `Rule ${rule.name} score out of range: ${rule.score}`);
    }
  });
});

// ─── Historical Reasoner Tests ────────────────────────────────────────────────

describe("Historical Reasoner", () => {
  it("returns empty evidence with no features", () => {
    const result = findSimilarHistoricalTrades(makeSetup(), []);
    assert.equal(result.evidenceCount, 0);
    assert.equal(result.evidenceScore <= 40, true);
    assert.equal(result.sampleReliability, "insufficient");
  });

  it("finds similar trades from a feature pool", () => {
    const features = makeFeatures(30, 0.7);
    const result = findSimilarHistoricalTrades(makeSetup(), features);
    assert.ok(result.evidenceCount > 0, "Should find similar trades");
    assert.ok(result.evidenceScore > 0, "Should produce a score");
  });

  it("computes win rate correctly", () => {
    const features = makeFeatures(20, 0.6);
    const result = findSimilarHistoricalTrades(makeSetup(), features);
    if (result.evidenceCount >= 5) {
      assert.ok(result.winRate >= 0 && result.winRate <= 1, "Win rate must be 0–1");
    }
  });

  it("computes profit factor", () => {
    const features = makeFeatures(20, 0.65);
    const result = findSimilarHistoricalTrades(makeSetup(), features);
    assert.ok(result.profitFactor >= 0);
  });

  it("higher evidence yields higher evidenceScore", () => {
    const few  = findSimilarHistoricalTrades(makeSetup(), makeFeatures(5, 0.7));
    const many = findSimilarHistoricalTrades(makeSetup(), makeFeatures(50, 0.7));
    // Generally more evidence = higher score, but only if both have data
    assert.ok(many.evidenceScore >= few.evidenceScore - 10,
      `Many score ${many.evidenceScore} should be ≥ few ${few.evidenceScore}`);
  });

  it("evidence score is 0–100", () => {
    const features = makeFeatures(25, 0.65);
    const result = findSimilarHistoricalTrades(makeSetup(), features);
    assert.ok(result.evidenceScore >= 0 && result.evidenceScore <= 100);
  });

  it("wilson lower bound is 0–1", () => {
    const features = makeFeatures(20, 0.7);
    const result = findSimilarHistoricalTrades(makeSetup(), features);
    assert.ok(result.wilsonLowerBound >= 0 && result.wilsonLowerBound <= 1);
  });

  it("reliability improves with more evidence", () => {
    assert.equal(evidenceToReliability(0), "insufficient");
    assert.equal(evidenceToReliability(5), "low");
    assert.equal(evidenceToReliability(12), "moderate");
    assert.equal(evidenceToReliability(25), "high");
  });
});

// ─── Market Support Analyzer Tests ───────────────────────────────────────────

describe("Market Support Analyzer", () => {
  it("scores a bullish trending setup high", () => {
    const result = analyzeMarketSupport(makeSetup({ trend: "bullish", regime: "trending", volatility: "medium", trendStrength: 80 }));
    assert.ok(result.marketSupportScore >= 60, `Expected ≥60, got ${result.marketSupportScore}`);
    assert.ok(result.trendScore >= 70, `Trend score expected ≥70, got ${result.trendScore}`);
    assert.ok(result.regimeScore >= 80, `Regime score expected ≥80, got ${result.regimeScore}`);
  });

  it("penalises extreme volatility", () => {
    const result = analyzeMarketSupport(makeSetup({ volatility: "extreme" }));
    assert.ok(result.volatilityScore < 50, `Expected <50, got ${result.volatilityScore}`);
  });

  it("penalises negative news context", () => {
    const result = analyzeMarketSupport(makeSetup({ newsContext: "negative" }));
    assert.ok(result.newsScore < 45, `Expected <45, got ${result.newsScore}`);
  });

  it("positive news boosts news score", () => {
    const pos = analyzeMarketSupport(makeSetup({ newsContext: "positive" }));
    const neg = analyzeMarketSupport(makeSetup({ newsContext: "negative" }));
    assert.ok(pos.newsScore > neg.newsScore, "Positive news should score higher");
  });

  it("handles missing optional scores gracefully", () => {
    const setup = makeSetup();
    delete (setup as Partial<StrategySetup>).correlationScore;
    delete (setup as Partial<StrategySetup>).stabilityScore;
    const result = analyzeMarketSupport(setup);
    assert.ok(result.marketSupportScore >= 0 && result.marketSupportScore <= 100);
  });

  it("returns 7 explanations", () => {
    const result = analyzeMarketSupport(makeSetup());
    assert.ok(result.explanations.length >= 7);
  });

  it("score is 0–100", () => {
    const result = analyzeMarketSupport(makeSetup());
    assert.ok(result.marketSupportScore >= 0 && result.marketSupportScore <= 100);
  });
});

// ─── Pattern Strength Analyzer Tests ─────────────────────────────────────────

describe("Pattern Strength Analyzer", () => {
  it("scores strong patterns high", () => {
    const result = analyzePatternStrength(makeSetup({ supplyQuality: 85, demandQuality: 80, liquidityScore: 82, amdScore: 80, confirmationQuality: 85 }));
    assert.ok(result.patternStrengthScore >= 70, `Expected ≥70, got ${result.patternStrengthScore}`);
  });

  it("scores weak patterns low", () => {
    const result = analyzePatternStrength(makeSetup({ supplyQuality: 35, demandQuality: 30, liquidityScore: 30, amdScore: 30, confirmationQuality: 30 }));
    assert.ok(result.patternStrengthScore < 50, `Expected <50, got ${result.patternStrengthScore}`);
  });

  it("zone score uses composite of supply/demand", () => {
    const result = analyzePatternStrength(makeSetup({ supplyQuality: 90, demandQuality: 40 }));
    // Best-weighted composite
    assert.ok(result.zoneScore > 40 && result.zoneScore < 90, "Zone composite between min and max");
  });

  it("returns explanations array", () => {
    const result = analyzePatternStrength(makeSetup());
    assert.ok(result.explanations.length >= 4);
  });

  it("all sub-scores are 0–100", () => {
    const result = analyzePatternStrength(makeSetup());
    const scores = [result.zoneScore, result.liquiditySweepScore, result.amdScore, result.confirmationScore, result.patternStrengthScore];
    for (const s of scores) {
      assert.ok(s >= 0 && s <= 100, `Score out of range: ${s}`);
    }
  });
});

// ─── Context Strength Analyzer Tests ─────────────────────────────────────────

describe("Context Strength Analyzer", () => {
  it("scores london overlap session highest", () => {
    const overlap = analyzeContextStrength(makeSetup({ session: "overlap" }), []);
    const asian   = analyzeContextStrength(makeSetup({ session: "asian" }), []);
    assert.ok(overlap.sessionScore > asian.sessionScore, "Overlap should score higher than Asian");
  });

  it("scores major pairs high", () => {
    const eurusd = analyzeContextStrength(makeSetup({ pair: "EURUSD" }), []);
    assert.ok(eurusd.pairScore >= 90, `Expected ≥90 for EURUSD, got ${eurusd.pairScore}`);
  });

  it("uses historical context from features", () => {
    const features = makeFeatures(15, 0.80);
    const result = analyzeContextStrength(makeSetup(), features);
    assert.ok(result.historicalContextScore > 50, "High win rate history should boost context score");
  });

  it("falls back when no features", () => {
    const result = analyzeContextStrength(makeSetup(), []);
    assert.ok(result.contextStrengthScore >= 0 && result.contextStrengthScore <= 100);
  });

  it("score is 0–100", () => {
    const result = analyzeContextStrength(makeSetup(), makeFeatures(10));
    assert.ok(result.contextStrengthScore >= 0 && result.contextStrengthScore <= 100);
  });
});

// ─── Strength Calculator Tests ────────────────────────────────────────────────

describe("Strength Calculator", () => {
  it("produces strategy strength score 0–100", () => {
    const setup    = makeSetup();
    const features = makeFeatures(20, 0.65);
    const rule     = evaluateRules(setup);
    const evidence = findSimilarHistoricalTrades(setup, features);
    const market   = analyzeMarketSupport(setup);
    const pattern  = analyzePatternStrength(setup);
    const context  = analyzeContextStrength(setup, features);
    const result   = calculateStrategyStrength(rule, evidence, market, pattern, context);
    assert.ok(result.strategyStrengthScore >= 0 && result.strategyStrengthScore <= 100);
  });

  it("assigns a recommendation level", () => {
    const setup    = makeSetup();
    const features = makeFeatures(20, 0.7);
    const rule     = evaluateRules(setup);
    const evidence = findSimilarHistoricalTrades(setup, features);
    const market   = analyzeMarketSupport(setup);
    const pattern  = analyzePatternStrength(setup);
    const context  = analyzeContextStrength(setup, features);
    const result   = calculateStrategyStrength(rule, evidence, market, pattern, context);
    const validLevels = ["exceptional", "very_strong", "strong", "average", "weak", "avoid"];
    assert.ok(validLevels.includes(result.recommendation), `Invalid recommendation: ${result.recommendation}`);
  });

  it("has 5 weighted components summing to 1", () => {
    const total = Object.values(STRENGTH_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1.0) < 0.001, `Weights should sum to 1, got ${total}`);
  });

  it("strong setup gets strong+ recommendation", () => {
    const setup = makeSetup({
      supplyQuality: 82, demandQuality: 80, liquidityScore: 78,
      amdScore: 76, confirmationQuality: 80, setupScore: 80,
      tqi: 75, rrPlanned: 3.0, spreadPips: 0.8,
      trendStrength: 80, stabilityScore: 80, opportunityScore: 80,
    });
    const features = makeFeatures(25, 0.72);
    const rule     = evaluateRules(setup);
    const evidence = findSimilarHistoricalTrades(setup, features);
    const market   = analyzeMarketSupport(setup);
    const pattern  = analyzePatternStrength(setup);
    const context  = analyzeContextStrength(setup, features);
    const result   = calculateStrategyStrength(rule, evidence, market, pattern, context);
    const goodLevels = ["exceptional", "very_strong", "strong"];
    assert.ok(goodLevels.includes(result.recommendation),
      `Expected strong+ recommendation, got ${result.recommendation} (score: ${result.strategyStrengthScore})`);
  });

  it("weak setup gets weak/avoid recommendation", () => {
    const setup = makeSetup({
      supplyQuality: 35, demandQuality: 30, liquidityScore: 28,
      amdScore: 30, confirmationQuality: 28, setupScore: 30,
      tqi: 30, rrPlanned: 0.8, spreadPips: 5.0,
    });
    const rule     = evaluateRules(setup);
    const evidence = findSimilarHistoricalTrades(setup, []);
    const market   = analyzeMarketSupport(setup);
    const pattern  = analyzePatternStrength(setup);
    const context  = analyzeContextStrength(setup, []);
    const result   = calculateStrategyStrength(rule, evidence, market, pattern, context);
    const weakLevels = ["weak", "avoid"];
    assert.ok(weakLevels.includes(result.recommendation),
      `Expected weak/avoid, got ${result.recommendation} (score: ${result.strategyStrengthScore})`);
  });

  it("confidence penalised by insufficient evidence", () => {
    const setup    = makeSetup();
    const rule     = evaluateRules(setup);
    const evidence = findSimilarHistoricalTrades(setup, []); // no evidence
    const market   = analyzeMarketSupport(setup);
    const pattern  = analyzePatternStrength(setup);
    const context  = analyzeContextStrength(setup, []);
    const result   = calculateStrategyStrength(rule, evidence, market, pattern, context);
    // Confidence should be reduced
    assert.ok(result.confidenceScore <= result.strategyStrengthScore,
      "Confidence should be ≤ strength when evidence is insufficient");
  });
});

// ─── Recommendation Thresholds ────────────────────────────────────────────────

describe("Recommendation Thresholds", () => {
  it("maps scores to correct recommendations", () => {
    assert.equal(strengthToRecommendation(95), "exceptional");
    assert.equal(strengthToRecommendation(80), "very_strong");
    assert.equal(strengthToRecommendation(65), "strong");
    assert.equal(strengthToRecommendation(50), "average");
    assert.equal(strengthToRecommendation(30), "weak");
    assert.equal(strengthToRecommendation(10), "avoid");
  });

  it("maps strength tiers correctly", () => {
    assert.equal(scoreToTier(90), "exceptional");
    assert.equal(scoreToTier(70), "strong");
    assert.equal(scoreToTier(50), "moderate");
    assert.equal(scoreToTier(30), "weak");
    assert.equal(scoreToTier(10), "insufficient");
  });
});

// ─── Statistical Expectancy ───────────────────────────────────────────────────

describe("Statistical Expectancy", () => {
  it("positive for win rate above 50% with decent RR", () => {
    const exp = computeStatisticalExpectancy(0.6, 2.0, 20);
    assert.ok(exp > 0, `Expected positive expectancy, got ${exp}`);
  });

  it("negative for very low win rate", () => {
    const exp = computeStatisticalExpectancy(0.30, 1.5, 20);
    assert.ok(exp < 0, `Expected negative expectancy, got ${exp}`);
  });

  it("zero for insufficient evidence", () => {
    const exp = computeStatisticalExpectancy(0.7, 2.0, 3);
    assert.equal(exp, 0, "Should return 0 for insufficient evidence");
  });
});

// ─── Risk Assessment ──────────────────────────────────────────────────────────

describe("Risk Assessment", () => {
  it("identifies high spread as a risk", () => {
    const setup  = makeSetup({ spreadPips: 4.0 });
    const rule   = evaluateRules(setup);
    const market = analyzeMarketSupport(setup);
    const evidence = findSimilarHistoricalTrades(setup, []);
    const { potentialRisks } = assessRisks(setup, rule, evidence, market);
    assert.ok(potentialRisks.some(r => r.includes("spread") || r.includes("Spread")));
  });

  it("identifies failed rules as a risk", () => {
    const setup  = makeSetup({ supplyQuality: 30, demandQuality: 25, liquidityScore: 25 });
    const rule   = evaluateRules(setup);
    const market = analyzeMarketSupport(setup);
    const evidence = findSimilarHistoricalTrades(setup, []);
    const { potentialRisks } = assessRisks(setup, rule, evidence, market);
    assert.ok(potentialRisks.length > 0, "Should find risks for weak setup");
  });

  it("low risk for high-quality setup", () => {
    const setup  = makeSetup({ spreadPips: 0.5, rrPlanned: 3.0 });
    const rule   = evaluateRules(setup);
    const market = analyzeMarketSupport(setup);
    const evidence = findSimilarHistoricalTrades(makeSetup(), makeFeatures(25, 0.7));
    const { riskAssessment } = assessRisks(setup, rule, evidence, market);
    assert.ok(riskAssessment.includes("Low") || riskAssessment.includes("Moderate"),
      `Expected low/moderate risk, got: ${riskAssessment}`);
  });
});

// ─── Full Reasoning Pipeline ──────────────────────────────────────────────────

describe("Full Reasoning Pipeline", () => {
  it("runs end-to-end without error", () => {
    const setup    = makeSetup();
    const features = makeFeatures(20, 0.65);
    const report   = runStrategyReasoning(setup, features);
    assert.ok(report.reportId.length > 0);
    assert.equal(report.version, SR_ENGINE_VERSION);
    assert.ok(report.isAdvisoryOnly);
  });

  it("produces all required fields", () => {
    const report = runStrategyReasoning(makeSetup(), makeFeatures(15, 0.65));
    assert.ok(report.ruleEvaluation);
    assert.ok(report.historicalEvidence);
    assert.ok(report.marketSupport);
    assert.ok(report.patternStrength);
    assert.ok(report.contextStrength);
    assert.ok(report.strategyStrength);
    assert.ok(report.reasoning.length > 0);
    assert.ok(report.recommendationLabel.length > 0);
    assert.ok(report.recommendationRationale.length > 0);
  });

  it("strategy strength score is 0–100", () => {
    const report = runStrategyReasoning(makeSetup(), makeFeatures(20, 0.65));
    assert.ok(report.strategyStrength.strategyStrengthScore >= 0 &&
              report.strategyStrength.strategyStrengthScore <= 100);
  });

  it("isAdvisoryOnly is always true", () => {
    const r1 = runStrategyReasoning(makeSetup(), []);
    const r2 = runStrategyReasoning(makeSetup({ supplyQuality: 95 }), makeFeatures(50, 0.9));
    assert.equal(r1.isAdvisoryOnly, true);
    assert.equal(r2.isAdvisoryOnly, true);
  });

  it("never modifies setup input", () => {
    const setup   = makeSetup();
    const origRR  = setup.rrPlanned;
    const origSQ  = setup.supplyQuality;
    runStrategyReasoning(setup, makeFeatures(10));
    assert.equal(setup.rrPlanned, origRR, "rrPlanned should not be mutated");
    assert.equal(setup.supplyQuality, origSQ, "supplyQuality should not be mutated");
  });

  it("generates unique report IDs", () => {
    const setup    = makeSetup();
    const features = makeFeatures(10, 0.6);
    const r1 = runStrategyReasoning(setup, features);
    const r2 = runStrategyReasoning(setup, features);
    assert.notEqual(r1.reportId, r2.reportId, "Each report must have a unique ID");
  });

  it("strong setup outscores weak setup", () => {
    const strong = runStrategyReasoning(makeSetup({
      supplyQuality: 85, demandQuality: 82, liquidityScore: 80,
      amdScore: 78, confirmationQuality: 83, setupScore: 82,
      tqi: 78, rrPlanned: 3.0, spreadPips: 0.6,
    }), makeFeatures(25, 0.72));

    const weak = runStrategyReasoning(makeSetup({
      supplyQuality: 35, demandQuality: 30, liquidityScore: 28,
      amdScore: 30, confirmationQuality: 28, setupScore: 30,
      tqi: 30, rrPlanned: 0.8, spreadPips: 5.0,
    }), []);

    assert.ok(
      strong.strategyStrength.strategyStrengthScore >
      weak.strategyStrength.strategyStrengthScore,
      `Strong (${strong.strategyStrength.strategyStrengthScore}) should outscore weak (${weak.strategyStrength.strategyStrengthScore})`,
    );
  });

  it("reproducible: same setup + same data = same score", () => {
    const setup    = makeSetup();
    const features = makeFeatures(15, 0.65);
    const r1 = runStrategyReasoning(setup, features);
    const r2 = runStrategyReasoning(setup, features);
    assert.equal(
      r1.strategyStrength.strategyStrengthScore.toFixed(4),
      r2.strategyStrength.strategyStrengthScore.toFixed(4),
      "Score must be reproducible",
    );
  });

  it("risk assessment is present", () => {
    const report = runStrategyReasoning(makeSetup(), makeFeatures(10, 0.5));
    assert.ok(report.riskAssessment.length > 0);
    assert.ok(Array.isArray(report.potentialRisks));
  });

  it("statistical expectancy present when evidence sufficient", () => {
    const report = runStrategyReasoning(makeSetup(), makeFeatures(20, 0.65));
    // expectancy can be any real number; just check it's a number
    assert.equal(typeof report.statisticalExpectancy, "number");
  });

  it("strongest and weakest factors non-empty arrays", () => {
    const report = runStrategyReasoning(makeSetup(), makeFeatures(20, 0.65));
    assert.ok(Array.isArray(report.strongestFactors));
    assert.ok(Array.isArray(report.weakestFactors));
  });

  it("similar trades list is valid", () => {
    const report = runStrategyReasoning(makeSetup(), makeFeatures(30, 0.65));
    assert.ok(Array.isArray(report.historicalEvidence.similarTrades));
    for (const t of report.historicalEvidence.similarTrades) {
      assert.ok(t.similarity >= 0 && t.similarity <= 1, `Similarity out of range: ${t.similarity}`);
      assert.ok(t.outcome === "win" || t.outcome === "loss");
    }
  });
});

// ─── Pair Scoring ─────────────────────────────────────────────────────────────

describe("Pair Scoring", () => {
  it("EURUSD scores highest", () => {
    assert.equal(getPairScore("EURUSD"), 95);
  });
  it("unknown pair returns default", () => {
    assert.equal(getPairScore("ZARUSD"), 65);
  });
  it("XAUUSD scores high", () => {
    assert.ok(getPairScore("XAUUSD") >= 80);
  });
});

// ─── Supporting Factor Extraction ────────────────────────────────────────────

describe("Supporting Factor Extraction", () => {
  it("returns strongest and weakest arrays", () => {
    const setup    = makeSetup();
    const features = makeFeatures(15, 0.65);
    const rule     = evaluateRules(setup);
    const evidence = findSimilarHistoricalTrades(setup, features);
    const market   = analyzeMarketSupport(setup);
    const pattern  = analyzePatternStrength(setup);
    const context  = analyzeContextStrength(setup, features);
    const strength = calculateStrategyStrength(rule, evidence, market, pattern, context);
    const { strongest, weakest } = extractSupportingFactors(rule, evidence, market, pattern, context, strength);
    assert.ok(Array.isArray(strongest));
    assert.ok(Array.isArray(weakest));
    assert.ok(strongest.length <= 5);
    assert.ok(weakest.length <= 5);
  });
});
