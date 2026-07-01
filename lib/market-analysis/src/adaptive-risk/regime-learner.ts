// ─── Regime Learner ───────────────────────────────────────────────────────────
// Learns historical performance statistics for each market regime.

import type { TradeRecord, EnvironmentStats, MarketRegimeEnv } from "./types.js";
import { computeBaseStats, toRiskRating } from "./stats-util.js";

export const REGIME_KEYS: MarketRegimeEnv[] = [
  "trending", "ranging", "volatile", "low_volatility", "transition", "expansion", "compression",
];

// Normalise raw regime strings from DB
function normaliseRegime(raw: string): MarketRegimeEnv | null {
  const lower = (raw ?? "").toLowerCase().replace(/[^a-z_]/g, "_");
  if (REGIME_KEYS.includes(lower as MarketRegimeEnv)) return lower as MarketRegimeEnv;
  if (lower.includes("trend"))   return "trending";
  if (lower.includes("rang"))    return "ranging";
  if (lower.includes("volat"))   return "volatile";
  if (lower.includes("low"))     return "low_volatility";
  if (lower.includes("trans"))   return "transition";
  if (lower.includes("expan"))   return "expansion";
  if (lower.includes("compr"))   return "compression";
  return null;
}

export function learnByRegime(trades: TradeRecord[]): EnvironmentStats[] {
  const buckets = new Map<string, TradeRecord[]>();
  for (const t of trades) {
    const k = normaliseRegime(t.regime ?? "");
    if (!k) continue;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(t);
  }

  const results: EnvironmentStats[] = [];
  for (const [key, group] of buckets) {
    if (group.length === 0) continue;
    const base = computeBaseStats(group);
    const riskScore = deriveRegimeRiskScore(base, key as MarketRegimeEnv);
    results.push({
      environment:    "regime",
      environmentKey: key,
      ...base,
      riskScore,
      riskRating:     toRiskRating(riskScore),
    });
  }
  return results.sort((a, b) => b.riskScore - a.riskScore);
}

// Regime-specific risk scoring: penalise volatile/transition, reward trending/ranging
function deriveRegimeRiskScore(base: Omit<EnvironmentStats, "environment" | "environmentKey" | "riskRating" | "riskScore">, regime: MarketRegimeEnv): number {
  let score = base.confidenceScore;

  // Favour high win rate & positive expectancy
  score += (base.winRate - 0.4) * 60;
  score += Math.min(20, base.expectancy * 15);
  score -= Math.min(20, base.maxDrawdown * 0.5);

  // Regime-specific adjustment
  const adj: Record<MarketRegimeEnv, number> = {
    trending:      10,
    ranging:        5,
    expansion:      5,
    low_volatility: 0,
    transition:   -10,
    compression:   -5,
    volatile:     -15,
  };
  score += adj[regime] ?? 0;

  return Math.max(0, Math.min(100, Math.round(score)));
}
