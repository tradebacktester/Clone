// ─── Liquidity & Condition Learner ────────────────────────────────────────────
// Learns performance by liquidity level and market condition.

import type { TradeRecord, EnvironmentStats, LiquidityLevel, MarketCondition } from "./types.js";
import { computeBaseStats, toRiskRating } from "./stats-util.js";

// ─── Liquidity ────────────────────────────────────────────────────────────────

function classifyLiquidity(t: TradeRecord): LiquidityLevel {
  const session = (t.session ?? "").toLowerCase();
  if (session.includes("london") || session.includes("new_york")) return "high";
  if (session.includes("overlap")) return "high";
  if (session.includes("asian")) return "medium";
  return "low";
}

export function learnByLiquidity(trades: TradeRecord[]): EnvironmentStats[] {
  const keys: LiquidityLevel[] = ["high", "medium", "low"];
  const buckets = new Map<LiquidityLevel, TradeRecord[]>();
  for (const t of trades) {
    const k = classifyLiquidity(t);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(t);
  }

  return keys
    .filter(k => (buckets.get(k) ?? []).length > 0)
    .map(key => {
      const base = computeBaseStats(buckets.get(key)!);
      const adj: Record<LiquidityLevel, number> = { high: 10, medium: 0, low: -15 };
      let score = 50 + (base.winRate - 0.4) * 60 + Math.min(10, base.expectancy * 8) - Math.min(10, base.maxDrawdown * 0.3) + adj[key];
      score = Math.max(0, Math.min(100, Math.round(score)));
      return { environment: "liquidity", environmentKey: key, ...base, riskScore: score, riskRating: toRiskRating(score) };
    });
}

// ─── Market Condition ─────────────────────────────────────────────────────────

function classifyCondition(t: TradeRecord): MarketCondition {
  const regime  = (t.regime  ?? "").toLowerCase();
  const session = (t.session ?? "").toLowerCase();
  if (regime.includes("volat") || session.includes("overlap")) return "trending_high_momentum";
  if (regime.includes("trend")) return "trending_low_momentum";
  if (regime.includes("rang"))  return "ranging_stable";
  return "normal";
}

export function learnByCondition(trades: TradeRecord[]): EnvironmentStats[] {
  const buckets = new Map<string, TradeRecord[]>();
  for (const t of trades) {
    const k = classifyCondition(t);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(t);
  }

  const results: EnvironmentStats[] = [];
  for (const [key, group] of buckets) {
    if (group.length === 0) continue;
    const base  = computeBaseStats(group);
    let score = 50 + (base.winRate - 0.4) * 65 + Math.min(15, base.expectancy * 10) - Math.min(15, base.maxDrawdown * 0.4);
    score = Math.max(0, Math.min(100, Math.round(score)));
    results.push({ environment: "condition", environmentKey: key, ...base, riskScore: score, riskRating: toRiskRating(score) });
  }
  return results;
}
