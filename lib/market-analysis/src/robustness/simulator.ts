/**
 * Self-contained Monte Carlo trade simulator.
 * Does NOT fetch real data — generates synthetic trade outcomes
 * using seeded pseudo-random numbers for reproducibility.
 * Used by all robustness sub-engines.
 */

import type { SimTrade, SimStats } from "./types.js";

const REGIMES = ["trending", "ranging", "volatile", "low_volatility"] as const;
const SESSIONS = ["london", "newyork", "asian"] as const;

/** Seeded LCG pseudo-random (reproducible) */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0xFFFFFFFF;
  };
}

function calcStats(trades: SimTrade[], initialBalance: number): SimStats {
  if (trades.length === 0) {
    return {
      totalTrades: 0, winRate: 0, profitFactor: 0, maxDrawdown: 0,
      expectancy: 0, sharpeRatio: 0, totalPnl: 0, finalBalance: initialBalance,
      avgWin: 0, avgLoss: 0, maxConsecLosses: 0, maxConsecWins: 0, calmarRatio: 0,
    };
  }

  const winners = trades.filter(t => t.won);
  const losers = trades.filter(t => !t.won);
  const winRate = (winners.length / trades.length) * 100;

  const grossProfit = winners.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losers.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;

  const avgWin = winners.length > 0 ? grossProfit / winners.length : 0;
  const avgLoss = losers.length > 0 ? grossLoss / losers.length : 0;
  const expectancy = (winRate / 100) * avgWin - (1 - winRate / 100) * avgLoss;

  // Max drawdown
  let peak = initialBalance;
  let maxDD = 0;
  for (const t of trades) {
    if (t.balance > peak) peak = t.balance;
    const dd = peak > 0 ? ((peak - t.balance) / peak) * 100 : 0;
    if (dd > maxDD) maxDD = dd;
  }

  // Sharpe ratio (annualized, assuming 2 trades/day)
  const pnlPcts = trades.map(t => t.pnlPct);
  const meanPnl = pnlPcts.reduce((s, p) => s + p, 0) / pnlPcts.length;
  const variance = pnlPcts.reduce((s, p) => s + Math.pow(p - meanPnl, 2), 0) / pnlPcts.length;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? (meanPnl / stdDev) * Math.sqrt(252 * 2) : 0;

  // Calmar ratio
  const annualReturn = (trades[trades.length - 1]!.balance - initialBalance) / initialBalance * 100;
  const calmarRatio = maxDD > 0 ? annualReturn / maxDD : 0;

  // Consecutive streaks
  let maxConsecLosses = 0;
  let maxConsecWins = 0;
  let curLoss = 0;
  let curWin = 0;
  for (const t of trades) {
    if (t.won) { curWin++; curLoss = 0; }
    else { curLoss++; curWin = 0; }
    if (curLoss > maxConsecLosses) maxConsecLosses = curLoss;
    if (curWin > maxConsecWins) maxConsecWins = curWin;
  }

  const totalPnl = trades[trades.length - 1]!.balance - initialBalance;
  const finalBalance = trades[trades.length - 1]!.balance;

  return {
    totalTrades: trades.length,
    winRate: Math.round(winRate * 100) / 100,
    profitFactor: Math.round(profitFactor * 1000) / 1000,
    maxDrawdown: Math.round(maxDD * 100) / 100,
    expectancy: Math.round(expectancy * 100) / 100,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    totalPnl: Math.round(totalPnl * 100) / 100,
    finalBalance: Math.round(finalBalance * 100) / 100,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    maxConsecLosses,
    maxConsecWins,
    calmarRatio: Math.round(calmarRatio * 100) / 100,
  };
}

export interface SimConfig {
  initialBalance?: number;
  numTrades?: number;
  baseWinRate?: number;         // 0-100
  rrRatio?: number;             // TP/SL
  riskPerTrade?: number;        // % of balance
  seed?: number;
  // Market condition modifiers
  winRateMultiplier?: number;   // e.g. 0.8 for adverse market
  rrMultiplier?: number;        // e.g. 0.9 if slippage degrades RR
  spreadCostPips?: number;      // additional cost per trade in pips
  missedSignalRate?: number;    // 0-1, fraction of signals skipped
  partialFillRate?: number;     // 0-1, fraction of fill (1.0 = full fill)
  pipValue?: number;            // $ per pip per 0.1 lot (default 10)
}

export function runSimulation(config: SimConfig = {}): { trades: SimTrade[]; stats: SimStats } {
  const initialBalance = config.initialBalance ?? 10_000;
  const numTrades = config.numTrades ?? 200;
  const baseWinRate = config.baseWinRate ?? 52;
  const rrRatio = (config.rrRatio ?? 2.0) * (config.rrMultiplier ?? 1.0);
  const riskPerTrade = config.riskPerTrade ?? 0.75;
  const seed = config.seed ?? 42;
  const winRateMult = config.winRateMultiplier ?? 1.0;
  const spreadCostPips = config.spreadCostPips ?? 0;
  const missedSignalRate = config.missedSignalRate ?? 0;
  const partialFillRate = config.partialFillRate ?? 1.0;
  const pipValue = config.pipValue ?? 10;

  const effectiveWinRate = Math.max(0, Math.min(100, baseWinRate * winRateMult));
  const rng = makeRng(seed);

  const trades: SimTrade[] = [];
  let balance = initialBalance;

  for (let i = 0; i < numTrades; i++) {
    // Skip signal if missed
    if (rng() < missedSignalRate) continue;

    const direction = rng() > 0.5 ? "buy" : "sell";
    const regime = REGIMES[Math.floor(rng() * REGIMES.length)]!;
    const session = SESSIONS[Math.floor(rng() * SESSIONS.length)]!;

    const won = rng() * 100 < effectiveWinRate;

    const riskAmount = balance * (riskPerTrade / 100) * partialFillRate;
    const spreadCost = spreadCostPips * pipValue * 0.1 * partialFillRate;

    let pnl: number;
    if (won) {
      // Win: gain = riskAmount * rrRatio, minus spread cost
      pnl = riskAmount * rrRatio - spreadCost;
    } else {
      // Loss: lose riskAmount, minus spread cost
      pnl = -(riskAmount + spreadCost);
    }

    balance = Math.max(balance + pnl, 1);
    const pnlPct = (pnl / initialBalance) * 100;

    trades.push({
      id: i + 1,
      direction,
      pnl: Math.round(pnl * 100) / 100,
      pnlPct: Math.round(pnlPct * 1000) / 1000,
      rr: won ? rrRatio : -1,
      won,
      balance: Math.round(balance * 100) / 100,
      regime,
      session,
    });
  }

  return { trades, stats: calcStats(trades, initialBalance) };
}

/** Run N independent simulations and return aggregate stats (mean + stdDev) */
export function runMonteCarlo(config: SimConfig, runs: number): {
  meanStats: SimStats;
  stdDevStats: Partial<SimStats>;
  allStats: SimStats[];
} {
  const allStats: SimStats[] = [];
  for (let i = 0; i < runs; i++) {
    const { stats } = runSimulation({ ...config, seed: (config.seed ?? 42) + i });
    allStats.push(stats);
  }

  const fields: (keyof SimStats)[] = [
    "winRate", "profitFactor", "maxDrawdown", "expectancy",
    "sharpeRatio", "totalPnl", "finalBalance",
  ];

  const meanStats = { ...allStats[0]! };
  const stdDevStats: Partial<SimStats> = {};

  for (const field of fields) {
    const values = allStats.map(s => s[field] as number);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
    (meanStats as any)[field] = Math.round(mean * 100) / 100;
    (stdDevStats as any)[field] = Math.round(Math.sqrt(variance) * 100) / 100;
  }

  meanStats.totalTrades = allStats[0]!.totalTrades;

  return { meanStats, stdDevStats, allStats };
}

export { calcStats };
