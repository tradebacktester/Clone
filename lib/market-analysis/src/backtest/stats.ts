import type { BacktestTrade } from "../types.js";

export interface SessionStats {
  session: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
  avgRR: number;
  profitFactor: number;
  expectancy: number;
}

export interface PairStats {
  pair: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
  avgRR: number;
  profitFactor: number;
  expectancy: number;
}

export interface ZoneCategoryStats {
  category: "demand_zone" | "supply_zone" | "liquidity" | "amd" | "confirmation";
  label: string;
  trades: number;
  wins: number;
  winRate: number;
  avgPnl: number;
  avgScore: number;
  contribution: number;
}

export interface MonthlyReturn {
  year: number;
  month: number;
  label: string;
  trades: number;
  pnl: number;
  returnPct: number;
  winRate: number;
}

export interface YearlyReturn {
  year: number;
  trades: number;
  pnl: number;
  returnPct: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
}

export interface RegimeStats {
  regime: "trending" | "ranging" | "volatile" | "low_volatility" | "unknown";
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
  profitFactor: number;
  expectancy: number;
  avgRR: number;
}

export interface BacktestStats {
  expectancy: number;
  avgRR: number;
  avgWin: number;
  avgLoss: number;
  maxConsecWins: number;
  maxConsecLosses: number;
  sessionStats: SessionStats[];
  pairStats: PairStats[];
  zoneStats: ZoneCategoryStats[];
  monthlyReturns: MonthlyReturn[];
  yearlyReturns: YearlyReturn[];
  regimeStats: RegimeStats[];
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function calcGroupStats(trades: BacktestTrade[]): {
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
  avgRR: number;
  profitFactor: number;
  expectancy: number;
} {
  if (trades.length === 0) {
    return { wins: 0, losses: 0, winRate: 0, totalPnl: 0, avgPnl: 0, avgRR: 0, profitFactor: 0, expectancy: 0 };
  }

  const winners = trades.filter(t => t.pnl > 0);
  const losers = trades.filter(t => t.pnl <= 0);

  const winRate = (winners.length / trades.length) * 100;
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const avgPnl = totalPnl / trades.length;
  const avgRR = trades.reduce((s, t) => s + (t.riskRewardRatio ?? 0), 0) / trades.length;

  const grossWin = winners.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losers.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 9.99 : 0;

  const avgWin = winners.length > 0 ? grossWin / winners.length : 0;
  const avgLoss = losers.length > 0 ? grossLoss / losers.length : 0;
  const lossRate = losers.length / trades.length;
  const expectancy = (winRate / 100) * avgWin - lossRate * avgLoss;

  return {
    wins: winners.length,
    losses: losers.length,
    winRate: r2(winRate),
    totalPnl: r2(totalPnl),
    avgPnl: r2(avgPnl),
    avgRR: r2(avgRR),
    profitFactor: r2(profitFactor),
    expectancy: r2(expectancy),
  };
}

export function calcSessionStats(trades: BacktestTrade[]): SessionStats[] {
  const sessions = [...new Set(trades.map(t => t.session))];
  return sessions.map(session => {
    const group = trades.filter(t => t.session === session);
    const stats = calcGroupStats(group);
    return { session, trades: group.length, ...stats };
  }).sort((a, b) => b.totalPnl - a.totalPnl);
}

export function calcPairStats(trades: BacktestTrade[]): PairStats[] {
  const pairs = [...new Set(trades.map(t => t.pair))];
  return pairs.map(pair => {
    const group = trades.filter(t => t.pair === pair);
    const stats = calcGroupStats(group);
    return { pair, trades: group.length, ...stats };
  }).sort((a, b) => b.totalPnl - a.totalPnl);
}

export function calcZoneStats(trades: BacktestTrade[]): ZoneCategoryStats[] {
  if (trades.length === 0) return [];

  const categories: Array<{
    category: ZoneCategoryStats["category"];
    label: string;
    filter: (t: BacktestTrade) => boolean;
  }> = [
    { category: "demand_zone", label: "Demand Zone", filter: t => t.zoneType === "demand" },
    { category: "supply_zone", label: "Supply Zone", filter: t => t.zoneType === "supply" },
    { category: "liquidity", label: "Liquidity Sweep", filter: t => t.liquiditySweep === true },
    { category: "amd", label: "AMD (Distribution/Manipulation)", filter: t => t.amdPattern === "distribution" || t.amdPattern === "manipulation" },
    { category: "confirmation", label: "Confirmation (FIB + Session)", filter: t => t.fibLevel >= 0.5 && (t.session === "london" || t.session === "newyork") },
  ];

  const totalWins = trades.filter(t => t.pnl > 0).length;

  return categories.map(({ category, label, filter }) => {
    const group = trades.filter(filter);
    if (group.length === 0) {
      return { category, label, trades: 0, wins: 0, winRate: 0, avgPnl: 0, avgScore: 0, contribution: 0 };
    }
    const wins = group.filter(t => t.pnl > 0).length;
    const winRate = r2((wins / group.length) * 100);
    const avgPnl = r2(group.reduce((s, t) => s + t.pnl, 0) / group.length);
    const avgScore = r2(group.reduce((s, t) => s + (t.setupScore ?? 0), 0) / group.length);
    const contribution = r2(totalWins > 0 ? (wins / totalWins) * 100 : 0);
    return { category, label, trades: group.length, wins, winRate, avgPnl, avgScore, contribution };
  });
}

export function calcConsecutiveStreaks(trades: BacktestTrade[]): {
  maxConsecWins: number;
  maxConsecLosses: number;
} {
  let maxWins = 0, maxLosses = 0, curWins = 0, curLosses = 0;

  for (const trade of trades) {
    if (trade.pnl > 0) {
      curWins++;
      curLosses = 0;
      if (curWins > maxWins) maxWins = curWins;
    } else {
      curLosses++;
      curWins = 0;
      if (curLosses > maxLosses) maxLosses = curLosses;
    }
  }

  return { maxConsecWins: maxWins, maxConsecLosses: maxLosses };
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"] as const;

export function calcMonthlyReturns(trades: BacktestTrade[], initialBalance: number): MonthlyReturn[] {
  if (trades.length === 0) return [];

  const buckets = new Map<string, BacktestTrade[]>();

  for (const t of trades) {
    const d = new Date(t.closedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(t);
  }

  const result: MonthlyReturn[] = [];
  let runningBalance = initialBalance;

  for (const [key, group] of [...buckets.entries()].sort()) {
    const [yearStr, monthStr] = key.split("-");
    const year = parseInt(yearStr!);
    const month = parseInt(monthStr!);
    const pnl = r2(group.reduce((s, t) => s + t.pnl, 0));
    const returnPct = r2((pnl / runningBalance) * 100);
    const wins = group.filter(t => t.pnl > 0).length;
    const winRate = r2(group.length > 0 ? (wins / group.length) * 100 : 0);
    runningBalance += pnl;

    result.push({
      year,
      month,
      label: `${MONTH_NAMES[month - 1]} ${year}`,
      trades: group.length,
      pnl,
      returnPct,
      winRate,
    });
  }

  return result;
}

export function calcYearlyReturns(trades: BacktestTrade[], initialBalance: number): YearlyReturn[] {
  if (trades.length === 0) return [];

  const buckets = new Map<number, BacktestTrade[]>();

  for (const t of trades) {
    const year = new Date(t.closedAt).getFullYear();
    if (!buckets.has(year)) buckets.set(year, []);
    buckets.get(year)!.push(t);
  }

  const result: YearlyReturn[] = [];
  let runningBalance = initialBalance;

  for (const [year, group] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    const pnl = r2(group.reduce((s, t) => s + t.pnl, 0));
    const returnPct = r2((pnl / runningBalance) * 100);
    const winners = group.filter(t => t.pnl > 0);
    const losers = group.filter(t => t.pnl <= 0);
    const winRate = r2(group.length > 0 ? (winners.length / group.length) * 100 : 0);
    const grossWin = winners.reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(losers.reduce((s, t) => s + t.pnl, 0));
    const profitFactor = r2(grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 9.99 : 0);

    const yearReturns = group.map(t => (t.pnl / runningBalance) * 100);
    let sharpeRatio = 0;
    if (yearReturns.length >= 2) {
      const avg = yearReturns.reduce((a, b) => a + b, 0) / yearReturns.length;
      const variance = yearReturns.reduce((s, r) => s + Math.pow(r - avg, 2), 0) / yearReturns.length;
      const stdDev = Math.sqrt(variance);
      sharpeRatio = stdDev > 0 ? r2((avg / stdDev) * Math.sqrt(252)) : 0;
    }

    const balances: number[] = [runningBalance];
    for (const t of group) balances.push(balances[balances.length - 1]! + t.pnl);
    let peak = balances[0]!, maxDD = 0;
    for (const b of balances) {
      if (b > peak) peak = b;
      const dd = peak > 0 ? ((peak - b) / peak) * 100 : 0;
      if (dd > maxDD) maxDD = dd;
    }

    runningBalance += pnl;
    result.push({ year, trades: group.length, pnl, returnPct, winRate, profitFactor, maxDrawdown: r2(maxDD), sharpeRatio });
  }

  return result;
}

export function calcRegimeStats(trades: BacktestTrade[]): RegimeStats[] {
  const regimes: Array<RegimeStats["regime"]> = ["trending", "ranging", "volatile", "low_volatility", "unknown"];

  return regimes
    .map(regime => {
      const group = trades.filter(t => (t.regime ?? "unknown") === regime);
      if (group.length === 0) return null;
      const s = calcGroupStats(group);
      return { regime, trades: group.length, ...s };
    })
    .filter((r): r is RegimeStats => r !== null)
    .sort((a, b) => b.trades - a.trades);
}

export function calcFullStats(trades: BacktestTrade[], initialBalance = 10000): BacktestStats {
  const closed = trades.filter(t => t.status === "closed");

  if (closed.length === 0) {
    return {
      expectancy: 0, avgRR: 0, avgWin: 0, avgLoss: 0,
      maxConsecWins: 0, maxConsecLosses: 0,
      sessionStats: [], pairStats: [], zoneStats: [],
      monthlyReturns: [], yearlyReturns: [], regimeStats: [],
    };
  }

  const winners = closed.filter(t => t.pnl > 0);
  const losers = closed.filter(t => t.pnl <= 0);

  const avgWin = winners.length > 0 ? r2(winners.reduce((s, t) => s + t.pnl, 0) / winners.length) : 0;
  const avgLoss = losers.length > 0 ? r2(Math.abs(losers.reduce((s, t) => s + t.pnl, 0)) / losers.length) : 0;
  const winRate = closed.length > 0 ? winners.length / closed.length : 0;
  const lossRate = 1 - winRate;
  const expectancy = r2(winRate * avgWin - lossRate * avgLoss);
  const avgRR = r2(closed.reduce((s, t) => s + (t.riskRewardRatio ?? 0), 0) / closed.length);
  const { maxConsecWins, maxConsecLosses } = calcConsecutiveStreaks(closed);

  return {
    expectancy,
    avgRR,
    avgWin,
    avgLoss,
    maxConsecWins,
    maxConsecLosses,
    sessionStats: calcSessionStats(closed),
    pairStats: calcPairStats(closed),
    zoneStats: calcZoneStats(closed),
    monthlyReturns: calcMonthlyReturns(closed, initialBalance),
    yearlyReturns: calcYearlyReturns(closed, initialBalance),
    regimeStats: calcRegimeStats(closed),
  };
}
