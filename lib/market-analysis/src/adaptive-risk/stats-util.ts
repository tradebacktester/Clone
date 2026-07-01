// ─── Shared Stats Utilities ───────────────────────────────────────────────────

import type { TradeRecord, EnvironmentStats } from "./types.js";
import { MIN_SAMPLE_SIZE } from "./types.js";

export function computeBaseStats(trades: TradeRecord[]): Omit<EnvironmentStats, "environment" | "environmentKey" | "riskRating" | "riskScore"> {
  const n = trades.length;
  if (n === 0) {
    return {
      sampleSize: 0, winRate: 0, expectancy: 0, avgRR: 0,
      avgPnl: 0, totalPnl: 0, maxDrawdown: 0, sharpeProxy: 0,
      profitFactor: 0, volatilityScore: 0, confidenceScore: 0, breakdown: {},
    };
  }

  const pnls    = trades.map(t => t.pnl);
  const wins    = pnls.filter(p => p > 0);
  const losses  = pnls.filter(p => p <= 0);
  const winRate = wins.length / n;
  const totalPnl = pnls.reduce((s, p) => s + p, 0);
  const avgPnl   = totalPnl / n;
  const avgWin   = wins.length  ? wins.reduce((s, p) => s + p, 0)  / wins.length  : 0;
  const avgLoss  = losses.length ? Math.abs(losses.reduce((s, p) => s + p, 0)) / losses.length : 0;
  const avgRR    = trades.map(t => t.riskRewardRatio ?? 0).reduce((s, v) => s + v, 0) / n;

  const expectancy   = winRate * avgWin - (1 - winRate) * avgLoss;
  const profitFactor = avgLoss > 0 ? (winRate * avgWin) / ((1 - winRate) * avgLoss) : winRate > 0 ? 5 : 0;

  // Drawdown simulation
  let peak = 0, equity = 0, maxDd = 0;
  for (const p of pnls) {
    equity += p;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);
  }
  const maxDrawdown = peak > 0 ? (maxDd / peak) * 100 : 0;

  // Sharpe proxy (mean / stdev of pnls)
  const mean   = avgPnl;
  const stdev  = Math.sqrt(pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / n);
  const sharpeProxy  = stdev > 0 ? mean / stdev : 0;
  const volatilityScore = mean !== 0 ? Math.abs(stdev / mean) : 1;

  // Confidence: 0-100, grows with sample size
  const sampleFactor  = Math.min(1, n / 50);
  const winFactor     = winRate > 0.5 ? winRate : 0.5 - (0.5 - winRate) * 0.5;
  const confidenceScore = Math.round(sampleFactor * 70 + winFactor * 20 + Math.min(10, profitFactor * 2));

  return {
    sampleSize: n,
    winRate:    Math.round(winRate * 1000) / 1000,
    expectancy: Math.round(expectancy * 100) / 100,
    avgRR:      Math.round(avgRR * 100) / 100,
    avgPnl:     Math.round(avgPnl * 100) / 100,
    totalPnl:   Math.round(totalPnl * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 10) / 10,
    sharpeProxy: Math.round(sharpeProxy * 100) / 100,
    profitFactor: Math.round(profitFactor * 100) / 100,
    volatilityScore: Math.round(volatilityScore * 100) / 100,
    confidenceScore,
    breakdown: { winRate, expectancy, avgRR, profitFactor, maxDrawdown, sharpeProxy },
  };
}

export function toRiskRating(score: number): "favorable" | "neutral" | "unfavorable" | "avoid" {
  if (score >= 70) return "favorable";
  if (score >= 50) return "neutral";
  if (score >= 30) return "unfavorable";
  return "avoid";
}

// Weighted average across multiple environment stats
export function weightedRiskScore(stats: Array<{ riskScore: number; sampleSize: number }>): number {
  const totalSamples = stats.reduce((s, v) => s + v.sampleSize, 0);
  if (totalSamples === 0) return 50;
  return stats.reduce((s, v) => s + v.riskScore * (v.sampleSize / totalSamples), 0);
}

// Wilson score confidence interval lower bound (binary proportion)
export function wilsonLowerBound(wins: number, n: number, z = 1.96): number {
  if (n === 0) return 0;
  const phat = wins / n;
  const denom = 1 + z * z / n;
  const centre = phat + z * z / (2 * n);
  const margin = z * Math.sqrt(phat * (1 - phat) / n + z * z / (4 * n * n));
  return Math.max(0, (centre - margin) / denom);
}

// Statistical significance proxy (t-test surrogate)
export function statisticalSignificance(trades: TradeRecord[]): number {
  if (trades.length < MIN_SAMPLE_SIZE) return 0;
  const pnls  = trades.map(t => t.pnl);
  const n     = pnls.length;
  const mean  = pnls.reduce((s, p) => s + p, 0) / n;
  const stdev = Math.sqrt(pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / n);
  if (stdev === 0) return 1;
  const t = (mean / stdev) * Math.sqrt(n);
  // Approximate p-value proxy: 0-1 increasing with t-stat
  return Math.min(1, Math.abs(t) / 3.5);
}
