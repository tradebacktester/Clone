// ─── Executive Planning Engine — Orchestrator ─────────────────────────────────
// Phase 7.4

import { randomUUID } from "crypto";
import {
  EP_ENGINE_VERSION,
  type ExecutiveMission,
  type RunMissionInput,
} from "./types.js";
import { generateAllGoals }                     from "./goal-generator.js";
import { prioritizeGoals }                      from "./goal-prioritizer.js";
import { detectAndResolveConflicts }            from "./conflict-resolver.js";
import { generateAllPlans }                     from "./planning-engine.js";
import { trackGoalProgress, computeMissionHealth } from "./progress-tracker.js";

// ── Re-exports ──────────────────────────────────────────────────────────────

export { EP_ENGINE_VERSION }                    from "./types.js";
export type {
  ExecutiveMission,
  RunMissionInput,
  Goal,
  GoalLevel,
  GoalLevelName,
  GoalStatus,
  GoalCategory,
  GoalConflict,
  ConflictType,
  ExecutivePlan,
  PlanHorizon,
  PlanAction,
  GoalProgress,
  MissionHealth,
  MissionHealthStatus,
}                                               from "./types.js";
export { GOAL_LEVEL_LABELS, GOAL_LEVEL_NAMES }  from "./types.js";
export { generateAllGoals }                     from "./goal-generator.js";
export { prioritizeGoals }                      from "./goal-prioritizer.js";
export { detectAndResolveConflicts }            from "./conflict-resolver.js";
export { generateAllPlans }                     from "./planning-engine.js";
export { trackGoalProgress, computeMissionHealth } from "./progress-tracker.js";

function n(v: unknown, fallback = 50): number {
  const num = Number(v);
  return isFinite(num) ? num : fallback;
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

export async function runExecutiveMission(
  input: RunMissionInput = {}
): Promise<ExecutiveMission> {
  const startedAt = Date.now();
  const {
    pair         = "EURUSD",
    timeframe    = "15m",
    strategyResult = null,
    erbResult      = null,
    tradeMetrics   = {},
  } = input;

  const missionId = `em_${randomUUID().slice(0, 12)}`;

  // ── Extract intelligence scores ───────────────────────────────────────────
  const stratR = (strategyResult ?? {}) as Record<string, unknown>;
  const erbR   = (erbResult      ?? {}) as Record<string, unknown>;

  const executiveScore = n(stratR.executiveScore,     55);
  const strategyScore  = n(stratR.strategyStrength,   50);
  const riskScore      = n(erbR.overallRiskScore,     35);
  const marketScore    = n((erbR.market as any)?.healthScore, 55);
  const crisisStatus   = String(erbR.crisisStatus ?? "none");
  const survivalMode   = Boolean(erbR.survivalModeActive);

  const drawdownPct   = n(tradeMetrics.drawdownPct,   0);
  const winRate       = n(tradeMetrics.winRate,        55);
  const profitFactor  = n(tradeMetrics.profitFactor,  1.2);
  const openPositions = n(tradeMetrics.openPositions, 0);

  const intelligenceSnapshot = {
    executiveScore,
    riskScore,
    drawdownPct,
    winRate,
    profitFactor,
    openPositions,
    crisisStatus,
    survivalMode,
  };

  // ── Stage 1: Generate all goals ───────────────────────────────────────────
  const allGoals = generateAllGoals({
    executiveScore, strategyScore, riskScore, marketScore,
    drawdownPct, winRate, profitFactor, openPositions,
    crisisStatus, survivalMode,
  });

  // ── Stage 2: Prioritize ───────────────────────────────────────────────────
  const ranked = prioritizeGoals(allGoals);

  // ── Stage 3: Detect & resolve conflicts ───────────────────────────────────
  const conflicts = detectAndResolveConflicts(ranked);

  // ── Stage 4: Generate 4-horizon plans ─────────────────────────────────────
  const plans = generateAllPlans({
    topGoals:      ranked,
    executiveScore, riskScore, drawdownPct,
    survivalMode, crisisStatus, winRate, profitFactor,
  });

  const [immediatePlan, shortTermPlan, mediumTermPlan, longTermPlan] = plans;

  // ── Stage 5: Progress tracking ────────────────────────────────────────────
  const progressReports = trackGoalProgress(ranked);

  // ── Stage 6: Mission health ───────────────────────────────────────────────
  const missionHealth = computeMissionHealth(ranked, conflicts);

  const activeGoals      = ranked.filter(g => g.status === "active");
  const permanentMission = ranked.filter(g => g.level === 1);

  const supportingEvidence = [
    `Mission health: ${missionHealth.status} (${missionHealth.overallScore.toFixed(0)}/100)`,
    `Active goals: ${activeGoals.length} — ${conflicts.length} conflict(s) detected and resolved`,
    `Immediate action: ${immediatePlan.title}`,
    `Risk posture: ${riskScore >= 65 ? "defensive" : riskScore >= 40 ? "balanced" : "opportunistic"}`,
    `Permanent mission adherence: ${missionHealth.level1Adherence.toFixed(0)}/100`,
  ];

  const confidence = Math.round(
    (missionHealth.overallScore * 0.40 + executiveScore * 0.35 + (100 - riskScore) * 0.25)
  );

  const durationMs = Date.now() - startedAt;

  return {
    missionId,
    evaluatedAt:       new Date().toISOString(),
    pair,
    timeframe,
    intelligenceSnapshot,
    goals:             allGoals,
    activeGoals,
    permanentMission,
    priorityRankings:  ranked,
    conflicts,
    plans,
    immediatePlan,
    shortTermPlan,
    mediumTermPlan,
    longTermPlan,
    progressReports,
    missionHealth,
    confidence,
    supportingEvidence,
    isAdvisoryOnly:    true,
    engineVersion:     EP_ENGINE_VERSION,
    durationMs,
  };
}
