// ─── Progress Tracker ─────────────────────────────────────────────────────────
import type { Goal, GoalProgress, MissionHealth, MissionHealthStatus } from "./types.js";

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.min(hi, Math.max(lo, v));
}

function trend(progress: number, urgency: number): GoalProgress["trend"] {
  if (progress >= 90)  return "improving";
  if (urgency >= 80 && progress < 50) return "declining";
  return "stable";
}

function health(g: Goal): GoalProgress["health"] {
  if (g.status === "violated") return "violated";
  if (g.progress >= 85) return "healthy";
  if (g.progress >= 55) return "at_risk";
  if (g.progress >= 30) return "critical";
  return "critical";
}

function nextMilestone(g: Goal): string {
  const pct = g.progress;
  if (pct >= 100)  return "Goal achieved — maintain";
  if (pct >= 75)   return `${(100 - pct).toFixed(0)}% remaining — close to target`;
  if (pct >= 50)   return `Half-way point passed — ${(100 - pct).toFixed(0)}% remaining`;
  if (pct >= 25)   return `25% threshold passed — ${(100 - pct).toFixed(0)}% to go`;
  return `Early stage — focus on ${g.metric} improvement`;
}

export function trackGoalProgress(goals: Goal[]): GoalProgress[] {
  return goals.map(g => ({
    goalId:      g.goalId,
    title:       g.title,
    level:       g.level,
    progress:    g.progress,
    trend:       trend(g.progress, g.urgency),
    velocity:    Math.round(g.urgency * 0.5 * 10) / 10, // estimated R/cycle
    obstacles:   g.obstacles,
    confidence:  g.confidence,
    health:      health(g),
    nextMilestone: nextMilestone(g),
  }));
}

export function computeMissionHealth(goals: Goal[], conflicts: { confidence: number }[]): MissionHealth {
  const level1Goals = goals.filter(g => g.level === 1);
  const allActive   = goals.filter(g => g.status === "active" || g.status === "pending");
  const violated    = goals.filter(g => g.status === "violated");

  // Level 1 adherence: are all permanent mission goals healthy?
  const level1Adherence = violated.some(g => g.level === 1)
    ? 0
    : clamp(level1Goals.reduce((s, g) => s + g.progress, 0) / Math.max(1, level1Goals.length));

  // Goal achievement: what % of active goals have progress >= 60?
  const onTrack          = allActive.filter(g => g.progress >= 60).length;
  const goalAchievement  = clamp((onTrack / Math.max(1, allActive.length)) * 100);

  // Plan consistency: proxy by executive score (confidence in plan)
  const planConsistency  = clamp(allActive.reduce((s, g) => s + g.confidence, 0) / Math.max(1, allActive.length));

  // Conflict resolution quality
  const conflictResolution = conflicts.length === 0
    ? 100
    : clamp(conflicts.reduce((s, c) => s + c.confidence, 0) / conflicts.length);

  const overallScore = clamp(
    level1Adherence    * 0.40 +
    goalAchievement    * 0.30 +
    planConsistency    * 0.20 +
    conflictResolution * 0.10
  );

  let status: MissionHealthStatus;
  if (violated.some(g => g.level === 1)) status = "violated";
  else if (overallScore >= 85)            status = "optimal";
  else if (overallScore >= 70)            status = "healthy";
  else if (overallScore >= 50)            status = "degraded";
  else                                    status = "critical";

  const breakdown: string[] = [
    `Level 1 adherence: ${level1Adherence.toFixed(0)}/100`,
    `Goal achievement: ${goalAchievement.toFixed(0)}/100 (${onTrack}/${allActive.length} on track)`,
    `Plan consistency: ${planConsistency.toFixed(0)}/100`,
    `Conflict resolution: ${conflictResolution.toFixed(0)}/100 (${conflicts.length} conflicts)`,
  ];

  return {
    overallScore:       Math.round(overallScore * 10) / 10,
    status,
    level1Adherence:    Math.round(level1Adherence * 10) / 10,
    goalAchievement:    Math.round(goalAchievement * 10) / 10,
    planConsistency:    Math.round(planConsistency * 10) / 10,
    conflictResolution: Math.round(conflictResolution * 10) / 10,
    breakdown,
  };
}
