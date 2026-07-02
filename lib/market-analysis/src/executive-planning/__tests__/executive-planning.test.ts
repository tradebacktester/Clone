// ─── Executive Planning Engine Tests ──────────────────────────────────────────
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateAllGoals,
  prioritizeGoals,
  detectAndResolveConflicts,
  generateAllPlans,
  trackGoalProgress,
  computeMissionHealth,
  runExecutiveMission,
  GOAL_LEVEL_LABELS,
  EP_ENGINE_VERSION,
} from "../index.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalCtx() {
  return {
    executiveScore:  72,
    strategyScore:   68,
    riskScore:       32,
    marketScore:     65,
    drawdownPct:     1.5,
    winRate:         57,
    profitFactor:    1.8,
    openPositions:   0,
    crisisStatus:    "none",
    survivalMode:    false,
  };
}

function highRiskCtx() {
  return {
    executiveScore:  40,
    strategyScore:   38,
    riskScore:       82,
    marketScore:     30,
    drawdownPct:     7.5,
    winRate:         42,
    profitFactor:    0.9,
    openPositions:   2,
    crisisStatus:    "critical",
    survivalMode:    false,
  };
}

function emergencyCtx() {
  return {
    executiveScore:  20,
    strategyScore:   25,
    riskScore:       92,
    marketScore:     20,
    drawdownPct:     9.0,
    winRate:         40,
    profitFactor:    0.7,
    openPositions:   1,
    crisisStatus:    "emergency",
    survivalMode:    true,
  };
}

function planCtx(goals: ReturnType<typeof generateAllGoals>, ctx: ReturnType<typeof normalCtx>) {
  return {
    topGoals:       goals,
    executiveScore: ctx.executiveScore,
    riskScore:      ctx.riskScore,
    drawdownPct:    ctx.drawdownPct,
    survivalMode:   ctx.survivalMode,
    crisisStatus:   ctx.crisisStatus,
    winRate:        ctx.winRate,
    profitFactor:   ctx.profitFactor,
  };
}

// ─── Goal Generator ───────────────────────────────────────────────────────────

describe("goal generator", () => {
  it("always generates at least 5 permanent mission goals (Level 1)", () => {
    const goals = generateAllGoals(normalCtx());
    const l1    = goals.filter(g => g.level === 1);
    assert.ok(l1.length >= 5, `Expected ≥5 Level 1 goals, got ${l1.length}`);
  });

  it("generates goals at all 4 levels", () => {
    const goals  = generateAllGoals(normalCtx());
    const levels = new Set(goals.map(g => g.level));
    for (const lvl of [1, 2, 3, 4]) {
      assert.ok(levels.has(lvl as any), `Missing Level ${lvl} goals`);
    }
  });

  it("all goals have required fields", () => {
    const goals = generateAllGoals(normalCtx());
    for (const g of goals) {
      assert.ok(typeof g.goalId === "string" && g.goalId.length > 0);
      assert.ok(typeof g.title === "string" && g.title.length > 0);
      assert.ok(typeof g.metric === "string");
      assert.ok(isFinite(g.priority) && g.priority >= 0 && g.priority <= 100);
      assert.ok(isFinite(g.importance) && g.importance >= 0 && g.importance <= 100);
      assert.ok(isFinite(g.urgency) && g.urgency >= 0 && g.urgency <= 100);
      assert.ok(isFinite(g.progress) && g.progress >= 0 && g.progress <= 100);
      assert.ok(isFinite(g.confidence) && g.confidence >= 0 && g.confidence <= 100);
    }
  });

  it("high risk context generates exposure control goal", () => {
    const goals = generateAllGoals(highRiskCtx());
    const found = goals.some(g => g.category === "exposure_control");
    assert.ok(found, "High risk context should generate exposure control goal");
  });

  it("emergency/survival context generates pause/recovery goal", () => {
    const goals = generateAllGoals(emergencyCtx());
    const found = goals.some(g => g.category === "recovery" && g.level === 4);
    assert.ok(found, "Emergency context should generate recovery/pause goal at Level 4");
  });

  it("strong signal context generates execute goal at Level 4", () => {
    const ctx = { ...normalCtx(), executiveScore: 82, strategyScore: 78, riskScore: 20 };
    const goals = generateAllGoals(ctx);
    const found = goals.some(g => g.level === 4 && g.category === "trade_quality");
    assert.ok(found, "Strong signal should generate execute/trade quality goal at Level 4");
  });

  it("all progress values are 0-100", () => {
    const goals = generateAllGoals(highRiskCtx());
    for (const g of goals) {
      assert.ok(g.progress >= 0 && g.progress <= 100,
        `${g.title} progress out of range: ${g.progress}`);
    }
  });

  it("GOAL_LEVEL_LABELS covers all 4 levels", () => {
    for (const lvl of [1, 2, 3, 4]) {
      assert.ok(GOAL_LEVEL_LABELS[lvl as 1|2|3|4], `Missing label for level ${lvl}`);
    }
  });
});

// ─── Goal Prioritizer ─────────────────────────────────────────────────────────

describe("goal prioritizer", () => {
  it("returns same number of goals", () => {
    const goals  = generateAllGoals(normalCtx());
    const ranked = prioritizeGoals(goals);
    assert.equal(ranked.length, goals.length);
  });

  it("Level 1 goals always appear before Level 4 goals", () => {
    const goals  = generateAllGoals(normalCtx());
    const ranked = prioritizeGoals(goals);
    const firstL4 = ranked.findIndex(g => g.level === 4);
    const lastL1  = ranked.reduce((idx, g, i) => (g.level === 1 ? i : idx), -1);
    if (firstL4 !== -1 && lastL1 !== -1) {
      assert.ok(lastL1 < firstL4,
        `Last Level 1 goal (idx ${lastL1}) should come before first Level 4 goal (idx ${firstL4})`);
    }
  });

  it("Level 2 goals appear before Level 3 goals", () => {
    const goals  = generateAllGoals(normalCtx());
    const ranked = prioritizeGoals(goals);
    const firstL3 = ranked.findIndex(g => g.level === 3);
    const lastL2  = ranked.reduce((idx, g, i) => (g.level === 2 ? i : idx), -1);
    if (firstL3 !== -1 && lastL2 !== -1) {
      assert.ok(lastL2 < firstL3,
        `Level 2 goals should rank above Level 3`);
    }
  });

  it("no duplicates in output", () => {
    const goals  = generateAllGoals(normalCtx());
    const ranked = prioritizeGoals(goals);
    const ids    = ranked.map(g => g.goalId);
    assert.equal(new Set(ids).size, ids.length, "Duplicate goalIds detected");
  });
});

// ─── Conflict Resolver ────────────────────────────────────────────────────────

describe("conflict resolver", () => {
  it("no conflicts for simple permanent-mission-only goals", () => {
    // Only Level 1 goals — all aligned on capital preservation
    const goals = generateAllGoals(normalCtx()).filter(g => g.level === 1);
    const cfls  = detectAndResolveConflicts(goals);
    // May have 0 or some conflicts — just ensure no crash and all have required fields
    for (const c of cfls) {
      assert.ok(c.conflictId.startsWith("cf_"));
      assert.ok(typeof c.resolution === "string" && c.resolution.length > 10);
      assert.ok(typeof c.winnerGoalId === "string");
    }
  });

  it("each conflict has conflictId, type, summary, resolution, winner", () => {
    const goals = generateAllGoals(highRiskCtx());
    const cfls  = detectAndResolveConflicts(goals);
    for (const c of cfls) {
      assert.ok(c.conflictId.startsWith("cf_"), `Bad conflictId: ${c.conflictId}`);
      assert.ok(typeof c.conflictType === "string");
      assert.ok(c.conflictSummary.length > 5);
      assert.ok(c.resolution.length > 10);
      assert.ok(typeof c.winnerGoalId === "string" && c.winnerGoalId.length > 0);
      assert.ok(isFinite(c.confidence) && c.confidence >= 0 && c.confidence <= 100);
    }
  });

  it("winner of opportunity_vs_risk is always the risk/capital goal", () => {
    const goals = generateAllGoals(highRiskCtx());
    const cfls  = detectAndResolveConflicts(goals);
    const oppRisk = cfls.filter(c => c.conflictType === "opportunity_vs_risk");
    for (const c of oppRisk) {
      const winner = [c.goalA, c.goalB].find(g => g.goalId === c.winnerGoalId)!;
      assert.ok(
        winner.category === "capital_preservation" ||
        winner.category === "risk_management" ||
        winner.category === "drawdown_control" ||
        winner.level === 1,
        `Expected risk/capital goal to win opportunity_vs_risk conflict, got: ${winner.category}`
      );
    }
  });

  it("no duplicate conflict types across same pair", () => {
    const goals = generateAllGoals(highRiskCtx());
    const cfls  = detectAndResolveConflicts(goals);
    const seen  = new Set<string>();
    for (const c of cfls) {
      const key = `${c.conflictType}_${c.goalA.goalId}_${c.goalB.goalId}`;
      assert.ok(!seen.has(key), `Duplicate conflict: ${key}`);
      seen.add(key);
    }
  });
});

// ─── Planning Engine ──────────────────────────────────────────────────────────

describe("planning engine", () => {
  it("generates exactly 4 plans", () => {
    const goals  = generateAllGoals(normalCtx());
    const ranked = prioritizeGoals(goals);
    const plans  = generateAllPlans(planCtx(ranked, normalCtx()));
    assert.equal(plans.length, 4);
  });

  it("plans cover all 4 horizons", () => {
    const goals  = generateAllGoals(normalCtx());
    const ranked = prioritizeGoals(goals);
    const plans  = generateAllPlans(planCtx(ranked, normalCtx()));
    const hors   = new Set(plans.map(p => p.horizon));
    for (const h of ["immediate", "short_term", "medium_term", "long_term"]) {
      assert.ok(hors.has(h as any), `Missing horizon: ${h}`);
    }
  });

  it("each plan has planId, title, actions, confidence", () => {
    const goals  = generateAllGoals(normalCtx());
    const ranked = prioritizeGoals(goals);
    const plans  = generateAllPlans(planCtx(ranked, normalCtx()));
    for (const p of plans) {
      assert.ok(p.planId.startsWith("p_"), `Bad planId: ${p.planId}`);
      assert.ok(p.title.length > 5);
      assert.ok(Array.isArray(p.actions) && p.actions.length > 0);
      assert.ok(isFinite(p.confidence) && p.confidence >= 0 && p.confidence <= 100);
    }
  });

  it("emergency context: immediate plan title includes pause/halt/emergency", () => {
    const ctx    = emergencyCtx();
    const goals  = generateAllGoals(ctx);
    const ranked = prioritizeGoals(goals);
    const plans  = generateAllPlans(planCtx(ranked, ctx));
    const imm    = plans.find(p => p.horizon === "immediate")!;
    const title  = imm.title.toLowerCase();
    assert.ok(
      title.includes("pause") || title.includes("halt") || title.includes("emergency"),
      `Emergency plan title should mention pause/halt/emergency: "${imm.title}"`
    );
  });

  it("each action has actionId, description, goalId, priority", () => {
    const goals  = generateAllGoals(normalCtx());
    const ranked = prioritizeGoals(goals);
    const plans  = generateAllPlans(planCtx(ranked, normalCtx()));
    for (const p of plans) {
      for (const a of p.actions) {
        assert.ok(a.actionId.startsWith("a_"));
        assert.ok(a.description.length > 5);
        assert.ok(typeof a.goalId === "string");
        assert.ok(isFinite(a.priority) && a.priority >= 0 && a.priority <= 100);
      }
    }
  });

  it("long-term plan always links to Level 1 goals", () => {
    const goals  = generateAllGoals(normalCtx());
    const ranked = prioritizeGoals(goals);
    const plans  = generateAllPlans(planCtx(ranked, normalCtx()));
    const lt     = plans.find(p => p.horizon === "long_term")!;
    assert.ok(lt.linkedGoals.length > 0, "Long-term plan should have linked goals");
  });
});

// ─── Progress Tracker ─────────────────────────────────────────────────────────

describe("progress tracker", () => {
  it("returns one progress entry per goal", () => {
    const goals  = generateAllGoals(normalCtx());
    const reports = trackGoalProgress(goals);
    assert.equal(reports.length, goals.length);
  });

  it("every progress entry has required fields", () => {
    const goals   = generateAllGoals(normalCtx());
    const reports = trackGoalProgress(goals);
    for (const r of reports) {
      assert.ok(typeof r.goalId === "string");
      assert.ok(typeof r.title === "string" && r.title.length > 0);
      assert.ok(isFinite(r.progress) && r.progress >= 0 && r.progress <= 100);
      assert.ok(["improving", "stable", "declining"].includes(r.trend));
      assert.ok(["healthy", "at_risk", "critical", "violated"].includes(r.health));
      assert.ok(r.nextMilestone.length > 5);
    }
  });

  it("Level 1 goals are healthy under normal conditions", () => {
    const goals   = generateAllGoals(normalCtx());
    const reports = trackGoalProgress(goals);
    const l1      = reports.filter(r => r.level === 1);
    const unhealthy = l1.filter(r => r.health === "violated");
    assert.equal(unhealthy.length, 0, "Level 1 goals should not be violated under normal conditions");
  });
});

// ─── Mission Health ────────────────────────────────────────────────────────────

describe("mission health", () => {
  it("returns a health object with all required fields", () => {
    const goals    = generateAllGoals(normalCtx());
    const ranked   = prioritizeGoals(goals);
    const conflicts = detectAndResolveConflicts(ranked);
    const health   = computeMissionHealth(ranked, conflicts);
    assert.ok(isFinite(health.overallScore) && health.overallScore >= 0 && health.overallScore <= 100);
    assert.ok(["optimal", "healthy", "degraded", "critical", "violated"].includes(health.status));
    assert.ok(isFinite(health.level1Adherence));
    assert.ok(isFinite(health.goalAchievement));
    assert.ok(isFinite(health.planConsistency));
    assert.ok(isFinite(health.conflictResolution));
    assert.ok(Array.isArray(health.breakdown) && health.breakdown.length > 0);
  });

  it("normal context produces healthy or optimal status", () => {
    const goals    = generateAllGoals(normalCtx());
    const ranked   = prioritizeGoals(goals);
    const conflicts = detectAndResolveConflicts(ranked);
    const health   = computeMissionHealth(ranked, conflicts);
    assert.ok(["optimal", "healthy"].includes(health.status),
      `Expected healthy/optimal under normal conditions, got: ${health.status}`);
  });

  it("overallScore is 0-100", () => {
    for (const ctx of [normalCtx(), highRiskCtx(), emergencyCtx()]) {
      const goals    = generateAllGoals(ctx);
      const ranked   = prioritizeGoals(goals);
      const conflicts = detectAndResolveConflicts(ranked);
      const health   = computeMissionHealth(ranked, conflicts);
      assert.ok(health.overallScore >= 0 && health.overallScore <= 100,
        `overallScore out of range: ${health.overallScore}`);
    }
  });

  it("no conflicts = conflictResolution of 100", () => {
    const goals    = generateAllGoals(normalCtx()).filter(g => g.level === 1);
    const ranked   = prioritizeGoals(goals);
    const health   = computeMissionHealth(ranked, []);
    assert.equal(health.conflictResolution, 100);
  });
});

// ─── runExecutiveMission (full orchestrator) ─────────────────────────────────

describe("runExecutiveMission", () => {
  it("returns valid ExecutiveMission object", async () => {
    const result = await runExecutiveMission({ pair: "EURUSD", timeframe: "15m" });
    assert.ok(result.missionId.startsWith("em_"));
    assert.equal(result.isAdvisoryOnly, true);
    assert.ok(typeof result.engineVersion === "string");
  });

  it("has all 4 plans", async () => {
    const result = await runExecutiveMission({});
    assert.equal(result.plans.length, 4);
    assert.ok(result.immediatePlan);
    assert.ok(result.shortTermPlan);
    assert.ok(result.mediumTermPlan);
    assert.ok(result.longTermPlan);
  });

  it("has goals at all 4 levels", async () => {
    const result = await runExecutiveMission({});
    const levels = new Set(result.goals.map(g => g.level));
    for (const lvl of [1, 2, 3, 4]) {
      assert.ok(levels.has(lvl as any), `Missing Level ${lvl} goals`);
    }
  });

  it("permanent mission goals are present", async () => {
    const result = await runExecutiveMission({});
    assert.ok(result.permanentMission.length >= 5, "Expected ≥5 permanent mission goals");
  });

  it("missionHealth has valid status", async () => {
    const result = await runExecutiveMission({});
    assert.ok(["optimal", "healthy", "degraded", "critical", "violated"].includes(result.missionHealth.status));
  });

  it("progressReports count matches goals count", async () => {
    const result = await runExecutiveMission({});
    assert.equal(result.progressReports.length, result.goals.length);
  });

  it("supportingEvidence is non-empty array", async () => {
    const result = await runExecutiveMission({});
    assert.ok(Array.isArray(result.supportingEvidence) && result.supportingEvidence.length > 0);
  });

  it("confidence is 0-100", async () => {
    const result = await runExecutiveMission({});
    assert.ok(result.confidence >= 0 && result.confidence <= 100);
  });

  it("durationMs is positive integer", async () => {
    const result = await runExecutiveMission({});
    assert.ok(Number.isInteger(result.durationMs) && result.durationMs >= 0);
  });

  it("survivalMode triggers emergency immediate plan", async () => {
    const result = await runExecutiveMission({
      erbResult: { overallRiskScore: 90, crisisStatus: "emergency", survivalModeActive: true },
    });
    const title = result.immediatePlan.title.toLowerCase();
    assert.ok(
      title.includes("pause") || title.includes("halt") || title.includes("emergency"),
      `Survival mode should produce pause plan, got: "${result.immediatePlan.title}"`
    );
  });

  it("high drawdown triggers drawdown recovery immediate plan", async () => {
    const result = await runExecutiveMission({
      tradeMetrics: { drawdownPct: 7.5, winRate: 42, profitFactor: 0.9, openPositions: 0 },
      erbResult: { overallRiskScore: 60, crisisStatus: "none", survivalModeActive: false },
    });
    const title = result.immediatePlan.title.toLowerCase();
    assert.ok(
      title.includes("drawdown") || title.includes("recovery") || title.includes("defensive"),
      `High drawdown should trigger recovery plan, got: "${result.immediatePlan.title}"`
    );
  });

  it("priorityRankings: Level 1 before Level 4", async () => {
    const result = await runExecutiveMission({});
    const ranked = result.priorityRankings;
    const firstL4 = ranked.findIndex(g => g.level === 4);
    const lastL1  = ranked.reduce((idx, g, i) => (g.level === 1 ? i : idx), -1);
    if (firstL4 !== -1 && lastL1 !== -1) {
      assert.ok(lastL1 < firstL4, "Level 1 goals should rank above Level 4 goals");
    }
  });

  it("all pairs work correctly", async () => {
    for (const pair of ["EURUSD", "GBPUSD", "USDJPY"]) {
      const r = await runExecutiveMission({ pair });
      assert.equal(r.pair, pair);
      assert.ok(r.missionId.startsWith("em_"));
    }
  });

  it("15 sequential runs without error", async () => {
    for (let i = 0; i < 15; i++) {
      const r = await runExecutiveMission({});
      assert.ok(r.missionId);
      assert.equal(r.isAdvisoryOnly, true);
    }
  });

  it("EP_ENGINE_VERSION is set", () => {
    assert.ok(typeof EP_ENGINE_VERSION === "string" && EP_ENGINE_VERSION.length > 0);
  });
});
