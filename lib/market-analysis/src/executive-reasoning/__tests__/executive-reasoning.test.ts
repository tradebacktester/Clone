// ─── Autonomous Executive Reasoning Engine Tests ──────────────────────────────
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  runExecutiveReasoning,
  collectEvidence,
  runAllAdvisors,
  strategyAdvisor,
  marketAdvisor,
  riskAdvisor,
  memoryAdvisor,
  learningAdvisor,
  identityAdvisor,
  buildConflictMatrix,
  deliberate,
  buildCandidates,
  runSafetyGates,
  GATE_THRESHOLDS,
  buildReasoningTrace,
  ER_ENGINE_VERSION,
} from "../index.js";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function safeErb() {
  return {
    overallRiskScore: 20, survivalScore: 90, capitalHealthScore: 92,
    portfolioStabilityScore: 88, brokerReliabilityScore: 92, infrastructureScore: 95,
    crisisStatus: "none", crisisSeverity: "none",
    recommendation: "trade_normally", survivalModeActive: false,
  };
}

function emergencyErb() {
  return {
    overallRiskScore: 92, survivalScore: 15, capitalHealthScore: 15,
    portfolioStabilityScore: 10, brokerReliabilityScore: 40, infrastructureScore: 50,
    crisisStatus: "emergency", crisisSeverity: "extreme",
    recommendation: "emergency_stop", survivalModeActive: true,
  };
}

function goodStrategy() {
  return {
    executiveScore: 88, rulePassRate: 82, strategyStrength: 85,
    ruleQualityScore: 80, recommendation: "trade", pair: "EURUSD", session: "london", regime: "trending",
  };
}

// ─── Evidence Collection ──────────────────────────────────────────────────────

describe("evidence collection", () => {
  it("collects 8 evidence items", () => {
    const ev = collectEvidence({
      pair: "EURUSD", timeframe: "15m",
      strategyResult: null, erbResult: null, riResult: null,
      now: new Date().toISOString(),
    });
    assert.equal(ev.totalItems, 8);
  });

  it("evidence quality is 0-100", () => {
    const ev = collectEvidence({
      pair: "EURUSD", timeframe: "15m",
      strategyResult: goodStrategy(), erbResult: safeErb(), riResult: null,
      now: new Date().toISOString(),
    });
    assert.ok(ev.overallQuality >= 0 && ev.overallQuality <= 100);
  });

  it("has collectionId and timestamp", () => {
    const ev = collectEvidence({
      pair: "EURUSD", timeframe: "15m",
      strategyResult: null, erbResult: null, riResult: null,
      now: new Date().toISOString(),
    });
    assert.ok(ev.collectionId);
    assert.ok(ev.collectedAt);
  });

  it("valid items counted correctly", () => {
    const ev = collectEvidence({
      pair: "EURUSD", timeframe: "15m",
      strategyResult: goodStrategy(), erbResult: safeErb(), riResult: null,
      now: new Date().toISOString(),
    });
    assert.ok(ev.validItems <= ev.totalItems);
    assert.ok(ev.validItems >= 0);
  });
});

// ─── Individual Advisors ──────────────────────────────────────────────────────

describe("strategy advisor", () => {
  it("returns valid recommendation for null input", () => {
    const a = strategyAdvisor(null);
    assert.equal(a.advisorId, "strategy_advisor");
    assert.ok(["trade","wait","observe","reduce_risk","pause_trading","emergency_halt"].includes(a.recommendation));
    assert.ok(a.confidence >= 0 && a.confidence <= 100);
  });

  it("high strategy → trade or wait", () => {
    const a = strategyAdvisor(goodStrategy());
    assert.ok(["trade","wait"].includes(a.recommendation), `expected trade/wait, got: ${a.recommendation}`);
  });

  it("has required fields", () => {
    const a = strategyAdvisor(null);
    assert.ok(Array.isArray(a.supportingEvidence) && a.supportingEvidence.length > 0);
    assert.ok(Array.isArray(a.keyRisks) && a.keyRisks.length > 0);
    assert.ok(a.reasoning.length > 0);
  });
});

describe("risk advisor", () => {
  it("emergency input → emergency_halt", () => {
    const a = riskAdvisor(emergencyErb());
    assert.equal(a.recommendation, "emergency_halt");
  });

  it("safe input → trade", () => {
    const a = riskAdvisor(safeErb());
    assert.equal(a.recommendation, "trade");
  });

  it("has highest reliability (95)", () => {
    const a = riskAdvisor(safeErb());
    assert.equal(a.reliability, 95);
  });
});

describe("market advisor", () => {
  it("handles null input", () => {
    const a = marketAdvisor(null);
    assert.ok(a.confidence >= 0 && a.confidence <= 100);
    assert.equal(a.advisorId, "market_advisor");
  });
});

describe("memory advisor", () => {
  it("no data → low confidence", () => {
    const a = memoryAdvisor(null);
    assert.ok(a.confidence < 60);
    assert.equal(a.dataQuality, "missing");
  });

  it("rich data → higher confidence", () => {
    const a = memoryAdvisor({ historicalWinRate: 75, similarTradeCount: 20, historicalConfidence: 80 });
    assert.ok(a.confidence > 40);
  });
});

describe("learning advisor", () => {
  it("handles null", () => {
    const a = learningAdvisor(null);
    assert.ok(a.advisorId === "learning_advisor");
  });

  it("good learning data → positive recommendation", () => {
    const a = learningAdvisor({ overallConfidence: 85, performanceDrift: 10, predictionReliability: 80 });
    assert.ok(["trade","wait","observe"].includes(a.recommendation));
  });
});

describe("identity advisor", () => {
  it("handles null", () => {
    const a = identityAdvisor(null);
    assert.equal(a.advisorId, "identity_advisor");
  });

  it("aligned identity → positive rec", () => {
    const a = identityAdvisor({ identitySimilarityScore: 90, preferenceAlignmentScore: 88, identityConfidence: 85 });
    assert.ok(["trade","wait","observe"].includes(a.recommendation));
  });
});

// ─── runAllAdvisors ───────────────────────────────────────────────────────────

describe("runAllAdvisors", () => {
  it("returns 6 assessments", () => {
    const advisors = runAllAdvisors({ strategyResult: null, erbResult: null });
    assert.equal(advisors.length, 6);
  });

  it("each has unique advisorId", () => {
    const advisors = runAllAdvisors({ strategyResult: null, erbResult: null });
    const ids = advisors.map(a => a.advisorId);
    const unique = new Set(ids);
    assert.equal(unique.size, 6);
  });

  it("all recommendations are valid", () => {
    const valid = ["trade","wait","observe","reduce_risk","pause_trading","emergency_halt"];
    const advisors = runAllAdvisors({ strategyResult: null, erbResult: null });
    for (const a of advisors) {
      assert.ok(valid.includes(a.recommendation), `Invalid rec: ${a.recommendation}`);
    }
  });
});

// ─── Conflict Matrix ──────────────────────────────────────────────────────────

describe("conflict matrix", () => {
  it("no conflicts for fully aligned advisors", () => {
    const advisors = runAllAdvisors({ strategyResult: goodStrategy(), erbResult: safeErb() });
    // Override all to same recommendation for test
    const aligned = advisors.map(a => ({ ...a, recommendation: "wait" as const }));
    const matrix = buildConflictMatrix(aligned);
    assert.equal(matrix.hasConflicts, false);
    assert.equal(matrix.agreementScore, 100);
  });

  it("conflict detected when advisors diverge", () => {
    const advisors = runAllAdvisors({ strategyResult: goodStrategy(), erbResult: emergencyErb() });
    const matrix = buildConflictMatrix(advisors);
    // With good strategy (says trade/wait) + emergency ERB (says emergency_halt) there must be conflicts
    assert.ok(matrix.entries.length > 0);
    assert.ok(matrix.hasConflicts);
  });

  it("has matrixId and required fields", () => {
    const advisors = runAllAdvisors({ strategyResult: null, erbResult: null });
    const matrix = buildConflictMatrix(advisors);
    assert.ok(matrix.matrixId);
    assert.ok(typeof matrix.agreementScore === "number");
    assert.ok(["none","low","moderate","high","critical"].includes(matrix.overallConflictLevel));
    assert.ok(Array.isArray(matrix.entries));
  });

  it("critical conflicts when risk and strategy maximally diverge", () => {
    const advisors = runAllAdvisors({ strategyResult: goodStrategy(), erbResult: emergencyErb() });
    const matrix = buildConflictMatrix(advisors);
    const criticals = matrix.entries.filter(e => e.severity === "critical");
    assert.ok(criticals.length > 0, "Expected critical conflicts between trade vs emergency_halt");
  });
});

// ─── Deliberation ─────────────────────────────────────────────────────────────

describe("deliberation", () => {
  it("returns all 6 candidate actions", () => {
    const advisors = runAllAdvisors({ strategyResult: null, erbResult: null });
    const matrix   = buildConflictMatrix(advisors);
    const del = deliberate({
      advisors, conflictMatrix: matrix, compositeScore: 60,
      riskRec: "trade_normally", crisisStatus: "none", survivalMode: false,
    });
    assert.equal(del.candidates.length, 6);
  });

  it("selected action is in viable set", () => {
    const advisors = runAllAdvisors({ strategyResult: null, erbResult: null });
    const matrix   = buildConflictMatrix(advisors);
    const del = deliberate({
      advisors, conflictMatrix: matrix, compositeScore: 60,
      riskRec: "trade_normally", crisisStatus: "none", survivalMode: false,
    });
    const valid = ["trade","wait","observe","reduce_risk","pause_trading","emergency_halt"];
    assert.ok(valid.includes(del.selectedAction));
  });

  it("emergency mode disqualifies trade", () => {
    const advisors = runAllAdvisors({ strategyResult: goodStrategy(), erbResult: emergencyErb() });
    const matrix   = buildConflictMatrix(advisors);
    const del = deliberate({
      advisors, conflictMatrix: matrix, compositeScore: 80,
      riskRec: "emergency_stop", crisisStatus: "emergency", survivalMode: true,
    });
    assert.notEqual(del.selectedAction, "trade", "Trade must be disqualified in emergency");
  });

  it("has rejected alternatives", () => {
    const advisors = runAllAdvisors({ strategyResult: null, erbResult: null });
    const matrix   = buildConflictMatrix(advisors);
    const del = deliberate({
      advisors, conflictMatrix: matrix, compositeScore: 60,
      riskRec: "trade_normally", crisisStatus: "none", survivalMode: false,
    });
    assert.ok(del.rejectedAlternatives.length > 0);
    assert.ok(del.deliberationId);
    assert.ok(del.deliberationReason.length > 0);
  });
});

// ─── Safety Gates ─────────────────────────────────────────────────────────────

describe("safety gates", () => {
  it("all gates pass for healthy conditions", () => {
    const gates = runSafetyGates({
      rulePassRate: 85, erbRiskScore: 20, capitalHealthScore: 90,
      crisisStatus: "none", survivalModeActive: false,
      evidenceQuality: 80, brokerReliability: 90, executiveConfidence: 75,
    });
    assert.equal(gates.allPassed, true);
    assert.equal(gates.tradingPermitted, true);
    assert.equal(gates.failedGates.length, 0);
  });

  it("emergency mode fails the gate", () => {
    const gates = runSafetyGates({
      rulePassRate: 85, erbRiskScore: 20, capitalHealthScore: 90,
      crisisStatus: "emergency", survivalModeActive: true,
      evidenceQuality: 80, brokerReliability: 90, executiveConfidence: 75,
    });
    assert.equal(gates.allPassed, false);
    assert.equal(gates.tradingPermitted, false);
    assert.ok(gates.failedGates.includes("Emergency Mode"));
  });

  it("high risk score fails risk gate", () => {
    const gates = runSafetyGates({
      rulePassRate: 85, erbRiskScore: 80, capitalHealthScore: 90,
      crisisStatus: "none", survivalModeActive: false,
      evidenceQuality: 80, brokerReliability: 90, executiveConfidence: 75,
    });
    assert.ok(gates.failedGates.includes("Risk Limits"), "Risk Limits gate should fail");
    assert.equal(gates.tradingPermitted, false);
  });

  it("low rule pass rate fails strategy gate", () => {
    const gates = runSafetyGates({
      rulePassRate: 50, erbRiskScore: 20, capitalHealthScore: 90,
      crisisStatus: "none", survivalModeActive: false,
      evidenceQuality: 80, brokerReliability: 90, executiveConfidence: 75,
    });
    assert.ok(gates.failedGates.includes("Deterministic Strategy"));
    assert.equal(gates.tradingPermitted, false);
  });

  it("warning-only failures still permit trading", () => {
    const gates = runSafetyGates({
      rulePassRate: 85, erbRiskScore: 20, capitalHealthScore: 90,
      crisisStatus: "none", survivalModeActive: false,
      evidenceQuality: 30, brokerReliability: 40, executiveConfidence: 75,
    });
    // evidenceQuality and brokerReliability are warning-only
    assert.equal(gates.tradingPermitted, true, "Warning-only failures should still permit trading");
    assert.equal(gates.allPassed, false);
  });

  it("has 7 gates total", () => {
    const gates = runSafetyGates({
      rulePassRate: 80, erbRiskScore: 30, capitalHealthScore: 80,
      crisisStatus: "none", survivalModeActive: false,
      evidenceQuality: 70, brokerReliability: 75, executiveConfidence: 65,
    });
    assert.equal(gates.gates.length, 7);
  });

  it("GATE_THRESHOLDS are correct values", () => {
    assert.equal(GATE_THRESHOLDS.rulePassRate, 70);
    assert.equal(GATE_THRESHOLDS.erbRiskScore, 65);
    assert.equal(GATE_THRESHOLDS.executiveConfidence, 55);
  });
});

// ─── runExecutiveReasoning ────────────────────────────────────────────────────

describe("runExecutiveReasoning", () => {
  it("completes all 5 stages", async () => {
    const report = await runExecutiveReasoning({});
    assert.equal(report.reasoningTrace.stages.length, 5);
  });

  it("returns valid structure", async () => {
    const report = await runExecutiveReasoning({});
    assert.ok(report.reportId);
    assert.ok(report.traceId);
    assert.ok(report.evaluatedAt);
    assert.ok(report.selectedAction);
    assert.equal(report.isAdvisoryOnly, true);
    assert.ok(report.reasoningTrace.isReplayable);
  });

  it("engine version is populated", async () => {
    const report = await runExecutiveReasoning({});
    assert.equal(report.engineVersion, ER_ENGINE_VERSION);
    assert.equal(report.reasoningTrace.engineVersion, ER_ENGINE_VERSION);
  });

  it("has 6 advisor assessments", async () => {
    const report = await runExecutiveReasoning({});
    assert.equal(report.advisorAssessments.length, 6);
  });

  it("conflict matrix is populated", async () => {
    const report = await runExecutiveReasoning({});
    assert.ok(report.conflictMatrix.matrixId);
    assert.ok(typeof report.conflictMatrix.agreementScore === "number");
  });

  it("safety gate report has 7 gates", async () => {
    const report = await runExecutiveReasoning({});
    assert.equal(report.safetyGateReport.gates.length, 7);
  });

  it("deliberation has 6 candidate actions", async () => {
    const report = await runExecutiveReasoning({});
    assert.equal(report.deliberationResult.candidates.length, 6);
  });

  it("rejected alternatives cover other 5 actions", async () => {
    const report = await runExecutiveReasoning({});
    assert.ok(report.rejectedAlternatives.length > 0);
    assert.ok(report.rejectedAlternatives.length < 6);
  });

  it("pair and timeframe preserved", async () => {
    const report = await runExecutiveReasoning({ pair: "GBPUSD", timeframe: "1h" });
    assert.equal(report.pair, "GBPUSD");
    assert.equal(report.timeframe, "1h");
  });

  it("emergency scenario → safe decision", async () => {
    const report = await runExecutiveReasoning({ erbResult: emergencyErb() });
    assert.notEqual(report.selectedAction, "trade", `Emergency scenario must not produce 'trade': got ${report.selectedAction}`);
  });

  it("safe scenario → positive decision", async () => {
    const report = await runExecutiveReasoning({ strategyResult: goodStrategy(), erbResult: safeErb() });
    const positive = ["trade", "wait", "observe"];
    assert.ok(positive.includes(report.selectedAction),
      `Expected positive decision, got: ${report.selectedAction}`);
  });

  it("safety gate override prevents trade when gates fail", async () => {
    // Emergency ERB with good strategy — deliberation wants trade but gates forbid it
    const report = await runExecutiveReasoning({
      strategyResult: goodStrategy(),
      erbResult: emergencyErb(),
    });
    assert.notEqual(report.selectedAction, "trade");
    assert.equal(report.safetyGateReport.tradingPermitted, false);
  });

  it("durationMs is positive integer", async () => {
    const report = await runExecutiveReasoning({});
    assert.ok(report.durationMs >= 0);
    assert.ok(typeof report.durationMs === "number");
  });

  it("reasoning trace has primary and secondary evidence", async () => {
    const report = await runExecutiveReasoning({});
    assert.ok(Array.isArray(report.reasoningTrace.primaryEvidence));
    assert.ok(Array.isArray(report.reasoningTrace.secondaryEvidence));
    assert.ok(report.reasoningTrace.justification.length > 20);
  });

  it("reasoning trace has riskSummary and historicalComparison", async () => {
    const report = await runExecutiveReasoning({});
    assert.ok(report.reasoningTrace.riskSummary.length > 0);
    assert.ok(report.reasoningTrace.historicalComparison.length > 0);
  });
});

// ─── High-frequency stability ─────────────────────────────────────────────────

describe("high-frequency stability", () => {
  it("20 sequential reasoning cycles without error", async () => {
    for (let i = 0; i < 20; i++) {
      const r = await runExecutiveReasoning({});
      assert.ok(r.executiveScore >= 0 && r.executiveScore <= 100);
      assert.ok(r.reasoningTrace.stages.length === 5);
    }
  });

  it("mixed scenarios remain stable", async () => {
    const scenarios = [
      { erbResult: emergencyErb() },
      { erbResult: safeErb(), strategyResult: goodStrategy() },
      {},
      { strategyResult: { executiveScore: 0, rulePassRate: 0 } },
      { erbResult: { overallRiskScore: 100, crisisStatus: "emergency", survivalModeActive: true, recommendation: "emergency_stop" } },
    ];
    for (const s of scenarios) {
      const r = await runExecutiveReasoning(s);
      assert.ok(r.selectedAction);
      assert.ok(r.safetyGateReport.gates.length === 7);
    }
  });
});
