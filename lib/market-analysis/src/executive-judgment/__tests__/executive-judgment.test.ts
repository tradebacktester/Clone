// ─── Executive Judgment & Decision Simulation Engine Tests ────────────────────
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  simulateAllDecisions,
  ALL_DECISION_TYPES,
  analyzeOpportunityCost,
  rankDecisions,
  buildJudgmentExplainability,
  buildCounterfactualAnalysis,
  runExecutiveJudgment,
  DECISION_TYPE_LABELS,
} from "../index.js";
import type { DecisionSimulation, DecisionRanking } from "../index.js";

// ─── Shared helpers ───────────────────────────────────────────────────────────

function normalCtx() {
  return {
    executiveScore: 72,
    strategyScore:  68,
    riskScore:      32,
    marketScore:    65,
    memoryWinRate:  58,
    identityScore:  70,
    crisisStatus:   "none",
    survivalMode:   false,
  };
}

function highRiskCtx() {
  return {
    executiveScore: 40,
    strategyScore:  38,
    riskScore:      82,
    marketScore:    30,
    memoryWinRate:  42,
    identityScore:  55,
    crisisStatus:   "critical",
    survivalMode:   false,
  };
}

function emergencyCtx() {
  return {
    executiveScore: 20,
    strategyScore:  25,
    riskScore:      90,
    marketScore:    20,
    memoryWinRate:  40,
    identityScore:  50,
    crisisStatus:   "emergency",
    survivalMode:   true,
  };
}

// ─── Decision Simulator ───────────────────────────────────────────────────────

describe("decision simulator", () => {
  it("returns all 7 candidate decisions", () => {
    const sims = simulateAllDecisions(normalCtx());
    assert.equal(sims.length, 7);
    const types = sims.map(s => s.decisionType);
    for (const d of ALL_DECISION_TYPES) {
      assert.ok(types.includes(d), `Missing decision type: ${d}`);
    }
  });

  it("every simulation has required numeric fields", () => {
    const sims = simulateAllDecisions(normalCtx());
    for (const s of sims) {
      assert.ok(isFinite(s.expectedProbability), `expectedProbability NaN for ${s.decisionType}`);
      assert.ok(isFinite(s.expectedRisk),        `expectedRisk NaN for ${s.decisionType}`);
      assert.ok(isFinite(s.historicalWinRate),   `historicalWinRate NaN for ${s.decisionType}`);
      assert.ok(isFinite(s.expectedRR),          `expectedRR NaN for ${s.decisionType}`);
      assert.ok(isFinite(s.confidence),          `confidence NaN for ${s.decisionType}`);
      assert.ok(isFinite(s.expectedValue),       `expectedValue NaN for ${s.decisionType}`);
    }
  });

  it("all probabilities are 0-100", () => {
    const sims = simulateAllDecisions(normalCtx());
    for (const s of sims) {
      assert.ok(s.expectedProbability >= 0 && s.expectedProbability <= 100,
        `${s.decisionType} probability out of range: ${s.expectedProbability}`);
    }
  });

  it("all confidence values are 0-100", () => {
    const sims = simulateAllDecisions(normalCtx());
    for (const s of sims) {
      assert.ok(s.confidence >= 0 && s.confidence <= 100,
        `${s.decisionType} confidence out of range: ${s.confidence}`);
    }
  });

  it("emergency_pause has low expected risk", () => {
    const sims = simulateAllDecisions(normalCtx());
    const ep = sims.find(s => s.decisionType === "emergency_pause")!;
    assert.ok(ep.expectedRisk < 15, `emergency_pause risk too high: ${ep.expectedRisk}`);
  });

  it("skip_trade has near-zero capital at risk", () => {
    const sims = simulateAllDecisions(normalCtx());
    const skip = sims.find(s => s.decisionType === "skip_trade")!;
    assert.ok(skip.capitalAtRisk < 10);
  });

  it("execute_trade has isTradeAction = true", () => {
    const sims = simulateAllDecisions(normalCtx());
    const et = sims.find(s => s.decisionType === "execute_trade")!;
    assert.equal(et.isTradeAction, true);
  });

  it("non-trade actions have isTradeAction = false", () => {
    const sims = simulateAllDecisions(normalCtx());
    const nonTrade = ["wait_one_candle", "wait_confirmation", "observation_mode", "skip_trade", "emergency_pause"];
    for (const d of nonTrade) {
      const s = sims.find(x => x.decisionType === d)!;
      assert.equal(s.isTradeAction, false, `${d} should have isTradeAction=false`);
    }
  });

  it("high risk context elevates execute_trade risk", () => {
    const normal = simulateAllDecisions(normalCtx());
    const highRisk = simulateAllDecisions(highRiskCtx());
    const normEt = normal.find(s => s.decisionType === "execute_trade")!;
    const hrEt   = highRisk.find(s => s.decisionType === "execute_trade")!;
    assert.ok(hrEt.expectedRisk > normEt.expectedRisk,
      `High risk context should increase execute_trade risk`);
  });

  it("emergency context elevates emergency_pause confidence", () => {
    const normal    = simulateAllDecisions(normalCtx());
    const emergency = simulateAllDecisions(emergencyCtx());
    const normEp  = normal.find(s => s.decisionType === "emergency_pause")!;
    const emEp    = emergency.find(s => s.decisionType === "emergency_pause")!;
    assert.ok(emEp.confidence >= normEp.confidence,
      `Emergency context should maintain/increase emergency_pause confidence`);
  });

  it("each simulation has similarCases array with items", () => {
    const sims = simulateAllDecisions(normalCtx());
    for (const s of sims) {
      assert.ok(Array.isArray(s.similarCases) && s.similarCases.length > 0,
        `${s.decisionType} should have similarCases`);
    }
  });

  it("DECISION_TYPE_LABELS covers all 7 types", () => {
    for (const d of ALL_DECISION_TYPES) {
      assert.ok(DECISION_TYPE_LABELS[d], `Missing label for ${d}`);
    }
  });
});

// ─── Opportunity Cost ─────────────────────────────────────────────────────────

describe("opportunity cost analysis", () => {
  it("returns valid analysisId", () => {
    const sims = simulateAllDecisions(normalCtx());
    const oc   = analyzeOpportunityCost(sims, 72);
    assert.ok(oc.analysisId.startsWith("oca_"));
  });

  it("opportunityCostScore is -100 to 100", () => {
    const sims = simulateAllDecisions(normalCtx());
    const oc   = analyzeOpportunityCost(sims, 72);
    assert.ok(oc.opportunityCostScore >= -100 && oc.opportunityCostScore <= 100,
      `OC score out of range: ${oc.opportunityCostScore}`);
  });

  it("recommendation is one of valid values", () => {
    const validRecs = ["trade", "skip", "wait", "reduce"];
    const sims = simulateAllDecisions(normalCtx());
    const oc   = analyzeOpportunityCost(sims, 72);
    assert.ok(validRecs.includes(oc.recommendation), `Invalid recommendation: ${oc.recommendation}`);
  });

  it("ifTrade and ifSkip have valid structure", () => {
    const sims = simulateAllDecisions(normalCtx());
    const oc   = analyzeOpportunityCost(sims, 72);
    assert.ok(isFinite(oc.ifTrade.expectedBenefit));
    assert.ok(isFinite(oc.ifTrade.netExpectedValue));
    assert.ok(isFinite(oc.ifSkip.expectedBenefit));
    assert.ok(isFinite(oc.ifSkip.netExpectedValue));
  });

  it("high risk context recommends skip or wait", () => {
    const sims = simulateAllDecisions(highRiskCtx());
    const oc   = analyzeOpportunityCost(sims, 40);
    assert.ok(
      ["skip", "wait", "reduce"].includes(oc.recommendation),
      `Expected conservative recommendation for high risk, got: ${oc.recommendation}`
    );
  });

  it("high executive score context recommends trade", () => {
    const ctx = { ...normalCtx(), executiveScore: 88, strategyScore: 85, riskScore: 22 };
    const sims = simulateAllDecisions(ctx);
    const oc   = analyzeOpportunityCost(sims, 88);
    assert.equal(oc.recommendation, "trade",
      `High executive score should recommend trade, got: ${oc.recommendation}`);
  });

  it("has reasoning string", () => {
    const sims = simulateAllDecisions(normalCtx());
    const oc   = analyzeOpportunityCost(sims, 72);
    assert.ok(typeof oc.reasoning === "string" && oc.reasoning.length > 20);
  });

  it("riskAvoidedBySkipping is 0-100", () => {
    const sims = simulateAllDecisions(normalCtx());
    const oc   = analyzeOpportunityCost(sims, 72);
    assert.ok(oc.riskAvoidedBySkipping >= 0 && oc.riskAvoidedBySkipping <= 100);
  });
});

// ─── Ranking Engine ───────────────────────────────────────────────────────────

describe("ranking engine", () => {
  it("returns 7 ranked decisions", () => {
    const sims    = simulateAllDecisions(normalCtx());
    const rankings = rankDecisions(sims);
    assert.equal(rankings.length, 7);
  });

  it("ranks are 1-7 with no duplicates", () => {
    const sims     = simulateAllDecisions(normalCtx());
    const rankings = rankDecisions(sims);
    const ranks    = rankings.map(r => r.rank).sort((a, b) => a - b);
    assert.deepEqual(ranks, [1, 2, 3, 4, 5, 6, 7]);
  });

  it("rank 1 has highest overallScore", () => {
    const sims     = simulateAllDecisions(normalCtx());
    const rankings = rankDecisions(sims);
    const top      = rankings.find(r => r.rank === 1)!;
    for (const r of rankings) {
      assert.ok(top.overallScore >= r.overallScore,
        `Rank 1 score ${top.overallScore} should be >= rank ${r.rank} score ${r.overallScore}`);
    }
  });

  it("overallScore values are 0-100", () => {
    const sims     = simulateAllDecisions(normalCtx());
    const rankings = rankDecisions(sims);
    for (const r of rankings) {
      assert.ok(r.overallScore >= 0 && r.overallScore <= 100,
        `Rank ${r.rank} score out of range: ${r.overallScore}`);
    }
  });

  it("each ranking has a non-empty rankingReason", () => {
    const sims     = simulateAllDecisions(normalCtx());
    const rankings = rankDecisions(sims);
    for (const r of rankings) {
      assert.ok(r.rankingReason.length > 10, `Empty rankingReason for rank ${r.rank}`);
    }
  });

  it("emergency context ranks emergency_pause highly", () => {
    const sims     = simulateAllDecisions(emergencyCtx());
    const rankings = rankDecisions(sims);
    const ep       = rankings.find(r => r.decisionType === "emergency_pause")!;
    assert.ok(ep.rank <= 3, `emergency_pause should rank in top 3 during emergency, got rank ${ep.rank}`);
  });

  it("high executive score ranks execute_trade in top 3", () => {
    const ctx = { ...normalCtx(), executiveScore: 88, strategyScore: 85, riskScore: 20 };
    const sims     = simulateAllDecisions(ctx);
    const rankings = rankDecisions(sims);
    const et       = rankings.find(r => r.decisionType === "execute_trade")!;
    assert.ok(et.rank <= 3, `execute_trade should rank in top 3 with strong scores, got rank ${et.rank}`);
  });

  it("statisticalReliability correlates with sampleSize", () => {
    const sims     = simulateAllDecisions(normalCtx());
    const rankings = rankDecisions(sims);
    // Skip trade has highest sample size — should have high reliability
    const skip = rankings.find(r => r.decisionType === "skip_trade")!;
    assert.ok(skip.statisticalReliability >= 60, `skip_trade should have high reliability`);
  });
});

// ─── Judgment Explainability ──────────────────────────────────────────────────

describe("judgment explainability", () => {
  it("returns all required fields", () => {
    const sims     = simulateAllDecisions(normalCtx());
    const oc       = analyzeOpportunityCost(sims, 72);
    const rankings = rankDecisions(sims);
    const expl     = buildJudgmentExplainability({
      bestRanking:    rankings[0],
      allRankings:    rankings,
      simulations:    sims,
      opportunityCost: oc,
      executiveScore: 72,
      riskScore:      32,
    });

    assert.ok(expl.whyBestRankedHighest.length > 20);
    assert.ok(Array.isArray(expl.whyAlternativesRejected));
    assert.ok(Array.isArray(expl.mostInfluentialEvidence));
    assert.ok(Array.isArray(expl.historicalReferences));
    assert.ok(isFinite(expl.confidenceInterval.lower));
    assert.ok(isFinite(expl.confidenceInterval.upper));
    assert.ok(expl.confidenceInterval.lower <= expl.confidenceInterval.upper);
    assert.ok(expl.statisticalReliabilityNote.length > 10);
    assert.ok(Array.isArray(expl.keyRisks) && expl.keyRisks.length > 0);
  });

  it("whyAlternativesRejected has 6 entries (all non-best)", () => {
    const sims     = simulateAllDecisions(normalCtx());
    const oc       = analyzeOpportunityCost(sims, 72);
    const rankings = rankDecisions(sims);
    const expl     = buildJudgmentExplainability({
      bestRanking:    rankings[0],
      allRankings:    rankings,
      simulations:    sims,
      opportunityCost: oc,
      executiveScore: 72,
      riskScore:      32,
    });
    assert.equal(expl.whyAlternativesRejected.length, 6);
  });

  it("confidence interval lower <= upper and both 0-100", () => {
    const sims     = simulateAllDecisions(normalCtx());
    const oc       = analyzeOpportunityCost(sims, 72);
    const rankings = rankDecisions(sims);
    const expl     = buildJudgmentExplainability({
      bestRanking:    rankings[0],
      allRankings:    rankings,
      simulations:    sims,
      opportunityCost: oc,
      executiveScore: 72,
      riskScore:      32,
    });
    assert.ok(expl.confidenceInterval.lower >= 0);
    assert.ok(expl.confidenceInterval.upper <= 100);
    assert.ok(expl.confidenceInterval.lower <= expl.confidenceInterval.upper);
  });
});

// ─── Counterfactual Analysis ──────────────────────────────────────────────────

describe("counterfactual analysis", () => {
  it("generates alternatives for all non-actual decisions", () => {
    const sims = simulateAllDecisions(normalCtx());
    const cf   = buildCounterfactualAnalysis({
      judgmentId:     "test_j1",
      tradeId:        "trade_001",
      actualDecision: "execute_trade",
      actualOutcome:  "win",
      actualPnL:      1.5,
      actualRR:       2.0,
      simulations:    sims,
    });
    assert.equal(cf.alternatives.length, 6); // 7 - 1
  });

  it("analysisId starts with cfa_", () => {
    const sims = simulateAllDecisions(normalCtx());
    const cf   = buildCounterfactualAnalysis({
      judgmentId:     "test_j1",
      tradeId:        null,
      actualDecision: "execute_trade",
      actualOutcome:  "win",
      actualPnL:      1.5,
      actualRR:       2.0,
      simulations:    sims,
    });
    assert.ok(cf.analysisId.startsWith("cfa_"));
  });

  it("skip_trade counterfactual shows avoided_loss", () => {
    const sims = simulateAllDecisions(normalCtx());
    const cf   = buildCounterfactualAnalysis({
      judgmentId:     "test_j2",
      tradeId:        null,
      actualDecision: "execute_trade",
      actualOutcome:  "loss",
      actualPnL:      -1.0,
      actualRR:       1.0,
      simulations:    sims,
    });
    const skipAlt = cf.alternatives.find(a => a.decisionType === "skip_trade")!;
    assert.equal(skipAlt.hypotheticalOutcome, "avoided_loss");
  });

  it("reduce_position has roughly half the PnL of execute_trade", () => {
    const sims = simulateAllDecisions(normalCtx());
    const cf   = buildCounterfactualAnalysis({
      judgmentId:     "test_j3",
      tradeId:        null,
      actualDecision: "execute_trade",
      actualOutcome:  "win",
      actualPnL:      2.0,
      actualRR:       2.0,
      simulations:    sims,
    });
    const reduceAlt = cf.alternatives.find(a => a.decisionType === "reduce_position")!;
    assert.ok(reduceAlt.hypotheticalPnL > 0 && reduceAlt.hypotheticalPnL < 2.0,
      `reduce_position PnL should be positive but less than execute: ${reduceAlt.hypotheticalPnL}`);
  });

  it("decisionQualityScore is 0-100", () => {
    const sims = simulateAllDecisions(normalCtx());
    const cf   = buildCounterfactualAnalysis({
      judgmentId:     "test_j4",
      tradeId:        null,
      actualDecision: "execute_trade",
      actualOutcome:  "win",
      actualPnL:      1.5,
      actualRR:       2.0,
      simulations:    sims,
    });
    assert.ok(cf.decisionQualityScore >= 0 && cf.decisionQualityScore <= 100);
  });

  it("learningInsight is a non-empty string", () => {
    const sims = simulateAllDecisions(normalCtx());
    const cf   = buildCounterfactualAnalysis({
      judgmentId:     "test_j5",
      tradeId:        null,
      actualDecision: "wait_one_candle",
      actualOutcome:  "neutral",
      actualPnL:      0,
      actualRR:       0,
      simulations:    sims,
    });
    assert.ok(cf.learningInsight.length > 20);
  });
});

// ─── runExecutiveJudgment (full orchestrator) ─────────────────────────────────

describe("runExecutiveJudgment", () => {
  it("returns valid ExecutiveJudgment object", async () => {
    const result = await runExecutiveJudgment({ pair: "EURUSD", timeframe: "15m" });
    assert.ok(result.judgmentId.startsWith("ej_"));
    assert.equal(result.isAdvisoryOnly, true);
    assert.ok(typeof result.finalDecision === "string");
    assert.ok(typeof result.finalDecisionLabel === "string");
  });

  it("simulations has 7 entries", async () => {
    const result = await runExecutiveJudgment({});
    assert.equal(result.simulations.length, 7);
  });

  it("rankings has 7 entries", async () => {
    const result = await runExecutiveJudgment({});
    assert.equal(result.rankings.length, 7);
  });

  it("best, second, third are distinct decisions", async () => {
    const result = await runExecutiveJudgment({});
    assert.notEqual(result.bestDecision.decisionType, result.secondBestDecision.decisionType);
    assert.notEqual(result.bestDecision.decisionType, result.thirdBestDecision.decisionType);
    assert.notEqual(result.secondBestDecision.decisionType, result.thirdBestDecision.decisionType);
  });

  it("finalDecision matches bestDecision under normal conditions", async () => {
    const result = await runExecutiveJudgment({
      strategyResult: { executiveScore: 70, strategyStrength: 65 },
      erbResult:      { overallRiskScore: 30, crisisStatus: "none", survivalModeActive: false },
    });
    assert.equal(result.finalDecision, result.bestDecision.decisionType);
  });

  it("emergency override: survivalMode forces emergency_pause when trade selected", async () => {
    const result = await runExecutiveJudgment({
      strategyResult: { executiveScore: 85, strategyStrength: 80 },
      erbResult:      { overallRiskScore: 95, crisisStatus: "emergency", survivalModeActive: true },
    });
    // Under emergency + survival mode, execute_trade should be overridden
    assert.notEqual(result.finalDecision, "execute_trade",
      "Emergency mode should prevent execute_trade from being final decision");
  });

  it("durationMs is a positive integer", async () => {
    const result = await runExecutiveJudgment({});
    assert.ok(Number.isInteger(result.durationMs) && result.durationMs >= 0);
  });

  it("opportunityCost has valid structure", async () => {
    const result = await runExecutiveJudgment({});
    assert.ok(result.opportunityCost.analysisId.startsWith("oca_"));
    assert.ok(isFinite(result.opportunityCost.opportunityCostScore));
  });

  it("explainability has all required fields", async () => {
    const result = await runExecutiveJudgment({});
    const e = result.explainability;
    assert.ok(e.whyBestRankedHighest.length > 20);
    assert.ok(e.whyAlternativesRejected.length === 6);
    assert.ok(e.mostInfluentialEvidence.length >= 3);
    assert.ok(e.keyRisks.length >= 1);
  });

  it("counterfactual is null on initial judgment", async () => {
    const result = await runExecutiveJudgment({});
    assert.equal(result.counterfactual, null);
  });

  it("engineVersion is set", async () => {
    const result = await runExecutiveJudgment({});
    assert.ok(typeof result.engineVersion === "string" && result.engineVersion.length > 0);
  });

  it("intelligenceSnapshot has all fields", async () => {
    const result = await runExecutiveJudgment({});
    const s = result.intelligenceSnapshot;
    assert.ok(isFinite(s.executiveScore));
    assert.ok(isFinite(s.strategyScore));
    assert.ok(isFinite(s.riskScore));
    assert.ok(isFinite(s.marketScore));
    assert.ok(isFinite(s.memoryWinRate));
    assert.ok(typeof s.crisisStatus === "string");
    assert.ok(typeof s.survivalMode === "boolean");
  });

  it("20 sequential runs without error", async () => {
    for (let i = 0; i < 20; i++) {
      const r = await runExecutiveJudgment({ pair: "GBPUSD" });
      assert.ok(r.judgmentId);
      assert.equal(r.isAdvisoryOnly, true);
    }
  });

  it("different pairs produce valid results", async () => {
    const pairs = ["EURUSD", "GBPUSD", "USDJPY"];
    for (const pair of pairs) {
      const r = await runExecutiveJudgment({ pair });
      assert.equal(r.pair, pair);
    }
  });
});
