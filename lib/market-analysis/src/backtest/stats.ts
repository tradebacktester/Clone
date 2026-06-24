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
    {
      category: "demand_zone",
      label: "Demand Zone",
      filter: t => t.zoneType === "demand",
    },
    {
      category: "supply_zone",
      label: "Supply Zone",
      filter: t => t.zoneType === "supply",
    },
    {
      category: "liquidity",
      label: "Liquidity Sweep",
      filter: t => t.liquiditySweep === true,
    },
    {
      category: "amd",
      label: "AMD (Distribution/Manipulation)",
      filter: t => t.amdPattern === "distribution" || t.amdPattern === "manipulation",
    },
    {
      category: "confirmation",
      label: "Confirmation (FIB + Session)",
      filter: t => t.fibLevel >= 0.5 && (t.session === "london" || t.session === "newyork"),
    },
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

export function calcFullStats(trades: BacktestTrade[]): BacktestStats {
  const closed = trades.filter(t => t.status === "closed");

  if (closed.length === 0) {
    return {
      expectancy: 0,
      avgRR: 0,
      avgWin: 0,
      avgLoss: 0,
      maxConsecWins: 0,
      maxConsecLosses: 0,
      sessionStats: [],
      pairStats: [],
      zoneStats: [],
    };
  }

  const winners = closed.filter(t => t.pnl > 0);
  const losers = closed.filter(t => t.pnl <= 0);

  const avgWin = winners.length > 0
    ? r2(winners.reduce((s, t) => s + t.pnl, 0) / winners.length)
    : 0;
  const avgLoss = losers.length > 0
    ? r2(Math.abs(losers.reduce((s, t) => s + t.pnl, 0)) / losers.length)
    : 0;
  const winRate = closed.length > 0 ? winners.length / closed.length : 0;
  const lossRate = 1 - winRate;
  const expectancy = r2(winRate * avgWin - lossRate * avgLoss);

  const avgRR = r2(
    closed.reduce((s, t) => s + (t.riskRewardRatio ?? 0), 0) / closed.length,
  );

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
  };
}
