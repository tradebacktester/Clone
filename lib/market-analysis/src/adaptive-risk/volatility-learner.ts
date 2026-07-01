// ─── Volatility Learner ───────────────────────────────────────────────────────
// Learns historical performance for each volatility level.

import type { TradeRecord, EnvironmentStats, VolatilityLevel } from "./types.js";
import { computeBaseStats, toRiskRating } from "./stats-util.js";

export const VOLATILITY_KEYS: VolatilityLevel[] = ["low", "normal", "high", "extreme"];

// Classify a trade's volatility level by its risk% and RR ratio as a proxy
// In production this would be tagged by the market's ATR at trade time
function classifyVolatility(t: TradeRecord): VolatilityLevel | null {
  const rr  = t.riskRewardRatio ?? 0;
  const rp  = t.riskPercent ?? 0;
  // Use session + RR as a rough volatility proxy
  if (rr <= 0) return null;
  const session = (t.session ?? "").toLowerCase();
  if (session.includes("overlap") || rp >= 1.5) return "high";
  if (session.includes("london")  || session.includes("new_york")) {
    return rr >= 3 ? "high" : rr >= 2 ? "normal" : "low";
  }
  return "normal";
}

export function learnByVolatility(trades: TradeRecord[]): EnvironmentStats[] {
  const buckets = new Map<VolatilityLevel, TradeRecord[]>();
  for (const t of trades) {
    const k = classifyVolatility(t);
    if (!k) continue;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(t);
  }

  return VOLATILITY_KEYS
    .filter(k => buckets.has(k) && buckets.get(k)!.length > 0)
    .map(key => {
      const group = buckets.get(key)!;
      const base  = computeBaseStats(group);
      const riskScore = deriveVolatilityRiskScore(base, key);
      return {
        environment:    "volatility",
        environmentKey: key,
        ...base,
        riskScore,
        riskRating:     toRiskRating(riskScore),
      };
    });
}

function deriveVolatilityRiskScore(
  base: Omit<EnvironmentStats, "environment" | "environmentKey" | "riskRating" | "riskScore">,
  level: VolatilityLevel,
): number {
  let score = 50;
  score += (base.winRate - 0.4) * 50;
  score += Math.min(15, base.expectancy * 10);
  score -= Math.min(15, base.maxDrawdown * 0.4);
  const adj: Record<VolatilityLevel, number> = {
    low:    15, normal: 5, high: -10, extreme: -25,
  };
  score += adj[level];
  return Math.max(0, Math.min(100, Math.round(score)));
}
