import type { ConditionStats, TradeRecord } from "./types.js";
import { MIN_SAMPLE_FOR_SCORE } from "./types.js";

function wilsonScore(wins: number, n: number, z = 1.645): number {
  if (n === 0) return 0;
  const p = wins / n;
  const denom = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return Math.round(((center - spread) / denom) * 100);
}

function computeMaxDrawdown(trades: TradeRecord[]): number {
  if (trades.length === 0) return 0;
  let equity = 0;
  let peak = 0;
  let maxDD = 0;
  for (const t of trades) {
    equity += t.pnl;
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (dd > maxDD) maxDD = dd;
  }
  return Math.round(maxDD * 100) / 100;
}

function groupStats(trades: TradeRecord[], key: (t: TradeRecord) => string | null): ConditionStats[] {
  const groups = new Map<string, TradeRecord[]>();
  for (const t of trades) {
    const k = key(t);
    if (k == null) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }

  const results: ConditionStats[] = [];
  for (const [condition, group] of groups) {
    const wins = group.filter(t => t.isWin);
    const losses = group.filter(t => t.isLoss);
    const n = group.length;
    const winRate = n > 0 ? (wins.length / n) * 100 : 0;
    const lossRate = n > 0 ? (losses.length / n) * 100 : 0;

    const avgRR = n > 0 ? group.reduce((s, t) => s + t.riskRewardRatio, 0) / n : 0;

    const grossProfit = wins.reduce((s, t) => s + Math.abs(t.pnl), 0);
    const grossLoss = losses.reduce((s, t) => s + Math.abs(t.pnl), 0);
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 1;

    const avgWinRR = wins.length > 0 ? wins.reduce((s, t) => s + t.riskRewardRatio, 0) / wins.length : 0;
    const avgLossRR = losses.length > 0 ? losses.reduce((s, t) => s + Math.abs(t.riskRewardRatio), 0) / losses.length : 1;
    const expectancy = (winRate / 100) * avgWinRR - (lossRate / 100) * avgLossRR;

    const maxDrawdown = computeMaxDrawdown(group);
    const confidenceScore = wilsonScore(wins.length, n);

    results.push({
      dimension: "unknown",
      condition,
      sampleSize: n,
      winRate: Math.round(winRate * 100) / 100,
      lossRate: Math.round(lossRate * 100) / 100,
      avgRR: Math.round(avgRR * 1000) / 1000,
      profitFactor: Math.round(profitFactor * 1000) / 1000,
      expectancy: Math.round(expectancy * 1000) / 1000,
      maxDrawdown,
      confidenceScore,
    });
  }
  return results;
}

export function analyzeByRegime(trades: TradeRecord[]): ConditionStats[] {
  return groupStats(trades, t => t.regime).map(s => ({ ...s, dimension: "regime" }));
}

export function analyzeBySession(trades: TradeRecord[]): ConditionStats[] {
  return groupStats(trades, t => t.session || null).map(s => ({ ...s, dimension: "session" }));
}

export function analyzeByTrendDirection(trades: TradeRecord[]): ConditionStats[] {
  return groupStats(trades, t => t.trendDirection ?? null).map(s => ({ ...s, dimension: "trend" }));
}

export function analyzeByVolatility(trades: TradeRecord[]): ConditionStats[] {
  return groupStats(trades, t => t.volatilityClass ?? null).map(s => ({ ...s, dimension: "volatility" }));
}

export function analyzeByLiquidity(trades: TradeRecord[]): ConditionStats[] {
  return groupStats(trades, t => t.liquidityQuality ?? null).map(s => ({ ...s, dimension: "liquidity" }));
}

export function analyzeByCorrelation(trades: TradeRecord[]): ConditionStats[] {
  return groupStats(trades, t => t.correlationRisk ?? null).map(s => ({ ...s, dimension: "correlation" }));
}

export function analyzeByNewsStatus(trades: TradeRecord[]): ConditionStats[] {
  return groupStats(trades, t => t.newsStatus || null).map(s => ({ ...s, dimension: "news" }));
}

export function analyzeByDayOfWeek(trades: TradeRecord[]): ConditionStats[] {
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return groupStats(trades, t => days[t.openedAt.getUTCDay()] ?? null).map(s => ({ ...s, dimension: "day_of_week" }));
}

export function analyzeByMonth(trades: TradeRecord[]): ConditionStats[] {
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  return groupStats(trades, t => months[t.openedAt.getUTCMonth()] ?? null).map(s => ({ ...s, dimension: "month" }));
}

export function analyzeBySpreadBand(trades: TradeRecord[]): ConditionStats[] {
  return groupStats(trades, t => {
    if (t.spreadPips <= 0.5) return "tight_spread";
    if (t.spreadPips <= 1.5) return "normal_spread";
    if (t.spreadPips <= 3.0) return "wide_spread";
    return "very_wide_spread";
  }).map(s => ({ ...s, dimension: "spread" }));
}

export function analyzePerformance(trades: TradeRecord[]): ConditionStats[] {
  const closed = trades.filter(t => t.closedAt != null);
  if (closed.length === 0) return [];

  return [
    ...analyzeByRegime(closed),
    ...analyzeBySession(closed),
    ...analyzeByTrendDirection(closed),
    ...analyzeByVolatility(closed),
    ...analyzeByLiquidity(closed),
    ...analyzeByCorrelation(closed),
    ...analyzeByNewsStatus(closed),
    ...analyzeByDayOfWeek(closed),
    ...analyzeByMonth(closed),
    ...analyzeBySpreadBand(closed),
  ];
}

export function findStatForCondition(
  allStats: ConditionStats[],
  dimension: string,
  condition: string,
): ConditionStats | null {
  return allStats.find(s => s.dimension === dimension && s.condition === condition) ?? null;
}

export function overallStats(trades: TradeRecord[]): ConditionStats {
  const closed = trades.filter(t => t.closedAt != null);
  const n = closed.length;
  const wins = closed.filter(t => t.isWin);
  const losses = closed.filter(t => t.isLoss);
  const winRate = n > 0 ? (wins.length / n) * 100 : 0;
  const lossRate = n > 0 ? (losses.length / n) * 100 : 0;
  const avgRR = n > 0 ? closed.reduce((s, t) => s + t.riskRewardRatio, 0) / n : 0;
  const grossProfit = wins.reduce((s, t) => s + Math.abs(t.pnl), 0);
  const grossLoss = losses.reduce((s, t) => s + Math.abs(t.pnl), 0);
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 1;
  const avgWinRR = wins.length > 0 ? wins.reduce((s, t) => s + t.riskRewardRatio, 0) / wins.length : 0;
  const avgLossRR = losses.length > 0 ? losses.reduce((s, t) => s + Math.abs(t.riskRewardRatio), 0) / losses.length : 1;
  const expectancy = (winRate / 100) * avgWinRR - (lossRate / 100) * avgLossRR;
  return {
    dimension: "overall",
    condition: "all",
    sampleSize: n,
    winRate: Math.round(winRate * 100) / 100,
    lossRate: Math.round(lossRate * 100) / 100,
    avgRR: Math.round(avgRR * 1000) / 1000,
    profitFactor: Math.round(profitFactor * 1000) / 1000,
    expectancy: Math.round(expectancy * 1000) / 1000,
    maxDrawdown: computeMaxDrawdown(closed),
    confidenceScore: wilsonScore(wins.length, n),
  };
}

export { wilsonScore, MIN_SAMPLE_FOR_SCORE };
