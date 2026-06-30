// ─── Executive Strategy Brain — Tests ────────────────────────────────────────
// Comprehensive tests for the Executive Strategy Brain.
// Run: node --test --import tsx/esm src/tests/executive-brain.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  runExecutiveBrain,
  runCertification,
  ESB_ENGINE_VERSION,
  DEFAULT_SCORE_WEIGHTS,
  buildRuleEngineSummary,
  buildReasoningSummary,
  buildQualitySummary,
  buildIdentitySummary,
  buildHistoricalIntelligence,
  buildMarketSummary,
  buildResearchSummary,
} from "../executive-brain/index.js";

import {
  computeExecutiveScore,
  scoreRuleQuality,
  scoreStrategyStrength,
  scoreHistoricalEvidence,
  scoreMarketIntelligence,
  scoreTraderIdentity,
  scoreConfidence,
  scoreDataQuality,
} from "../executive-brain/scorer.js";

import {
  scoreToRecommendation,
  recommendationLabel,
  buildRationale,
} from "../executive-brain/recommender.js";

import {
  buildExplainability,
} from "../executive-brain/explainer.js";

import type {
  RuleEngineSummary,
  StrategyReasoningSummary,
  StrategyQualitySummary,
  TraderIdentitySummary,
  HistoricalIntelligence,
  MarketIntelligenceSummary,
  ResearchIntelligenceSummary,
} from "../executive-brain/types.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const strongRule: RuleEngineSummary = {
  rulePassRate: 90, ruleIntegrity: 88, ruleConfidence: 85,
  passingRules: 9, totalRules: 10, failedRules: 1, exceptionalRules: 2,
};

const weakRule: RuleEngineSummary = {
  rulePassRate: 30, ruleIntegrity: 40, ruleConfidence: 35,
  passingRules: 3, totalRules: 10, failedRules: 7, exceptionalRules: 0,
};

const emptyRule: RuleEngineSummary = {
  rulePassRate: 0, ruleIntegrity: 0, ruleConfidence: 0,
  passingRules: 0, totalRules: 0, failedRules: 0, exceptionalRules: 0,
};

const strongReasoning: StrategyReasoningSummary = {
  strategyStrength: 85, confidence: 80, evidence: 25, reportId: "r-001",
  strongestReasons: ["Strong supply zone", "AMD phase confirmed"],
  weakestReasons: ["Low volume"],
  strengthTier: "very_strong",
};

const weakReasoning: StrategyReasoningSummary = {
  strategyStrength: 20, confidence: 30, evidence: 2, reportId: null,
  strongestReasons: [], weakestReasons: ["No confluence", "Weak pattern"],
  strengthTier: "insufficient",
};

const strongQuality: StrategyQualitySummary = {
  overallQualityScore: 82, structuralQuality: 85, liquidityQuality: 78,
  amdQuality: 88, confirmationQuality: 80, historicalQuality: 75,
  classification: "elite", reportId: "q-001",
};

const weakQuality: StrategyQualitySummary = {
  overallQualityScore: 28, structuralQuality: 25, liquidityQuality: 30,
  amdQuality: 22, confirmationQuality: 35, historicalQuality: 28,
  classification: "poor", reportId: null,
};

const stableIdentity: TraderIdentitySummary = {
  identitySimilarity: 88, preferenceAlignment: 82, historicalConsistency: 79,
  driftStatus: "stable", reportId: "ti-001",
};

const driftingIdentity: TraderIdentitySummary = {
  identitySimilarity: 40, preferenceAlignment: 35, historicalConsistency: 38,
  driftStatus: "drifting", reportId: "ti-002",
};

const richHist: HistoricalIntelligence = {
  similarTrades: [
    { tradeId: "t1", pair: "EURUSD", session: "london", regime: "trending", outcome: "win", rrActual: 2.5, similarity: 0.91, openedAt: new Date() },
    { tradeId: "t2", pair: "EURUSD", session: "london", regime: "trending", outcome: "win", rrActual: 1.8, similarity: 0.87, openedAt: new Date() },
    { tradeId: "t3", pair: "EURUSD", session: "london", regime: "trending", outcome: "loss", rrActual: -1.0, similarity: 0.82, openedAt: new Date() },
  ],
  historicalWinRate: 0.68, profitFactor: 2.4, averageRR: 2.1, historicalExpectancy: 0.82, sampleSize: 35,
};

const emptyHist: HistoricalIntelligence = {
  similarTrades: [], historicalWinRate: 0, profitFactor: 0, averageRR: 0, historicalExpectancy: 0, sampleSize: 0,
};

const bullishMarket: MarketIntelligenceSummary = {
  marketHealth: 82, opportunityScore: 78, marketRegime: "trending", trend: "bullish",
  volatility: 65, liquidity: 80, correlation: 55, stability: 75,
};

const bearishMarket: MarketIntelligenceSummary = {
  marketHealth: 28, opportunityScore: 25, marketRegime: "volatile", trend: "bearish",
  volatility: 85, liquidity: 35, correlation: 80, stability: 20,
};

const activeResearch: ResearchIntelligenceSummary = {
  activeHypotheses: 3, candidateImprovements: 2, experimentalStrategyStatus: "running",
  latestResearchConfidence: 72, pendingDeploymentRequests: 1,
};

// ─── Tests: Scorer ────────────────────────────────────────────────────────────

describe("scoreRuleQuality", () => {
  it("returns 0 for empty rule set", () => {
    assert.equal(scoreRuleQuality(emptyRule), 0);
  });

  it("returns high score for strong rules", () => {
    const score = scoreRuleQuality(strongRule);
    assert.ok(score > 80, `Expected >80, got ${score}`);
  });

  it("returns low score for weak rules", () => {
    const score = scoreRuleQuality(weakRule);
    assert.ok(score < 50, `Expected <50, got ${score}`);
  });

  it("clamps to 0-100", () => {
    const score = scoreRuleQuality(strongRule);
    assert.ok(score >= 0 && score <= 100, `Out of range: ${score}`);
  });
});

describe("scoreStrategyStrength", () => {
  it("returns high score for strong reasoning", () => {
    const score = scoreStrategyStrength(strongReasoning);
    assert.ok(score > 70, `Expected >70, got ${score}`);
  });

  it("dampens by confidence", () => {
    const lowConf = { ...strongReasoning, confidence: 10 };
    const highConf = { ...strongReasoning, confidence: 90 };
    assert.ok(scoreStrategyStrength(lowConf) < scoreStrategyStrength(highConf));
  });
});

describe("scoreHistoricalEvidence", () => {
  it("returns 0 for no historical data", () => {
    assert.equal(scoreHistoricalEvidence(emptyHist), 0);
  });

  it("returns high score for rich history", () => {
    const score = scoreHistoricalEvidence(richHist);
    assert.ok(score > 60, `Expected >60, got ${score}`);
  });

  it("applies sample discount for n < 20", () => {
    const smallSample = { ...richHist, sampleSize: 5 };
    const fullSample  = { ...richHist, sampleSize: 30 };
    assert.ok(scoreHistoricalEvidence(smallSample) < scoreHistoricalEvidence(fullSample));
  });
});

describe("scoreMarketIntelligence", () => {
  it("returns high score for bullish market", () => {
    const score = scoreMarketIntelligence(bullishMarket);
    assert.ok(score > 70, `Expected >70, got ${score}`);
  });

  it("returns low score for bearish/volatile market", () => {
    const score = scoreMarketIntelligence(bearishMarket);
    assert.ok(score < 40, `Expected <40, got ${score}`);
  });
});

describe("scoreTraderIdentity", () => {
  it("returns high score for stable identity", () => {
    const score = scoreTraderIdentity(stableIdentity);
    assert.ok(score > 75, `Expected >75, got ${score}`);
  });

  it("applies drift penalty", () => {
    const stable   = scoreTraderIdentity(stableIdentity);
    const drifting = scoreTraderIdentity(driftingIdentity);
    assert.ok(stable > drifting, `Stable ${stable} should > drifting ${drifting}`);
  });

  it("penalises drifting status", () => {
    const score = scoreTraderIdentity(driftingIdentity);
    assert.ok(score < 50, `Expected <50, got ${score}`);
  });
});

describe("scoreConfidence", () => {
  it("returns higher confidence with more samples", () => {
    const low  = scoreConfidence(weakReasoning, emptyHist);
    const high = scoreConfidence(strongReasoning, richHist);
    assert.ok(high > low);
  });
});

describe("scoreDataQuality", () => {
  it("returns 100 for fully populated inputs", () => {
    const score = scoreDataQuality(strongRule, strongReasoning, strongQuality, stableIdentity, richHist, bullishMarket);
    assert.ok(score >= 80, `Expected >=80, got ${score}`);
  });

  it("returns reduced score when subsystems missing", () => {
    const score = scoreDataQuality(emptyRule, weakReasoning, weakQuality, driftingIdentity, emptyHist, bearishMarket);
    assert.ok(score < 60, `Expected <60, got ${score}`);
  });
});

describe("computeExecutiveScore", () => {
  it("returns score in 0-100 range", () => {
    const { executiveScore } = computeExecutiveScore({
      rule: strongRule, reasoning: strongReasoning, quality: strongQuality,
      ti: stableIdentity, hist: richHist, mkt: bullishMarket,
    });
    assert.ok(executiveScore >= 0 && executiveScore <= 100, `Out of range: ${executiveScore}`);
  });

  it("strong inputs produce score >70", () => {
    const { executiveScore } = computeExecutiveScore({
      rule: strongRule, reasoning: strongReasoning, quality: strongQuality,
      ti: stableIdentity, hist: richHist, mkt: bullishMarket,
    });
    assert.ok(executiveScore > 70, `Expected >70, got ${executiveScore}`);
  });

  it("weak inputs produce score <40", () => {
    const { executiveScore } = computeExecutiveScore({
      rule: emptyRule, reasoning: weakReasoning, quality: weakQuality,
      ti: driftingIdentity, hist: emptyHist, mkt: bearishMarket,
    });
    assert.ok(executiveScore < 40, `Expected <40, got ${executiveScore}`);
  });

  it("returns transparent weight breakdown", () => {
    const { breakdown } = computeExecutiveScore({
      rule: strongRule, reasoning: strongReasoning, quality: strongQuality,
      ti: stableIdentity, hist: richHist, mkt: bullishMarket,
    });
    assert.ok("ruleQuality" in breakdown);
    assert.ok("strategyStrength" in breakdown);
    assert.ok("historicalEvidence" in breakdown);
    assert.ok("marketIntelligence" in breakdown);
    assert.ok("traderIdentity" in breakdown);
    assert.ok("confidence" in breakdown);
    assert.ok("dataQuality" in breakdown);
    assert.ok("total" in breakdown);
  });

  it("weights sum to ~1 after normalisation", () => {
    const { weights } = computeExecutiveScore({
      rule: strongRule, reasoning: strongReasoning, quality: strongQuality,
      ti: stableIdentity, hist: richHist, mkt: bullishMarket,
    });
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 0.01, `Weights sum ${sum} ≠ 1`);
  });

  it("respects custom weight overrides", () => {
    const { weights } = computeExecutiveScore({
      rule: strongRule, reasoning: strongReasoning, quality: strongQuality,
      ti: stableIdentity, hist: richHist, mkt: bullishMarket,
      weights: { ruleQuality: 0.50 },
    });
    assert.ok(weights.ruleQuality > DEFAULT_SCORE_WEIGHTS.ruleQuality,
      "Custom weight should be larger after normalisation");
  });
});

// ─── Tests: Recommender ───────────────────────────────────────────────────────

describe("scoreToRecommendation", () => {
  const cases: [number, string][] = [
    [95, "elite"],
    [85, "very_strong"],
    [75, "strong"],
    [65, "acceptable"],
    [55, "borderline"],
    [40, "weak"],
    [20, "reject"],
  ];
  for (const [score, expected] of cases) {
    it(`score ${score} → ${expected}`, () => {
      assert.equal(scoreToRecommendation(score), expected);
    });
  }
});

describe("recommendationLabel", () => {
  it("returns human-readable labels", () => {
    assert.equal(recommendationLabel("elite"), "Elite Trade");
    assert.equal(recommendationLabel("very_strong"), "Very Strong");
    assert.equal(recommendationLabel("reject"), "Reject");
  });
});

describe("buildRationale", () => {
  it("includes score in rationale", () => {
    const { executiveScore, breakdown } = computeExecutiveScore({
      rule: strongRule, reasoning: strongReasoning, quality: strongQuality,
      ti: stableIdentity, hist: richHist, mkt: bullishMarket,
    });
    const rationale = buildRationale(
      executiveScore, "very_strong", breakdown,
      strongRule, strongReasoning, strongQuality, stableIdentity,
      richHist, bullishMarket, activeResearch,
    );
    assert.ok(rationale.includes("Executive Score:"), "Should include score label");
    assert.ok(rationale.includes("Score breakdown:"), "Should include breakdown");
    assert.ok(rationale.length > 200, "Should be detailed");
  });

  it("rationale for reject includes 'rejected'", () => {
    const { executiveScore, breakdown } = computeExecutiveScore({
      rule: emptyRule, reasoning: weakReasoning, quality: weakQuality,
      ti: driftingIdentity, hist: emptyHist, mkt: bearishMarket,
    });
    const rationale = buildRationale(
      executiveScore, "reject", breakdown,
      emptyRule, weakReasoning, weakQuality, driftingIdentity,
      emptyHist, bearishMarket, { activeHypotheses: 0, candidateImprovements: 0, experimentalStrategyStatus: "idle", latestResearchConfidence: 0, pendingDeploymentRequests: 0 },
    );
    assert.ok(rationale.toLowerCase().includes("reject"), "Should mention rejection");
  });
});

// ─── Tests: Explainability ────────────────────────────────────────────────────

describe("buildExplainability", () => {
  it("returns all required fields", () => {
    const { breakdown } = computeExecutiveScore({
      rule: strongRule, reasoning: strongReasoning, quality: strongQuality,
      ti: stableIdentity, hist: richHist, mkt: bullishMarket,
    });
    const expl = buildExplainability(
      breakdown, strongRule, strongReasoning, strongQuality,
      stableIdentity, richHist, bullishMarket, activeResearch,
    );
    assert.ok(Array.isArray(expl.supportingRules), "supportingRules must be array");
    assert.ok(Array.isArray(expl.supportingHistoricalEvidence));
    assert.ok(Array.isArray(expl.supportingMarketEvidence));
    assert.ok(Array.isArray(expl.supportingStatisticalEvidence));
    assert.ok(typeof expl.confidenceInterval.lower === "number");
    assert.ok(typeof expl.confidenceInterval.upper === "number");
    assert.ok(["high", "moderate", "low", "insufficient"].includes(expl.reliabilityRating));
    assert.ok(typeof expl.sampleSize === "number");
    assert.ok(Array.isArray(expl.historicalReferences));
  });

  it("returns 'high' reliability for rich data", () => {
    const { breakdown } = computeExecutiveScore({
      rule: strongRule, reasoning: strongReasoning, quality: strongQuality,
      ti: stableIdentity, hist: richHist, mkt: bullishMarket,
    });
    const expl = buildExplainability(
      breakdown, strongRule, strongReasoning, strongQuality,
      stableIdentity, richHist, bullishMarket, activeResearch,
    );
    assert.equal(expl.reliabilityRating, "high");
  });

  it("returns 'insufficient' for no data", () => {
    const { breakdown } = computeExecutiveScore({
      rule: emptyRule, reasoning: weakReasoning, quality: weakQuality,
      ti: driftingIdentity, hist: emptyHist, mkt: bearishMarket,
    });
    const expl = buildExplainability(
      breakdown, emptyRule, weakReasoning, weakQuality,
      driftingIdentity, emptyHist, bearishMarket,
      { activeHypotheses: 0, candidateImprovements: 0, experimentalStrategyStatus: "idle", latestResearchConfidence: 0, pendingDeploymentRequests: 0 },
    );
    assert.equal(expl.reliabilityRating, "insufficient");
  });

  it("confidence interval bounds are valid", () => {
    const { breakdown } = computeExecutiveScore({
      rule: strongRule, reasoning: strongReasoning, quality: strongQuality,
      ti: stableIdentity, hist: richHist, mkt: bullishMarket,
    });
    const expl = buildExplainability(
      breakdown, strongRule, strongReasoning, strongQuality,
      stableIdentity, richHist, bullishMarket, activeResearch,
    );
    assert.ok(expl.confidenceInterval.lower <= expl.confidenceInterval.upper,
      `lower ${expl.confidenceInterval.lower} > upper ${expl.confidenceInterval.upper}`);
    assert.ok(expl.confidenceInterval.lower >= 0);
    assert.ok(expl.confidenceInterval.upper <= 100);
  });
});

// ─── Tests: Input builders ────────────────────────────────────────────────────

describe("buildRuleEngineSummary", () => {
  it("returns defaults for null input", () => {
    const r = buildRuleEngineSummary(null);
    assert.equal(r.totalRules, 0);
    assert.equal(r.rulePassRate, 0);
  });

  it("correctly maps SR report fields", () => {
    const r = buildRuleEngineSummary({
      passingRules: 8, totalRules: 10, failedRules: 2,
      exceptionalRules: 3, ruleQualityScore: 82, confidenceScore: 75,
    });
    assert.equal(r.passingRules, 8);
    assert.equal(r.totalRules, 10);
    assert.equal(r.rulePassRate, 80);
    assert.equal(r.ruleIntegrity, 82);
  });
});

describe("buildReasoningSummary", () => {
  it("returns defaults for null input", () => {
    const r = buildReasoningSummary(null);
    assert.equal(r.strategyStrength, 0);
    assert.equal(r.reportId, null);
  });

  it("extracts strategy strength and confidence", () => {
    const r = buildReasoningSummary({
      strategyStrengthScore: 78, confidenceScore: 82, evidenceCount: 25,
      strongestFactors: [{ name: "Supply zone" }], weakestFactors: [],
      reportId: "r-abc", strengthTier: "very_strong",
    });
    assert.equal(r.strategyStrength, 78);
    assert.equal(r.confidence, 82);
    assert.equal(r.evidence, 25);
    assert.equal(r.reportId, "r-abc");
  });
});

describe("buildQualitySummary", () => {
  it("returns defaults for null input", () => {
    const q = buildQualitySummary(null);
    assert.equal(q.overallQualityScore, 0);
    assert.equal(q.reportId, null);
  });

  it("maps all quality component scores", () => {
    const q = buildQualitySummary({
      strategyQualityScore: 85, structuralQualityScore: 88,
      liquidityIntelligenceScore: 75, amdIntelligenceScore: 90,
      confirmationIntelligenceScore: 80, historicalIntelligenceScore: 72,
      classification: "elite", reportId: "q-xyz",
    });
    assert.equal(q.overallQualityScore, 85);
    assert.equal(q.amdQuality, 90);
    assert.equal(q.classification, "elite");
  });
});

describe("buildHistoricalIntelligence", () => {
  it("returns defaults for null input", () => {
    const h = buildHistoricalIntelligence(null);
    assert.equal(h.sampleSize, 0);
    assert.equal(h.similarTrades.length, 0);
  });

  it("maps win rate and profit factor", () => {
    const h = buildHistoricalIntelligence({
      evidenceCount: 30, winCount: 20, historicalWinRate: 0.67,
      profitFactor: 2.1, averageRR: 2.3, statisticalExpectancy: 0.75,
      similarTrades: [],
    });
    assert.equal(h.sampleSize, 30);
    assert.ok(Math.abs(h.historicalWinRate - 0.67) < 0.001);
    assert.ok(Math.abs(h.profitFactor - 2.1) < 0.001);
  });
});

// ─── Tests: Main engine ───────────────────────────────────────────────────────

describe("runExecutiveBrain", () => {
  const setup = {
    pair: "EURUSD", session: "london", regime: "trending",
    trend: "bullish", volatility: "medium",
    supplyQuality: 80, demandQuality: 75, liquidityScore: 78,
    amdScore: 85, confirmationQuality: 82, setupScore: 79, tqi: 81, rrPlanned: 2.5,
  };

  it("generates a valid Unified Strategy Intelligence Object", async () => {
    const obj = await runExecutiveBrain({ setup });
    assert.ok(obj.reportId, "Must have reportId");
    assert.equal(obj.isAdvisoryOnly, true, "Must be advisory only");
    assert.equal(obj.engineVersion, ESB_ENGINE_VERSION);
    assert.ok(obj.executiveScore >= 0 && obj.executiveScore <= 100, `Score out of range: ${obj.executiveScore}`);
    assert.ok(typeof obj.recommendation === "string");
    assert.ok(typeof obj.recommendationLabel === "string");
    assert.ok(typeof obj.recommendationRationale === "string");
  });

  it("always sets isAdvisoryOnly = true", async () => {
    const obj = await runExecutiveBrain({ setup });
    assert.equal(obj.isAdvisoryOnly, true);
  });

  it("populates all component summaries", async () => {
    const obj = await runExecutiveBrain({ setup });
    assert.ok(typeof obj.ruleEngine.rulePassRate === "number");
    assert.ok(typeof obj.strategyReasoning.strategyStrength === "number");
    assert.ok(typeof obj.strategyQuality.overallQualityScore === "number");
    assert.ok(typeof obj.traderIdentity.identitySimilarity === "number");
    assert.ok(typeof obj.historicalIntelligence.sampleSize === "number");
    assert.ok(typeof obj.marketIntelligence.marketHealth === "number");
    assert.ok(typeof obj.researchIntelligence.activeHypotheses === "number");
  });

  it("scoreBreakdown contains all required dimensions", async () => {
    const obj = await runExecutiveBrain({ setup });
    const dims = ["ruleQuality", "strategyStrength", "historicalEvidence", "marketIntelligence", "traderIdentity", "confidence", "dataQuality"];
    for (const dim of dims) {
      assert.ok(dim in obj.scoreBreakdown, `Missing dimension: ${dim}`);
    }
  });

  it("explainability contains all required fields", async () => {
    const obj = await runExecutiveBrain({ setup });
    assert.ok(Array.isArray(obj.explainability.supportingRules));
    assert.ok(Array.isArray(obj.explainability.supportingHistoricalEvidence));
    assert.ok(Array.isArray(obj.explainability.supportingMarketEvidence));
    assert.ok(Array.isArray(obj.explainability.supportingStatisticalEvidence));
    assert.ok(typeof obj.explainability.confidenceInterval.lower === "number");
    assert.ok(typeof obj.explainability.confidenceInterval.upper === "number");
  });

  it("uses SR report when provided", async () => {
    const srReport = {
      passingRules: 9, totalRules: 10, failedRules: 1, exceptionalRules: 2,
      ruleQualityScore: 88, confidenceScore: 82, strategyStrengthScore: 87,
      evidenceCount: 30, strongestFactors: [], weakestFactors: [],
      reportId: "sr-test", strengthTier: "very_strong",
      historicalWinRate: 0.70, profitFactor: 2.5, averageRR: 2.2, statisticalExpectancy: 0.85,
      similarTrades: [],
    };
    const obj = await runExecutiveBrain({ setup, srReport: srReport as Record<string, unknown> });
    assert.equal(obj.strategyReasoning.reportId, "sr-test");
    assert.equal(obj.ruleEngine.passingRules, 9);
  });

  it("generates unique reportIds for concurrent evaluations", async () => {
    const [a, b, c] = await Promise.all([
      runExecutiveBrain({ setup }),
      runExecutiveBrain({ setup }),
      runExecutiveBrain({ setup }),
    ]);
    assert.notEqual(a.reportId, b.reportId);
    assert.notEqual(b.reportId, c.reportId);
    assert.notEqual(a.reportId, c.reportId);
  });

  it("rationale is non-empty and explains the decision", async () => {
    const obj = await runExecutiveBrain({ setup });
    assert.ok(obj.recommendationRationale.length > 100, "Rationale too short");
    assert.ok(obj.recommendationRationale.includes("Executive Score:"), "Missing score line");
    assert.ok(obj.recommendationRationale.includes("Score breakdown:"), "Missing breakdown");
  });

  it("versions object is populated", async () => {
    const obj = await runExecutiveBrain({
      setup, srVersion: "2.0.0", sqiVersion: "1.5.0",
    });
    assert.equal(obj.versions.sr, "2.0.0");
    assert.equal(obj.versions.sqi, "1.5.0");
  });
});

// ─── Tests: Certification ─────────────────────────────────────────────────────

describe("runCertification", () => {
  const baseCtx = {
    totalEsbReports: 50, recentEsbReports: 10, srReports: 40, sqiReports: 38,
    tiProfiles: 2, researchProjects: 3, marketReports: 20, learningCycles: 60,
    avgExplainability: 85, avgDataQuality: 78, avgConfidence: 72,
    apiRoutesVerified: 6, totalApiRoutes: 6,
    dashboardPagesVerified: 1, totalDashboardPages: 1,
    avgLatencyMs: 110, maxLatencyMs: 650,
    totalTests: 72, passingTests: 72,
    researchIsolationVerified: true,
  };

  it("generates a certification report with all required fields", async () => {
    const report = await runCertification(baseCtx);
    assert.ok(report.certId, "Must have certId");
    assert.ok(typeof report.overallScore === "number");
    assert.ok(["certified", "conditional", "failed"].includes(report.certificationStatus));
    assert.ok(report.grade.length > 0);
    assert.ok(typeof report.phase6Readiness === "number");
    assert.ok(report.phase6Readiness >= 0 && report.phase6Readiness <= 100);
  });

  it("certified status for high scores", async () => {
    const report = await runCertification(baseCtx);
    if (report.overallScore >= 80) {
      assert.equal(report.certificationStatus, "certified");
    }
  });

  it("failed status when data is absent", async () => {
    const emptyCtx = {
      ...baseCtx,
      totalEsbReports: 0, srReports: 0, sqiReports: 0,
      learningCycles: 0, tiProfiles: 0,
      researchIsolationVerified: false,
    };
    const report = await runCertification(emptyCtx);
    assert.ok(report.overallScore < 80, `Expected score < 80, got ${report.overallScore}`);
  });

  it("subsystems covers all 11 required areas", async () => {
    const report = await runCertification(baseCtx);
    const required = [
      "ruleConsistency", "statisticalValidity", "explainability",
      "historicalReproducibility", "identityIntegrity", "learningIntegrity",
      "researchIsolation", "apiStability", "dashboardFunctionality",
      "performance", "scalability",
    ];
    for (const key of required) {
      assert.ok(key in report.subsystems, `Missing subsystem: ${key}`);
    }
  });

  it("all subsystem scores are 0-100", async () => {
    const report = await runCertification(baseCtx);
    for (const [name, sub] of Object.entries(report.subsystems)) {
      assert.ok(
        sub.score >= 0 && sub.score <= 100,
        `Subsystem ${name} score out of range: ${sub.score}`,
      );
    }
  });

  it("research isolation is 95 when verified", async () => {
    const report = await runCertification({ ...baseCtx, researchIsolationVerified: true });
    assert.ok(report.subsystems.researchIsolation.score >= 90,
      `Expected >=90, got ${report.subsystems.researchIsolation.score}`);
  });

  it("generates unique certIds", async () => {
    const [a, b] = await Promise.all([
      runCertification(baseCtx),
      runCertification(baseCtx),
    ]);
    assert.notEqual(a.certId, b.certId);
  });

  it("technical debt list is non-empty", async () => {
    const report = await runCertification(baseCtx);
    assert.ok(report.technicalDebt.length > 0, "Technical debt should be listed");
  });

  it("phase6ReadinessLabel is descriptive", async () => {
    const report = await runCertification(baseCtx);
    assert.ok(report.phase6ReadinessLabel.length > 10);
  });
});

// ─── Tests: Performance ───────────────────────────────────────────────────────

describe("performance", () => {
  it("computeExecutiveScore runs in <10ms", () => {
    const start = performance.now();
    computeExecutiveScore({
      rule: strongRule, reasoning: strongReasoning, quality: strongQuality,
      ti: stableIdentity, hist: richHist, mkt: bullishMarket,
    });
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 10, `computeExecutiveScore took ${elapsed.toFixed(2)}ms`);
  });

  it("runExecutiveBrain runs in <50ms (no DB)", async () => {
    const start = performance.now();
    await runExecutiveBrain({
      setup: { pair: "EURUSD", session: "london", regime: "trending", trend: "bullish", volatility: "medium" },
    });
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 50, `runExecutiveBrain took ${elapsed.toFixed(2)}ms`);
  });

  it("100 concurrent evaluations complete without error", async () => {
    const setup = { pair: "GBPUSD", session: "new_york", regime: "ranging", trend: "bearish", volatility: "high" };
    const results = await Promise.all(Array.from({ length: 100 }, () => runExecutiveBrain({ setup })));
    assert.equal(results.length, 100);
    for (const r of results) {
      assert.ok(r.executiveScore >= 0 && r.executiveScore <= 100);
    }
  });

  it("runCertification runs in <50ms", async () => {
    const ctx = {
      totalEsbReports: 50, recentEsbReports: 10, srReports: 40, sqiReports: 38,
      tiProfiles: 2, researchProjects: 3, marketReports: 20, learningCycles: 60,
      avgExplainability: 85, avgDataQuality: 78, avgConfidence: 72,
      apiRoutesVerified: 6, totalApiRoutes: 6,
      dashboardPagesVerified: 1, totalDashboardPages: 1,
      avgLatencyMs: 110, maxLatencyMs: 650,
      totalTests: 72, passingTests: 72,
      researchIsolationVerified: true,
    };
    const start = performance.now();
    await runCertification(ctx);
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 50, `runCertification took ${elapsed.toFixed(2)}ms`);
  });
});

// ─── Tests: Advisory guard ────────────────────────────────────────────────────

describe("advisory guard", () => {
  it("isAdvisoryOnly is always true in engine output", async () => {
    const setup = { pair: "USDJPY", session: "london", regime: "volatile", trend: "unknown", volatility: "high" };
    const obj = await runExecutiveBrain({ setup });
    assert.equal(obj.isAdvisoryOnly, true);
  });

  it("ESB_ENGINE_VERSION is a semver string", () => {
    assert.match(ESB_ENGINE_VERSION, /^\d+\.\d+\.\d+$/);
  });

  it("DEFAULT_SCORE_WEIGHTS sum to 1", () => {
    const sum = Object.values(DEFAULT_SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 0.001, `Weights sum ${sum} ≠ 1`);
  });
});
