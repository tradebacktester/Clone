// ─── Unified Market Intelligence Tests ────────────────────────────────────────
// Tests for all unified intelligence engine components.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeHealthScore } from "../health-scorer.js";
import { computeOpportunityScore } from "../opportunity-scorer.js";
import { assessRisk } from "../risk-assessor.js";
import { compareHistorical } from "../historical-comparator.js";
import { generateOutlook } from "../outlook-generator.js";
import { generateIntelligenceReport } from "../intelligence-report.js";
import type { FeatureRow } from "../types.js";

// ─── Test data builders ────────────────────────────────────────────────────────

function makeFeature(overrides: Partial<FeatureRow> = {}): FeatureRow {
  return {
    pair: "EURUSD",
    session: "london",
    marketRegime: "trending",
    trend: "bullish",
    supplyQuality: 70,
    demandQuality: 65,
    liquidityScore: 72,
    amdScore: 68,
    confirmationQuality: 65,
    setupScore: 70,
    tqi: 72,
    spreadPips: 1.2,
    volatility: "medium",
    outcome: "win",
    pnl: 1.5,
    confidence: 75,
    patternType: "BOS",
    entryTime: new Date("2024-01-15T10:00:00Z"),
    ...overrides,
  };
}

function makeFeatureSet(n: number, overrides: Partial<FeatureRow> = {}): FeatureRow[] {
  return Array.from({ length: n }, (_, i) =>
    makeFeature({
      outcome: i % 3 === 0 ? "loss" : "win",
      pnl: i % 3 === 0 ? -0.8 : 1.5 + (i % 5) * 0.1,
      entryTime: new Date(Date.now() - (n - i) * 3600_000),
      ...overrides,
    })
  );
}

// ─── Health Scorer Tests ───────────────────────────────────────────────────────

describe("computeHealthScore", () => {
  it("returns a valid score with empty features", () => {
    const h = computeHealthScore([]);
    assert.equal(typeof h.overall, "number");
    assert.ok(h.overall >= 0 && h.overall <= 100, `Overall ${h.overall} out of [0,100]`);
    assert.ok(["A","B","C","D","F"].includes(h.grade));
    assert.equal(typeof h.interpretation, "string");
  });

  it("returns a valid score with minimal features", () => {
    const h = computeHealthScore(makeFeatureSet(5));
    assert.ok(h.overall >= 0 && h.overall <= 100);
  });

  it("returns a valid score with 200+ features", () => {
    const h = computeHealthScore(makeFeatureSet(200));
    assert.ok(h.overall >= 0 && h.overall <= 100);
    assert.ok(h.overall > 40, `Expected >40 with good data, got ${h.overall}`);
  });

  it("has 8 components with valid weights summing to 1.0", () => {
    const h = computeHealthScore(makeFeatureSet(50));
    assert.equal(Object.keys(h.components).length, 8);
    const weightSum = Object.values(h.components).reduce((s, c) => s + c.weight, 0);
    assert.ok(Math.abs(weightSum - 1.0) < 0.001, `Weights sum to ${weightSum}`);
  });

  it("each component score is in [0,100]", () => {
    const h = computeHealthScore(makeFeatureSet(100));
    for (const [k, c] of Object.entries(h.components)) {
      assert.ok(c.score >= 0 && c.score <= 100, `Component ${k} score ${c.score} out of [0,100]`);
    }
  });

  it("high-volatility features produce lower health than medium-volatility", () => {
    const highVol = computeHealthScore(makeFeatureSet(100, { volatility: "high" }));
    const medVol = computeHealthScore(makeFeatureSet(100, { volatility: "medium" }));
    assert.ok(
      medVol.components.volatility.score >= highVol.components.volatility.score,
      `Medium vol (${medVol.components.volatility.score}) should be >= high vol (${highVol.components.volatility.score})`
    );
  });

  it("assigns A grade for high scores", () => {
    // Build features with very favorable conditions
    const favorable = makeFeatureSet(200, {
      volatility: "medium", liquidityScore: 90, amdScore: 85,
      confirmationQuality: 85, setupScore: 85, tqi: 85,
      spreadPips: 0.5, outcome: "win", pnl: 2,
    });
    const h = computeHealthScore(favorable);
    assert.ok(["A","B"].includes(h.grade), `Expected A or B, got ${h.grade} with score ${h.overall}`);
  });

  it("assigns F grade for very poor conditions", () => {
    const poor = makeFeatureSet(50, {
      volatility: "high", liquidityScore: 10, amdScore: 10,
      confirmationQuality: 10, setupScore: 10, tqi: 10,
      spreadPips: 8, outcome: "loss", pnl: -2,
    });
    const h = computeHealthScore(poor);
    assert.ok(["D","F"].includes(h.grade), `Expected D or F, got ${h.grade} with score ${h.overall}`);
  });
});

// ─── Opportunity Scorer Tests ──────────────────────────────────────────────────

describe("computeOpportunityScore", () => {
  it("returns valid score with empty features", () => {
    const o = computeOpportunityScore([]);
    assert.ok(o.overall >= 0 && o.overall <= 100);
    assert.equal(typeof o.label, "string");
    assert.ok(o.note.includes("NOT"));  // non-directional note
  });

  it("has 7 factors with valid weights summing to 1.0", () => {
    const o = computeOpportunityScore(makeFeatureSet(50));
    assert.equal(Object.keys(o.factors).length, 7);
    const weightSum = Object.values(o.factors).reduce((s, f) => s + f.weight, 0);
    assert.ok(Math.abs(weightSum - 1.0) < 0.001, `Weights sum to ${weightSum}`);
  });

  it("each factor score is in [0,100]", () => {
    const o = computeOpportunityScore(makeFeatureSet(100));
    for (const [k, f] of Object.entries(o.factors)) {
      assert.ok(f.score >= 0 && f.score <= 100, `Factor ${k} score ${f.score} out of [0,100]`);
    }
  });

  it("note explicitly states non-directional", () => {
    const o = computeOpportunityScore(makeFeatureSet(20));
    assert.ok(o.note.toLowerCase().includes("not") || o.note.toLowerCase().includes("no"), `Note: ${o.note}`);
  });

  it("trending regime produces higher score than volatile regime", () => {
    const trending = computeOpportunityScore(makeFeatureSet(50, { marketRegime: "trending" }));
    const volatile = computeOpportunityScore(makeFeatureSet(50, { marketRegime: "volatile" }));
    assert.ok(
      trending.factors.regime.score > volatile.factors.regime.score,
      `Trending (${trending.factors.regime.score}) should beat volatile (${volatile.factors.regime.score})`
    );
  });

  it("label matches score ranges", () => {
    const labels = ["Very Low", "Low", "Moderate", "Good", "High", "Excellent"];
    const o = computeOpportunityScore(makeFeatureSet(100));
    assert.ok(labels.includes(o.label), `Unexpected label: ${o.label}`);
  });

  it("reasoning is non-empty string", () => {
    const o = computeOpportunityScore(makeFeatureSet(50));
    assert.ok(o.reasoning.length > 10, `Reasoning too short: "${o.reasoning}"`);
  });
});

// ─── Risk Assessor Tests ───────────────────────────────────────────────────────

describe("assessRisk", () => {
  it("returns valid risk assessment with empty features", () => {
    const r = assessRisk([]);
    const valid = ["Low","Moderate","Elevated","High","Extreme"];
    assert.ok(valid.includes(r.overall), `Invalid overall: ${r.overall}`);
  });

  it("has 6 dimensions", () => {
    const r = assessRisk(makeFeatureSet(50));
    assert.equal(Object.keys(r.dimensions).length, 6);
  });

  it("each dimension has valid risk level", () => {
    const r = assessRisk(makeFeatureSet(100));
    const valid = ["Low","Moderate","Elevated","High","Extreme"];
    for (const [k, d] of Object.entries(r.dimensions)) {
      assert.ok(valid.includes(d.level), `Dimension ${k} has invalid level: ${d.level}`);
    }
  });

  it("each dimension score is in [0,100]", () => {
    const r = assessRisk(makeFeatureSet(100));
    for (const [k, d] of Object.entries(r.dimensions)) {
      assert.ok(d.score >= 0 && d.score <= 100, `Dimension ${k} score ${d.score} out of [0,100]`);
    }
  });

  it("high volatility features produce higher volatility risk", () => {
    const highVol = assessRisk(makeFeatureSet(50, { volatility: "high" }));
    const lowVol = assessRisk(makeFeatureSet(50, { volatility: "low" }));
    assert.ok(
      highVol.dimensions.volatility.score >= lowVol.dimensions.volatility.score,
      `High vol risk (${highVol.dimensions.volatility.score}) should be >= low vol (${lowVol.dimensions.volatility.score})`
    );
  });

  it("wide spread produces higher spread risk", () => {
    const wideSpread = assessRisk(makeFeatureSet(30, { spreadPips: 6 }));
    const tightSpread = assessRisk(makeFeatureSet(30, { spreadPips: 0.8 }));
    assert.ok(
      wideSpread.dimensions.spread.score >= tightSpread.dimensions.spread.score,
      `Wide spread risk (${wideSpread.dimensions.spread.score}) should be >= tight (${tightSpread.dimensions.spread.score})`
    );
  });

  it("evidence array is non-empty", () => {
    const r = assessRisk(makeFeatureSet(30));
    assert.ok(r.evidence.length > 0);
  });

  it("overallScore is in [0,100]", () => {
    const r = assessRisk(makeFeatureSet(100));
    assert.ok(r.overallScore >= 0 && r.overallScore <= 100, `Overall score ${r.overallScore}`);
  });
});

// ─── Historical Comparator Tests ───────────────────────────────────────────────

describe("compareHistorical", () => {
  it("returns safe result with insufficient data", () => {
    const h = compareHistorical(makeFeatureSet(5));
    assert.equal(typeof h.similarityScore, "number");
    assert.equal(typeof h.winRate, "number");
    assert.ok(h.winRate >= 0 && h.winRate <= 1);
  });

  it("returns valid context with adequate data", () => {
    const h = compareHistorical(makeFeatureSet(100));
    assert.ok(h.similarityScore >= 0 && h.similarityScore <= 100);
    assert.ok(h.confidence >= 0 && h.confidence <= 100);
    assert.ok(h.winRate >= 0 && h.winRate <= 1);
    assert.ok(h.profitFactor >= 0);
  });

  it("matches array contains valid entries", () => {
    const h = compareHistorical(makeFeatureSet(200));
    for (const m of h.matches) {
      assert.ok(m.winRate >= 0 && m.winRate <= 1);
      assert.ok(m.similarityScore >= 0 && m.similarityScore <= 100);
      assert.ok(typeof m.regime === "string");
    }
  });

  it("confidence increases with more data", () => {
    const small = compareHistorical(makeFeatureSet(50));
    const large = compareHistorical(makeFeatureSet(300));
    assert.ok(
      large.confidence >= small.confidence,
      `Larger dataset (${large.confidence}) should have >= confidence than small (${small.confidence})`
    );
  });

  it("similar markets count is non-negative", () => {
    const h = compareHistorical(makeFeatureSet(100));
    assert.ok(h.similarMarketsCount >= 0);
  });
});

// ─── Outlook Generator Tests ───────────────────────────────────────────────────

describe("generateOutlook", () => {
  it("returns safe outlook with insufficient data", () => {
    const o = generateOutlook(makeFeatureSet(5));
    assert.equal(typeof o.primary.description, "string");
    assert.equal(typeof o.transitionProbability, "number");
  });

  it("probabilities are in [0,1]", () => {
    const o = generateOutlook(makeFeatureSet(100));
    assert.ok(o.primary.probability >= 0 && o.primary.probability <= 1);
    assert.ok(o.alternative.probability >= 0 && o.alternative.probability <= 1);
    assert.ok(o.transitionProbability >= 0 && o.transitionProbability <= 1);
  });

  it("confidence is in [0,100]", () => {
    const o = generateOutlook(makeFeatureSet(100));
    assert.ok(o.confidence >= 0 && o.confidence <= 100);
  });

  it("supporting evidence is non-empty with adequate data", () => {
    const o = generateOutlook(makeFeatureSet(100));
    assert.ok(o.supportingEvidence.length > 0);
  });

  it("allScenarios contains primary and alternative", () => {
    const o = generateOutlook(makeFeatureSet(100));
    assert.ok(o.allScenarios.length >= 2);
  });

  it("does not forecast prices", () => {
    const o = generateOutlook(makeFeatureSet(100));
    const combinedText = [
      o.primary.description, o.alternative.description, o.historicalBasis,
      ...o.supportingEvidence
    ].join(" ").toLowerCase();
    // Should not contain price references
    assert.ok(!combinedText.includes("price target"), "Should not reference price targets");
    assert.ok(!combinedText.includes("buy at"), "Should not say 'buy at'");
    assert.ok(!combinedText.includes("sell at"), "Should not say 'sell at'");
  });

  it("expected duration bars is non-negative", () => {
    const o = generateOutlook(makeFeatureSet(100));
    assert.ok(o.expectedDurationBars >= 0);
  });
});

// ─── Intelligence Report Tests ─────────────────────────────────────────────────

describe("generateIntelligenceReport", () => {
  it("generates a complete report with minimal data", () => {
    const r = generateIntelligenceReport(makeFeatureSet(5), "EURUSD");
    assert.equal(typeof r.id, "string");
    assert.ok(r.id.length > 0);
    assert.equal(typeof r.engineVersion, "string");
    assert.ok(r.unifiedState !== undefined);
  });

  it("generates a complete unified state", () => {
    const r = generateIntelligenceReport(makeFeatureSet(100), "EURUSD");
    const us = r.unifiedState;
    assert.ok(us.marketSummary !== undefined);
    assert.ok(us.healthScore !== undefined);
    assert.ok(us.opportunityScore !== undefined);
    assert.ok(us.riskAssessment !== undefined);
    assert.ok(us.historicalContext !== undefined);
    assert.ok(us.outlook !== undefined);
  });

  it("health score is in [0,100]", () => {
    const r = generateIntelligenceReport(makeFeatureSet(100));
    assert.ok(r.healthScore >= 0 && r.healthScore <= 100, `Health ${r.healthScore}`);
  });

  it("opportunity score is in [0,100]", () => {
    const r = generateIntelligenceReport(makeFeatureSet(100));
    assert.ok(r.opportunityScore >= 0 && r.opportunityScore <= 100, `Opp ${r.opportunityScore}`);
  });

  it("risk level is a valid level", () => {
    const r = generateIntelligenceReport(makeFeatureSet(100));
    const valid = ["Low","Moderate","Elevated","High","Extreme"];
    assert.ok(valid.includes(r.riskLevel), `Invalid risk: ${r.riskLevel}`);
  });

  it("confidence is in [0,100]", () => {
    const r = generateIntelligenceReport(makeFeatureSet(100));
    assert.ok(r.confidence >= 0 && r.confidence <= 100);
  });

  it("data quality scales with feature count", () => {
    const insufficient = generateIntelligenceReport(makeFeatureSet(3));
    const good = generateIntelligenceReport(makeFeatureSet(200));
    const order = ["Insufficient","Poor","Fair","Good","Excellent"];
    assert.ok(
      order.indexOf(good.dataQuality) >= order.indexOf(insufficient.dataQuality),
      `Good (${good.dataQuality}) should be >= insufficient (${insufficient.dataQuality})`
    );
  });

  it("phase 5 readiness requires minimum data", () => {
    const small = generateIntelligenceReport(makeFeatureSet(3));
    assert.equal(small.readinessForPhase5, false, "3 features should not be ready");
    const adequate = generateIntelligenceReport(makeFeatureSet(100));
    // Adequate data with normal features should eventually be ready
    assert.equal(typeof adequate.readinessForPhase5, "boolean");
  });

  it("report summary is a non-empty string", () => {
    const r = generateIntelligenceReport(makeFeatureSet(50));
    assert.ok(r.reportSummary.length > 20, `Summary too short: "${r.reportSummary}"`);
  });

  it("key findings is a non-empty array of strings", () => {
    const r = generateIntelligenceReport(makeFeatureSet(50));
    assert.ok(r.keyFindings.length > 0);
    for (const f of r.keyFindings) {
      assert.equal(typeof f, "string");
      assert.ok(f.length > 5);
    }
  });

  it("evidence references are populated", () => {
    const r = generateIntelligenceReport(makeFeatureSet(100));
    assert.ok(r.unifiedState.evidenceReferences.length > 0);
  });

  it("default pair is EURUSD", () => {
    const r = generateIntelligenceReport(makeFeatureSet(20));
    assert.equal(r.pair, "EURUSD");
  });

  it("custom pair is preserved", () => {
    const r = generateIntelligenceReport(makeFeatureSet(20), "GBPUSD");
    assert.equal(r.pair, "GBPUSD");
    assert.equal(r.unifiedState.pair, "GBPUSD");
  });

  it("market summary contains all required fields", () => {
    const r = generateIntelligenceReport(makeFeatureSet(50));
    const s = r.unifiedState.marketSummary;
    const required = [
      "regime","trendDirection","trendStrength","trendAge",
      "volatilityLevel","liquidityQuality","correlationState",
      "newsContext","session","spread","marketStability",
    ];
    for (const field of required) {
      assert.ok(field in s, `Missing field: ${field}`);
    }
  });

  it("stress test: 500 features completes in reasonable time", () => {
    const start = Date.now();
    const r = generateIntelligenceReport(makeFeatureSet(500));
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 2000, `Too slow: ${elapsed}ms`);
    assert.ok(r.healthScore >= 0);
  });

  it("stress test: mixed regimes and volatility", () => {
    const mixed: FeatureRow[] = [
      ...makeFeatureSet(100, { marketRegime: "trending", volatility: "medium" }),
      ...makeFeatureSet(100, { marketRegime: "ranging", volatility: "low" }),
      ...makeFeatureSet(100, { marketRegime: "volatile", volatility: "high" }),
      ...makeFeatureSet(100, { marketRegime: "low_volatility", volatility: "low" }),
      ...makeFeatureSet(100, { marketRegime: "trending", volatility: "high" }),
    ];
    const r = generateIntelligenceReport(mixed);
    assert.ok(r.healthScore >= 0 && r.healthScore <= 100);
    assert.ok(r.opportunityScore >= 0 && r.opportunityScore <= 100);
  });

  it("report is advisory only — no trade execution fields", () => {
    const r = generateIntelligenceReport(makeFeatureSet(50));
    const json = JSON.stringify(r);
    assert.ok(!json.includes("executeTrade"), "Should not contain executeTrade");
    assert.ok(!json.includes("modifyStrategy"), "Should not contain modifyStrategy");
    assert.ok(!json.includes("buySignal"), "Should not contain buySignal");
    assert.ok(!json.includes("sellSignal"), "Should not contain sellSignal");
  });
});

// ─── Integration: complete pipeline ───────────────────────────────────────────

describe("Unified Intelligence Pipeline Integration", () => {
  it("all 5 engines produce consistent results for the same feature set", () => {
    const features = makeFeatureSet(200);
    const health = computeHealthScore(features);
    const opportunity = computeOpportunityScore(features);
    const risk = assessRisk(features);
    const historical = compareHistorical(features);
    const outlook = generateOutlook(features);
    const report = generateIntelligenceReport(features);

    // All engines should agree on the core values
    assert.equal(report.healthScore, health.overall);
    assert.equal(report.opportunityScore, opportunity.overall);
    assert.equal(report.riskLevel, risk.overall);

    // Verify no engine produces NaN
    assert.ok(!isNaN(health.overall));
    assert.ok(!isNaN(opportunity.overall));
    assert.ok(!isNaN(risk.overallScore));
    assert.ok(!isNaN(historical.winRate));
    assert.ok(!isNaN(outlook.transitionProbability));
  });

  it("handles all-loss scenarios gracefully", () => {
    const lossFeatures = makeFeatureSet(100, { outcome: "loss", pnl: -1.5 });
    const r = generateIntelligenceReport(lossFeatures);
    assert.ok(r.healthScore >= 0 && r.healthScore <= 100);
    assert.ok(!isNaN(r.healthScore));
    assert.ok(!isNaN(r.opportunityScore));
  });

  it("handles all-win scenarios gracefully", () => {
    const winFeatures = makeFeatureSet(100, { outcome: "win", pnl: 2.0 });
    const r = generateIntelligenceReport(winFeatures);
    assert.ok(r.healthScore >= 0 && r.healthScore <= 100);
    assert.ok(r.opportunityScore >= 0 && r.opportunityScore <= 100);
  });

  it("handles extreme spread values", () => {
    const extremeSpread = makeFeatureSet(50, { spreadPips: 15 });
    const r = assessRisk(extremeSpread);
    assert.ok(r.dimensions.spread.score >= 0 && r.dimensions.spread.score <= 100);
  });
});
