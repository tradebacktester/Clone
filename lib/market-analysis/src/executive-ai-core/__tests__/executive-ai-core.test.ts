// ─── Executive AI Core Tests ──────────────────────────────────────────────────
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  runExecutiveAI,
  buildWeights,
  computeDimensionScores,
  scoreToDecision,
  applyVetoes,
  buildContributions,
  buildStrategyIntelligence,
  buildMarketIntelligence,
  buildRiskIntelligence,
  buildMemoryIntelligence,
  buildLearningIntelligence,
  buildIdentityIntelligence,
  buildResearchIntelligence,
  resolveAllConflicts as eaiResolveAllConflicts,
  eaiComputeConfidence,
  eaiBuildExplainability,
  DEFAULT_EAI_WEIGHTS,
  DECISION_LABELS,
  EAI_ENGINE_VERSION,
} from "../index.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDefaultIntel() {
  return {
    pair: "EURUSD", timeframe: "15m",
    strategy: buildStrategyIntelligence(null),
    market:   buildMarketIntelligence(null),
    risk:     buildRiskIntelligence(null),
    memory:   buildMemoryIntelligence(null),
    learning: buildLearningIntelligence(null),
    identity: buildIdentityIntelligence(null),
    research: buildResearchIntelligence(null),
  };
}

function makeHighRisk(): Parameters<typeof buildRiskIntelligence>[0] {
  return {
    overallRiskScore: 90, survivalScore: 20, capitalHealthScore: 20,
    portfolioStabilityScore: 20, brokerReliabilityScore: 50, infrastructureScore: 60,
    crisisStatus: "emergency", crisisSeverity: "extreme",
    recommendation: "emergency_stop", survivalModeActive: true,
  };
}

function makeSafeRisk(): Parameters<typeof buildRiskIntelligence>[0] {
  return {
    overallRiskScore: 15, survivalScore: 90, capitalHealthScore: 95,
    portfolioStabilityScore: 88, brokerReliabilityScore: 92, infrastructureScore: 95,
    crisisStatus: "none", crisisSeverity: "none",
    recommendation: "trade_normally", survivalModeActive: false,
  };
}

function makeHighStrategy(): Parameters<typeof buildStrategyIntelligence>[0] {
  return {
    executiveScore: 92, rulePassRate: 88, strategyStrength: 90, ruleQualityScore: 88,
    overallQualityScore: 90, identitySimilarity: 85, marketHealth: 80, researchConfidence: 75,
    recommendation: "high_confidence_trade", pair: "EURUSD", session: "london", regime: "trending",
  };
}

// ─── buildWeights ─────────────────────────────────────────────────────────────

describe("buildWeights", () => {
  it("defaults sum to 1.0", () => {
    const w = buildWeights();
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1.0) < 0.001, `weights sum ${total} ≠ 1.0`);
  });

  it("overrides are clamped and renormalised", () => {
    const w = buildWeights({ strategy: 5, risk: 5 });
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1.0) < 0.001);
  });

  it("zero weights return defaults", () => {
    const w = buildWeights({ strategy: 0, risk: 0, market: 0, memory: 0, learning: 0, identity: 0, research: 0 });
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1.0) < 0.001);
  });

  it("each weight is between 0 and 1", () => {
    const w = buildWeights({ strategy: 0.5 });
    for (const [k, v] of Object.entries(w)) {
      assert.ok(v >= 0 && v <= 1, `weight ${k}=${v} out of range`);
    }
  });
});

// ─── intelligence aggregators ─────────────────────────────────────────────────

describe("intelligence aggregators", () => {
  it("buildStrategyIntelligence handles null input", () => {
    const s = buildStrategyIntelligence(null);
    assert.equal(typeof s.executiveScore, "number");
    assert.ok(s.executiveScore >= 0 && s.executiveScore <= 100);
  });

  it("buildStrategyIntelligence maps provided values", () => {
    const s = buildStrategyIntelligence(makeHighStrategy());
    assert.equal(s.executiveScore, 92);
    assert.equal(s.recommendation, "high_confidence_trade");
  });

  it("buildMarketIntelligence handles null", () => {
    const m = buildMarketIntelligence(null);
    assert.ok(m.healthScore >= 0 && m.healthScore <= 100);
    assert.equal(m.pair, "EURUSD");
  });

  it("buildRiskIntelligence handles null (safe defaults)", () => {
    const r = buildRiskIntelligence(null);
    assert.ok(r.overallRiskScore < 50, "default risk should be moderate");
    assert.equal(r.survivalModeActive, false);
  });

  it("buildRiskIntelligence maps high risk scenario", () => {
    const r = buildRiskIntelligence(makeHighRisk());
    assert.equal(r.overallRiskScore, 90);
    assert.equal(r.crisisStatus, "emergency");
    assert.equal(r.survivalModeActive, true);
  });

  it("buildMemoryIntelligence handles null", () => {
    const m = buildMemoryIntelligence(null);
    assert.equal(typeof m.historicalWinRate, "number");
    assert.ok(m.historicalWinRate >= 0);
  });

  it("buildLearningIntelligence handles null", () => {
    const l = buildLearningIntelligence(null);
    assert.ok(l.overallConfidence >= 0 && l.overallConfidence <= 100);
  });

  it("buildIdentityIntelligence handles null", () => {
    const i = buildIdentityIntelligence(null);
    assert.ok(i.identitySimilarityScore >= 0);
  });

  it("buildResearchIntelligence is always advisory", () => {
    const r = buildResearchIntelligence(null);
    assert.equal(r.isAdvisoryOnly, true);
  });
});

// ─── computeDimensionScores ───────────────────────────────────────────────────

describe("computeDimensionScores", () => {
  it("all scores within 0-100", () => {
    const intel = makeDefaultIntel();
    const dims = computeDimensionScores(
      intel.strategy, intel.market, intel.risk, intel.memory, intel.learning, intel.identity, intel.research
    );
    for (const [k, v] of Object.entries(dims)) {
      assert.ok(v >= 0 && v <= 100, `${k}=${v} out of range`);
    }
  });

  it("high strategy input → high strategy score", () => {
    const intel = makeDefaultIntel();
    intel.strategy = buildStrategyIntelligence(makeHighStrategy());
    const dims = computeDimensionScores(
      intel.strategy, intel.market, intel.risk, intel.memory, intel.learning, intel.identity, intel.research
    );
    assert.ok(dims.strategy >= 70, `strategy score ${dims.strategy} < 70`);
  });

  it("high risk input → low risk safety score", () => {
    const intel = makeDefaultIntel();
    intel.risk = buildRiskIntelligence(makeHighRisk());
    const dims = computeDimensionScores(
      intel.strategy, intel.market, intel.risk, intel.memory, intel.learning, intel.identity, intel.research
    );
    assert.ok(dims.risk < 30, `risk safety score ${dims.risk} should be low when risk is high`);
  });

  it("safe risk input → high risk safety score", () => {
    const intel = makeDefaultIntel();
    intel.risk = buildRiskIntelligence(makeSafeRisk());
    const dims = computeDimensionScores(
      intel.strategy, intel.market, intel.risk, intel.memory, intel.learning, intel.identity, intel.research
    );
    assert.ok(dims.risk >= 70, `risk safety score ${dims.risk} < 70 for safe conditions`);
  });
});

// ─── scoreToDecision ──────────────────────────────────────────────────────────

describe("scoreToDecision", () => {
  it("score 85 → trade", () => assert.equal(scoreToDecision(85), "trade"));
  it("score 70 → wait",  () => assert.equal(scoreToDecision(70), "wait"));
  it("score 50 → observe", () => assert.equal(scoreToDecision(50), "observe"));
  it("score 35 → reduce_risk", () => assert.equal(scoreToDecision(35), "reduce_risk"));
  it("score 20 → pause_trading", () => assert.equal(scoreToDecision(20), "pause_trading"));
  it("score 5  → emergency_halt", () => assert.equal(scoreToDecision(5), "emergency_halt"));
  it("score 80 → trade (exact threshold)", () => assert.equal(scoreToDecision(80), "trade"));
  it("score 79 → wait (below trade)", () => assert.equal(scoreToDecision(79), "wait"));
});

// ─── applyVetoes ─────────────────────────────────────────────────────────────

describe("applyVetoes", () => {
  it("no veto for safe conditions", () => {
    const risk = buildRiskIntelligence(makeSafeRisk());
    const result = applyVetoes(80, risk, []);
    assert.equal(result.vetoed, false);
    assert.equal(result.vetoReason, null);
  });

  it("emergency crisis → hard veto (score → 5)", () => {
    const risk = buildRiskIntelligence(makeHighRisk());
    const result = applyVetoes(90, risk, []);
    assert.equal(result.vetoed, true);
    assert.ok(result.adjustedScore <= 10);
  });

  it("emergency_stop recommendation → veto", () => {
    const risk = buildRiskIntelligence({ ...makeSafeRisk(), recommendation: "emergency_stop", crisisStatus: "none", survivalModeActive: false });
    const result = applyVetoes(85, risk, []);
    assert.equal(result.vetoed, true);
    assert.ok(result.adjustedScore <= 10);
  });

  it("survival_mode → veto at moderate score", () => {
    const risk = buildRiskIntelligence({ ...makeSafeRisk(), recommendation: "survival_mode", crisisStatus: "critical", survivalModeActive: false });
    const result = applyVetoes(85, risk, []);
    assert.equal(result.vetoed, true);
    assert.ok(result.adjustedScore <= 25);
  });

  it("very high ERB risk → caps composite", () => {
    const risk = buildRiskIntelligence({ ...makeSafeRisk(), overallRiskScore: 80, recommendation: "trade_normally", crisisStatus: "none", survivalModeActive: false });
    const result = applyVetoes(90, risk, []);
    assert.ok(result.adjustedScore < 90, "high ERB risk should cap composite");
  });
});

// ─── conflict resolution ──────────────────────────────────────────────────────

describe("conflict resolution", () => {
  it("no conflicts with aligned systems", () => {
    const risk = buildRiskIntelligence(makeSafeRisk());
    const market = buildMarketIntelligence({ healthScore: 80, opportunityScore: 75, regime: "trending", volatility: 30, liquidity: 70, correlation: 20, marketStability: 80, trendStrength: 80 });
    const conflicts = eaiResolveAllConflicts({
      strategyScore: 80, marketScore: 75, riskSafetyScore: 85,
      memoryScore: 70, learningScore: 65, identityScore: 70,
      risk, market, learningDrift: 5, memoryWinRate: 70, learningConfidence: 65,
    });
    assert.equal(conflicts.length, 0);
  });

  it("high strategy + high risk → risk_vs_strategy conflict", () => {
    const risk = buildRiskIntelligence({ ...makeHighRisk(), recommendation: "defensive_mode", crisisStatus: "high", survivalModeActive: false });
    const market = buildMarketIntelligence(null);
    const conflicts = eaiResolveAllConflicts({
      strategyScore: 90, marketScore: 50, riskSafetyScore: 20,
      memoryScore: 60, learningScore: 60, identityScore: 60,
      risk, market, learningDrift: 0, memoryWinRate: 60, learningConfidence: 60,
    });
    const rvsConflict = conflicts.find(c => c.type === "risk_vs_strategy");
    assert.ok(rvsConflict, "Expected risk_vs_strategy conflict");
    assert.equal(rvsConflict!.winnerSystem, "Risk Intelligence");
  });

  it("conflicts have required fields", () => {
    const risk = buildRiskIntelligence({ ...makeHighRisk(), recommendation: "defensive_mode", crisisStatus: "high", survivalModeActive: false });
    const market = buildMarketIntelligence(null);
    const conflicts = eaiResolveAllConflicts({
      strategyScore: 90, marketScore: 50, riskSafetyScore: 20,
      memoryScore: 60, learningScore: 60, identityScore: 60,
      risk, market, learningDrift: 0, memoryWinRate: 60, learningConfidence: 60,
    });
    for (const c of conflicts) {
      assert.ok(c.conflictId);
      assert.ok(c.type);
      assert.ok(c.severity);
      assert.ok(c.winnerSystem);
      assert.ok(c.finalJustification);
      assert.ok(Array.isArray(c.winningEvidence));
      assert.ok(Array.isArray(c.rejectedEvidence));
    }
  });
});

// ─── confidence engine ────────────────────────────────────────────────────────

describe("confidence engine", () => {
  it("confidence overall within 0-100", () => {
    const intel = makeDefaultIntel();
    const conf = eaiComputeConfidence(intel, 65);
    assert.ok(conf.overall >= 0 && conf.overall <= 100);
  });

  it("all sub-scores within 0-100", () => {
    const intel = makeDefaultIntel();
    const conf = eaiComputeConfidence(intel, 65);
    const scores = [conf.statistical, conf.dataQuality, conf.historicalReliability, conf.marketReliability, conf.systemReliability];
    for (const s of scores) {
      assert.ok(s >= 0 && s <= 100, `sub-score ${s} out of range`);
    }
  });

  it("confidence interval is ordered", () => {
    const intel = makeDefaultIntel();
    const conf = eaiComputeConfidence(intel, 65);
    assert.ok(conf.confidenceInterval.lower <= conf.confidenceInterval.upper);
  });

  it("reliability rating is valid string", () => {
    const intel = makeDefaultIntel();
    const conf = eaiComputeConfidence(intel, 65);
    assert.ok(["high", "moderate", "low", "insufficient"].includes(conf.reliabilityRating));
  });
});

// ─── buildContributions ───────────────────────────────────────────────────────

describe("buildContributions", () => {
  it("returns 7 entries (one per system)", () => {
    const intel = makeDefaultIntel();
    const dims = computeDimensionScores(
      intel.strategy, intel.market, intel.risk, intel.memory, intel.learning, intel.identity, intel.research
    );
    const contributions = buildContributions(dims, DEFAULT_EAI_WEIGHTS, 65);
    assert.equal(contributions.length, 7);
  });

  it("sorted by weighted contribution descending", () => {
    const intel = makeDefaultIntel();
    const dims = computeDimensionScores(
      intel.strategy, intel.market, intel.risk, intel.memory, intel.learning, intel.identity, intel.research
    );
    const contributions = buildContributions(dims, DEFAULT_EAI_WEIGHTS, 65);
    for (let i = 1; i < contributions.length; i++) {
      assert.ok(contributions[i - 1].weightedContribution >= contributions[i].weightedContribution);
    }
  });

  it("each contribution has required fields", () => {
    const intel = makeDefaultIntel();
    const dims = computeDimensionScores(
      intel.strategy, intel.market, intel.risk, intel.memory, intel.learning, intel.identity, intel.research
    );
    const contributions = buildContributions(dims, DEFAULT_EAI_WEIGHTS, 65);
    for (const c of contributions) {
      assert.ok(c.system);
      assert.ok(c.keyFinding);
      assert.ok(["supporting", "opposing", "neutral"].includes(c.position));
    }
  });
});

// ─── explainability ───────────────────────────────────────────────────────────

describe("explainability", () => {
  it("produces non-empty whyThisDecision", async () => {
    const decision = await runExecutiveAI({});
    assert.ok(decision.explainability.whyThisDecision.length > 20);
  });

  it("executiveSummary contains decision label", async () => {
    const decision = await runExecutiveAI({});
    assert.ok(decision.explainability.executiveSummary.length > 0);
  });

  it("has agreed and disagreed system arrays", async () => {
    const decision = await runExecutiveAI({});
    assert.ok(Array.isArray(decision.explainability.agreedSystems));
    assert.ok(Array.isArray(decision.explainability.disagreedSystems));
  });
});

// ─── runExecutiveAI ───────────────────────────────────────────────────────────

describe("runExecutiveAI", () => {
  it("produces a valid decision object with defaults", async () => {
    const decision = await runExecutiveAI({});
    assert.ok(decision.decisionId);
    assert.ok(decision.timestamp);
    assert.ok(decision.decision);
    assert.ok(decision.decisionLabel);
    assert.ok(decision.decisionDescription);
    assert.ok(typeof decision.executiveScore === "number");
    assert.ok(decision.executiveScore >= 0 && decision.executiveScore <= 100);
    assert.equal(decision.isAdvisoryOnly, true);
  });

  it("decision type is valid enum", async () => {
    const decision = await runExecutiveAI({});
    const valid = ["trade", "wait", "observe", "reduce_risk", "pause_trading", "emergency_halt"];
    assert.ok(valid.includes(decision.decision), `invalid decision: ${decision.decision}`);
  });

  it("score breakdown has 7 dimensions", async () => {
    const decision = await runExecutiveAI({});
    const dims = ["strategy", "market", "risk", "memory", "learning", "identity", "research"];
    for (const d of dims) {
      assert.ok((decision.scoreBreakdown as any)[d], `missing dimension: ${d}`);
    }
  });

  it("confidence object is complete", async () => {
    const decision = await runExecutiveAI({});
    const c = decision.executiveConfidence;
    assert.ok(c.overall >= 0 && c.overall <= 100);
    assert.ok(c.statistical >= 0 && c.statistical <= 100);
    assert.ok(c.dataQuality >= 0 && c.dataQuality <= 100);
  });

  it("contributing systems is non-empty and sorted", async () => {
    const decision = await runExecutiveAI({});
    assert.ok(decision.contributingSystems.length === 7);
  });

  it("version info is populated", async () => {
    const decision = await runExecutiveAI({});
    assert.equal(decision.versionInfo.engineVersion, EAI_ENGINE_VERSION);
  });

  it("emergency risk scenario → emergency_halt or pause_trading", async () => {
    const decision = await runExecutiveAI({ erbResult: makeHighRisk() });
    const safeDecisions = ["emergency_halt", "pause_trading", "reduce_risk"];
    assert.ok(safeDecisions.includes(decision.decision),
      `Expected safe decision, got: ${decision.decision} (score: ${decision.executiveScore})`);
  });

  it("fully healthy scenario → trade or wait", async () => {
    const decision = await runExecutiveAI({
      strategyResult: makeHighStrategy(),
      erbResult:      makeSafeRisk(),
    });
    const goodDecisions = ["trade", "wait", "observe"];
    assert.ok(goodDecisions.includes(decision.decision),
      `Expected good decision, got: ${decision.decision} (score: ${decision.executiveScore})`);
  });

  it("pair and timeframe are preserved", async () => {
    const decision = await runExecutiveAI({ pair: "GBPUSD", timeframe: "1h" });
    assert.equal(decision.pair, "GBPUSD");
    assert.equal(decision.timeframe, "1h");
  });

  it("custom weights are applied", async () => {
    const decision = await runExecutiveAI({ weights: { strategy: 0.9, risk: 0.1 } });
    const breakdown = decision.scoreBreakdown;
    assert.ok(breakdown.strategy.weight > breakdown.risk.weight,
      `strategy weight ${breakdown.strategy.weight} should exceed risk weight ${breakdown.risk.weight}`);
  });

  it("DECISION_LABELS has all 6 decision types", () => {
    const expected = ["trade", "wait", "observe", "reduce_risk", "pause_trading", "emergency_halt"];
    for (const k of expected) {
      assert.ok((DECISION_LABELS as any)[k], `Missing label for ${k}`);
    }
  });
});

// ─── High-frequency stability ─────────────────────────────────────────────────

describe("high-frequency stability", () => {
  it("25 sequential decisions without error", async () => {
    for (let i = 0; i < 25; i++) {
      const d = await runExecutiveAI({});
      assert.ok(d.executiveScore >= 0 && d.executiveScore <= 100);
    }
  });

  it("mixed scenarios stay within bounds", async () => {
    const scenarios = [
      { erbResult: makeHighRisk() },
      { erbResult: makeSafeRisk(), strategyResult: makeHighStrategy() },
      {},
      { strategyResult: { executiveScore: 0, rulePassRate: 0, strategyStrength: 0 } },
      { erbResult: { overallRiskScore: 100, survivalScore: 0, crisisStatus: "emergency", survivalModeActive: true, recommendation: "emergency_stop" } },
    ];
    for (const s of scenarios) {
      const d = await runExecutiveAI(s);
      assert.ok(d.executiveScore >= 0 && d.executiveScore <= 100, `score ${d.executiveScore} out of range`);
    }
  });
});
