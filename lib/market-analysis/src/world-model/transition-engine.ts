// ─── Market Transition Engine ─────────────────────────────────────────────────
// Detects and analyses market state transitions.
// Tracks: trending ↔ ranging, compression ↔ expansion, high ↔ low liquidity.
// Observational only — no trade execution, no strategy modification.

import type {
  MarketTransitionStats,
  TransitionCategory,
  TransitionEvidence,
  WorldModelFeatureRow,
  ActiveTransition,
} from "./types.js";

// ─── Known Transitions ────────────────────────────────────────────────────────

export interface TransitionDefinition {
  from: string;
  to: string;
  category: TransitionCategory;
  label: string;
}

export const KNOWN_TRANSITIONS: TransitionDefinition[] = [
  // Regime
  { from: "trending",     to: "ranging",      category: "regime",     label: "Trending → Ranging" },
  { from: "ranging",      to: "trending",      category: "regime",     label: "Ranging → Trending" },
  { from: "volatile",     to: "trending",      category: "regime",     label: "Volatile → Trending" },
  { from: "trending",     to: "volatile",      category: "regime",     label: "Trending → Volatile" },
  { from: "low_volatility", to: "trending",   category: "regime",     label: "Low Vol → Trending" },
  { from: "low_volatility", to: "volatile",   category: "regime",     label: "Low Vol → Volatile" },
  // Volatility
  { from: "compression",  to: "expansion",    category: "volatility", label: "Compression → Expansion" },
  { from: "expansion",    to: "compression",  category: "volatility", label: "Expansion → Compression" },
  { from: "stable",       to: "expansion",    category: "volatility", label: "Stable → Expansion" },
  { from: "expansion",    to: "stable",       category: "volatility", label: "Expansion → Stable" },
  // Liquidity
  { from: "high",         to: "low",          category: "liquidity",  label: "High Liquidity → Low" },
  { from: "low",          to: "high",         category: "liquidity",  label: "Low Liquidity → High" },
  { from: "normal",       to: "low",          category: "liquidity",  label: "Normal → Low Liquidity" },
  { from: "low",          to: "normal",       category: "liquidity",  label: "Low → Normal Liquidity" },
];

// ─── State Classifiers ────────────────────────────────────────────────────────

function classifyRegime(row: WorldModelFeatureRow): string {
  const r = row.marketRegime?.toLowerCase() ?? "unknown";
  if (r.includes("trend")) return "trending";
  if (r.includes("rang")) return "ranging";
  if (r.includes("volatil") && !r.includes("low")) return "volatile";
  if (r.includes("low")) return "low_volatility";
  return "ranging";
}

function classifyVolatility(row: WorldModelFeatureRow): string {
  const v = row.volatility?.toLowerCase() ?? "medium";
  if (v === "low") return "compression";
  if (v === "high") return "expansion";
  return "stable";
}

function classifyLiquidity(row: WorldModelFeatureRow): string {
  const score = row.liquidityScore;
  if (score >= 70) return "high";
  if (score <= 30) return "low";
  return "normal";
}

function classifyState(row: WorldModelFeatureRow, category: TransitionCategory): string {
  if (category === "regime") return classifyRegime(row);
  if (category === "volatility") return classifyVolatility(row);
  return classifyLiquidity(row);
}

// ─── Transition Detection ─────────────────────────────────────────────────────

interface RawTransitionEvent {
  pair: string;
  category: TransitionCategory;
  fromState: string;
  toState: string;
  observedAt: Date;
  durationBars: number;
  outcomeQuality: number;
  triggers: string[];
}

export function detectTransitions(
  features: WorldModelFeatureRow[],
): RawTransitionEvent[] {
  if (features.length < 2) return [];

  const events: RawTransitionEvent[] = [];
  const categories: TransitionCategory[] = ["regime", "volatility", "liquidity"];

  for (const cat of categories) {
    let prevState = classifyState(features[0], cat);
    let runStart = 0;

    for (let i = 1; i < features.length; i++) {
      const currState = classifyState(features[i], cat);

      if (currState !== prevState) {
        const durationBars = i - runStart;
        const row = features[i];

        // Compute a simple "trade quality" from the outcome rows around the transition
        const window = features.slice(Math.max(0, i - 3), Math.min(features.length, i + 3));
        const wins = window.filter(r => r.outcome === "win").length;
        const outcomeQuality = window.length > 0 ? (wins / window.length) * 100 : 50;

        // Identify trigger components (simplified heuristic)
        const triggers: string[] = [];
        if (row.amdScore > 70) triggers.push("amd_completion");
        if (row.liquidityScore < 30 || row.liquidityScore > 80) triggers.push("liquidity");
        if (row.spreadPips > 5) triggers.push("spread");
        if (triggers.length === 0) triggers.push(cat);

        events.push({
          pair: row.pair,
          category: cat,
          fromState: prevState,
          toState: currState,
          observedAt: row.entryTime,
          durationBars,
          outcomeQuality,
          triggers,
        });

        prevState = currState;
        runStart = i;
      }
    }
  }

  return events;
}

// ─── Transition Statistics ─────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function computeTransitionStats(
  events: RawTransitionEvent[],
): MarketTransitionStats[] {
  if (events.length === 0) return [];

  const now = new Date();

  // Group events by (from, to, category)
  const groups = new Map<string, RawTransitionEvent[]>();
  for (const ev of events) {
    const key = `${ev.category}|${ev.fromState}|${ev.toState}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ev);
  }

  // Total events per category for probability denominator
  const categoryTotals = new Map<string, number>();
  for (const ev of events) {
    categoryTotals.set(ev.category, (categoryTotals.get(ev.category) ?? 0) + 1);
  }

  const stats: MarketTransitionStats[] = [];

  for (const [key, group] of groups.entries()) {
    const [category, fromState, toState] = key.split("|") as [TransitionCategory, string, string];
    const n = group.length;
    const totalForCategory = categoryTotals.get(category) ?? 1;
    const durations = group.map(e => e.durationBars);
    const qualities = group.map(e => e.outcomeQuality);

    const avgDuration = durations.reduce((a, b) => a + b, 0) / n;
    const medianDuration = median(durations);
    const avgQuality = qualities.reduce((a, b) => a + b, 0) / n;
    const transitionProb = n / totalForCategory;

    // Confidence: higher with more samples; caps at 95
    const confidence = Math.min(95, 40 + (n / 20) * 30 + (1 - Math.abs(0.5 - transitionProb)) * 25);

    // Sample up to 5 evidence items
    const evidence: TransitionEvidence[] = group.slice(0, 5).map(ev => ({
      pair: ev.pair,
      observedAt: ev.observedAt.toISOString(),
      durationBars: ev.durationBars,
      outcomeQuality: ev.outcomeQuality,
      triggers: ev.triggers,
    }));

    stats.push({
      fromState,
      toState,
      transitionCategory: category,
      transitionProbability: parseFloat(transitionProb.toFixed(4)),
      avgDurationBars: parseFloat(avgDuration.toFixed(2)),
      medianDurationBars: parseFloat(medianDuration.toFixed(2)),
      historicalFrequency: n,
      confidence: parseFloat(confidence.toFixed(2)),
      avgOutcomeQuality: parseFloat(avgQuality.toFixed(2)),
      supportingEvidence: evidence,
      computedAt: now,
    });
  }

  // Sort by historical frequency descending
  stats.sort((a, b) => b.historicalFrequency - a.historicalFrequency);
  return stats;
}

// ─── Active Transition Detection ─────────────────────────────────────────────

export function detectActiveTransitions(
  recentFeatures: WorldModelFeatureRow[], // last N bars
  allStats: MarketTransitionStats[],
): ActiveTransition[] {
  if (recentFeatures.length < 3) return [];

  const active: ActiveTransition[] = [];
  const categories: TransitionCategory[] = ["regime", "volatility", "liquidity"];

  for (const cat of categories) {
    const states = recentFeatures.map(f => classifyState(f, cat));
    const lastState = states[states.length - 1];
    const prevState = states[0];

    if (lastState === prevState) continue;

    // Find how many bars this transition has been in progress
    let barsInProgress = 0;
    for (let i = states.length - 1; i >= 0; i--) {
      if (states[i] === lastState) barsInProgress++;
      else break;
    }

    // Find matching stats
    const matchingStats = allStats.find(
      s => s.fromState === prevState && s.toState === lastState && s.transitionCategory === cat,
    );

    const expectedDuration = matchingStats?.avgDurationBars ?? 10;
    const progressPercent = Math.min(100, (barsInProgress / expectedDuration) * 100);
    const probability = matchingStats?.transitionProbability ?? 0.3;

    active.push({
      category: cat,
      fromState: prevState,
      toState: lastState,
      progressPercent: parseFloat(progressPercent.toFixed(1)),
      barsInProgress,
      probability,
    });
  }

  return active;
}
