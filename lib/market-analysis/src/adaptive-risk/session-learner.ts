// ─── Session Learner ──────────────────────────────────────────────────────────
// Learns historical performance statistics for each trading session.

import type { TradeRecord, EnvironmentStats, SessionEnv } from "./types.js";
import { computeBaseStats, toRiskRating } from "./stats-util.js";

export const SESSION_KEYS: SessionEnv[] = ["london", "new_york", "asian", "overlap", "off_hours"];

function normaliseSession(raw: string): SessionEnv {
  const lower = (raw ?? "").toLowerCase().replace(/[\s-]/g, "_");
  if (lower.includes("london"))   return "london";
  if (lower.includes("new_york") || lower.includes("newyork") || lower.includes("ny")) return "new_york";
  if (lower.includes("asian") || lower.includes("asia") || lower.includes("tokyo")) return "asian";
  if (lower.includes("overlap")) return "overlap";
  return "off_hours";
}

export function learnBySession(trades: TradeRecord[]): EnvironmentStats[] {
  const buckets = new Map<SessionEnv, TradeRecord[]>();
  for (const t of trades) {
    const k = normaliseSession(t.session ?? "");
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(t);
  }

  return SESSION_KEYS
    .filter(k => (buckets.get(k) ?? []).length > 0)
    .map(key => {
      const group = buckets.get(key)!;
      const base  = computeBaseStats(group);
      const riskScore = deriveSessionRiskScore(base, key);
      return {
        environment:    "session",
        environmentKey: key,
        ...base,
        riskScore,
        riskRating: toRiskRating(riskScore),
      };
    });
}

function deriveSessionRiskScore(
  base: Omit<EnvironmentStats, "environment" | "environmentKey" | "riskRating" | "riskScore">,
  session: SessionEnv,
): number {
  let score = 50;
  score += (base.winRate - 0.4) * 60;
  score += Math.min(15, base.expectancy * 10);
  score -= Math.min(15, base.maxDrawdown * 0.4);

  // Session liquidity/volatility adjustments
  const adj: Record<SessionEnv, number> = {
    london:    10,
    new_york:   8,
    overlap:    3,   // high volatility offset
    asian:     -5,   // lower liquidity
    off_hours: -15,
  };
  score += adj[session];
  return Math.max(0, Math.min(100, Math.round(score)));
}
