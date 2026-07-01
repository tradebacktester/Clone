// ─── Pair Profiler ────────────────────────────────────────────────────────────
// Builds individual performance profiles for every supported pair.

import type { TradeRecord, EnvironmentStats } from "./types.js";
import { computeBaseStats, toRiskRating } from "./stats-util.js";

export const SUPPORTED_PAIRS = ["EURUSD", "GBPUSD", "USDJPY"] as const;

function normalisePair(raw: string): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z]/g, "");
}

export function profileByPair(trades: TradeRecord[]): EnvironmentStats[] {
  const buckets = new Map<string, TradeRecord[]>();
  for (const t of trades) {
    const k = normalisePair(t.pair);
    if (!k) continue;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(t);
  }

  const results: EnvironmentStats[] = [];
  for (const [key, group] of buckets) {
    if (group.length === 0) continue;
    const base      = computeBaseStats(group);
    const riskScore = derivePairRiskScore(base);
    results.push({
      environment:    "pair",
      environmentKey: key,
      ...base,
      riskScore,
      riskRating: toRiskRating(riskScore),
    });
  }
  return results.sort((a, b) => b.riskScore - a.riskScore);
}

function derivePairRiskScore(
  base: Omit<EnvironmentStats, "environment" | "environmentKey" | "riskRating" | "riskScore">,
): number {
  let score = 50;
  score += (base.winRate - 0.4) * 70;
  score += Math.min(20, base.expectancy * 15);
  score -= Math.min(20, base.maxDrawdown * 0.5);
  score += Math.min(10, base.sharpeProxy * 5);
  return Math.max(0, Math.min(100, Math.round(score)));
}
