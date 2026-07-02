// ─── Goal Prioritizer ─────────────────────────────────────────────────────────
import type { Goal } from "./types.js";

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.min(hi, Math.max(lo, v));
}

// Level weight: Level 1 goals must always rank above Level 2, etc.
// We use a large level bonus to ensure ordering by level first, then by priority within level.
const LEVEL_WEIGHT: Record<number, number> = {
  1: 1000,
  2: 500,
  3: 250,
  4: 0,
};

function computeWeightedPriority(g: Goal): number {
  return LEVEL_WEIGHT[g.level] +
    clamp(g.importance * 0.35 + g.urgency * 0.30 + g.expectedImpact * 0.20 + g.riskIfUnmet * 0.15);
}

export function prioritizeGoals(goals: Goal[]): Goal[] {
  // Re-compute priority ensuring level ordering
  const withScores = goals.map(g => ({
    g,
    score: computeWeightedPriority(g),
  }));

  withScores.sort((a, b) => b.score - a.score);
  return withScores.map(x => x.g);
}

// Normalised priority rank (0-100) within each level
export function normalizePriorityWithinLevel(goals: Goal[]): Goal[] {
  const levels = [1, 2, 3, 4] as const;
  const out: Goal[] = [];
  for (const lvl of levels) {
    const grp = goals.filter(g => g.level === lvl);
    const maxP = Math.max(...grp.map(g => g.priority), 1);
    const minP = Math.min(...grp.map(g => g.priority), 0);
    for (const g of grp) {
      const norm = maxP === minP ? 75 : clamp(((g.priority - minP) / (maxP - minP)) * 100);
      out.push({ ...g, priority: Math.round(norm * 10) / 10 });
    }
  }
  return out;
}
