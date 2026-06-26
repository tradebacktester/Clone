import { db, tradesTable, reportsTable } from "@workspace/db";
import { eq, and, gte, lt, lte, desc } from "drizzle-orm";
import { logger } from "./logger.js";

export type ReportType = "daily" | "weekly" | "monthly";

interface TradeStat {
  pair: string;
  direction: string;
  pnl: number;
  setupScore: number;
  session: string;
  regime: string | null;
  zoneType: string;
  amdPattern: string;
  openedAt: Date;
  closedAt: Date | null;
  closeReason: string | null;
}

interface PeriodStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  profitFactor: number;
  avgRR: number;
  avgSetupScore: number;
  maxWin: number;
  maxLoss: number;
  byPair: Record<string, { trades: number; wins: number; pnl: number; winRate: number }>;
  bySession: Record<string, { trades: number; wins: number; pnl: number; winRate: number }>;
  byRegime: Record<string, { trades: number; wins: number; pnl: number; winRate: number }>;
  byWeekday: Record<string, { trades: number; wins: number; pnl: number; winRate: number }>;
  byAmdPhase: Record<string, { trades: number; wins: number; pnl: number; winRate: number }>;
  equityCurvePoints: { date: string; pnl: number; cumPnl: number }[];
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  return items.reduce((acc, item) => {
    const k = key(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

function calcGroupStats(trades: TradeStat[]): { trades: number; wins: number; pnl: number; winRate: number } {
  const wins = trades.filter(t => t.pnl > 0).length;
  const pnl = trades.reduce((s, t) => s + t.pnl, 0);
  return { trades: trades.length, wins, pnl: Math.round(pnl * 100) / 100, winRate: trades.length > 0 ? Math.round((wins / trades.length) * 1000) / 10 : 0 };
}

function computePeriodStats(trades: TradeStat[]): PeriodStats {
  const closedTrades = trades.filter(t => t.closedAt != null);
  const wins = closedTrades.filter(t => t.pnl > 0);
  const losses = closedTrades.filter(t => t.pnl < 0);

  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const totalPnl = closedTrades.reduce((s, t) => s + t.pnl, 0);
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
  const avgSetupScore = closedTrades.length > 0 ? closedTrades.reduce((s, t) => s + t.setupScore, 0) / closedTrades.length : 0;

  const byPairRaw = groupBy(closedTrades, t => t.pair);
  const bySessionRaw = groupBy(closedTrades, t => t.session);
  const byRegimeRaw = groupBy(closedTrades, t => t.regime ?? "unknown");
  const byWeekdayRaw = groupBy(closedTrades, t => WEEKDAYS[t.openedAt.getUTCDay()]);
  const byAmdPhaseRaw = groupBy(closedTrades, t => t.amdPattern);

  let cumPnl = 0;
  const equityCurvePoints = closedTrades
    .sort((a, b) => (a.closedAt!.getTime() - b.closedAt!.getTime()))
    .map(t => {
      cumPnl += t.pnl;
      return { date: t.closedAt!.toISOString().slice(0, 10), pnl: t.pnl, cumPnl: Math.round(cumPnl * 100) / 100 };
    });

  return {
    totalTrades: closedTrades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closedTrades.length > 0 ? Math.round((wins.length / closedTrades.length) * 1000) / 10 : 0,
    totalPnl: Math.round(totalPnl * 100) / 100,
    profitFactor: Math.round(profitFactor * 100) / 100,
    avgRR: 0,
    avgSetupScore: Math.round(avgSetupScore * 10) / 10,
    maxWin: wins.length > 0 ? Math.max(...wins.map(t => t.pnl)) : 0,
    maxLoss: losses.length > 0 ? Math.min(...losses.map(t => t.pnl)) : 0,
    byPair: Object.fromEntries(Object.entries(byPairRaw).map(([k, v]) => [k, calcGroupStats(v)])),
    bySession: Object.fromEntries(Object.entries(bySessionRaw).map(([k, v]) => [k, calcGroupStats(v)])),
    byRegime: Object.fromEntries(Object.entries(byRegimeRaw).map(([k, v]) => [k, calcGroupStats(v)])),
    byWeekday: Object.fromEntries(Object.entries(byWeekdayRaw).map(([k, v]) => [k, calcGroupStats(v)])),
    byAmdPhase: Object.fromEntries(Object.entries(byAmdPhaseRaw).map(([k, v]) => [k, calcGroupStats(v)])),
    equityCurvePoints,
  };
}

function generateSuggestions(stats: PeriodStats): string[] {
  const suggestions: string[] = [];

  if (stats.winRate < 40 && stats.totalTrades >= 5) {
    suggestions.push("Win rate below 40% — consider tightening entry criteria by raising TQI threshold to 70+");
  }
  if (stats.profitFactor < 1.0 && stats.totalTrades >= 5) {
    suggestions.push("Profit factor below 1.0 — strategy is losing net. Review stop loss placement and R:R minimums");
  }

  const worstRegime = Object.entries(stats.byRegime)
    .filter(([, v]) => v.trades >= 2)
    .sort(([, a], [, b]) => a.winRate - b.winRate)[0];
  if (worstRegime && worstRegime[1].winRate < 35) {
    suggestions.push(`Avoid trading in '${worstRegime[0]}' regime — win rate of ${worstRegime[1].winRate}% is below threshold`);
  }

  const bestRegime = Object.entries(stats.byRegime)
    .filter(([, v]) => v.trades >= 2)
    .sort(([, a], [, b]) => b.winRate - a.winRate)[0];
  if (bestRegime && bestRegime[1].winRate >= 60) {
    suggestions.push(`${bestRegime[0]} regime shows ${bestRegime[1].winRate}% win rate — prioritise entries in this regime`);
  }

  const worstDay = Object.entries(stats.byWeekday)
    .filter(([, v]) => v.trades >= 2)
    .sort(([, a], [, b]) => a.winRate - b.winRate)[0];
  if (worstDay && worstDay[1].winRate < 30) {
    suggestions.push(`${worstDay[0]} has ${worstDay[1].winRate}% win rate — consider skipping this day`);
  }

  const bestSession = Object.entries(stats.bySession)
    .filter(([, v]) => v.trades >= 2)
    .sort(([, a], [, b]) => b.winRate - a.winRate)[0];
  if (bestSession && bestSession[1].winRate >= 60) {
    suggestions.push(`${bestSession[0]} session performs best (${bestSession[1].winRate}% win rate) — focus allocation here`);
  }

  if (suggestions.length === 0) {
    suggestions.push("Strategy metrics are within acceptable ranges. Continue monitoring for regime shifts.");
  }

  return suggestions;
}

async function fetchTrades(start: Date, end: Date): Promise<TradeStat[]> {
  const rows = await db
    .select()
    .from(tradesTable)
    .where(
      and(
        eq(tradesTable.status, "closed"),
        gte(tradesTable.closedAt, start),
        lte(tradesTable.closedAt, end),
      ),
    )
    .orderBy(tradesTable.closedAt);

  return rows.map(r => ({
    pair: r.pair,
    direction: r.direction,
    pnl: parseFloat(r.pnl ?? "0"),
    setupScore: parseFloat(r.setupScore ?? "0"),
    session: r.session,
    regime: r.regime,
    zoneType: r.zoneType,
    amdPattern: r.amdPattern ?? "unknown",
    openedAt: r.openedAt,
    closedAt: r.closedAt,
    closeReason: r.closeReason,
  }));
}

export async function generateReport(type: ReportType): Promise<Report> {
  const now = new Date();
  let periodStart: Date;
  let periodEnd: Date;

  if (type === "daily") {
    periodStart = new Date(now);
    periodStart.setUTCHours(0, 0, 0, 0);
    periodEnd = new Date(now);
    periodEnd.setUTCHours(23, 59, 59, 999);
  } else if (type === "weekly") {
    const dow = now.getUTCDay();
    periodStart = new Date(now);
    periodStart.setUTCDate(now.getUTCDate() - dow);
    periodStart.setUTCHours(0, 0, 0, 0);
    periodEnd = new Date(now);
    periodEnd.setUTCHours(23, 59, 59, 999);
  } else {
    periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  }

  const trades = await fetchTrades(periodStart, periodEnd);
  const stats = computePeriodStats(trades);
  const suggestions = generateSuggestions(stats);

  const content = {
    type,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    generatedAt: now.toISOString(),
    stats,
    suggestions,
    tradeCount: trades.length,
    summary: `${type.charAt(0).toUpperCase() + type.slice(1)} report: ${stats.totalTrades} trades, ${stats.winRate}% win rate, ${stats.totalPnl >= 0 ? "+" : ""}${stats.totalPnl.toFixed(2)} P&L, PF ${stats.profitFactor.toFixed(2)}`,
  };

  const [saved] = await db
    .insert(reportsTable)
    .values({
      type,
      periodStart,
      periodEnd,
      content,
    })
    .returning();

  logger.info({ type, trades: stats.totalTrades, winRate: stats.winRate }, "Report generated");
  return saved;
}

export type Report = typeof reportsTable.$inferSelect;

export async function listReports(type?: ReportType, limit = 20): Promise<Report[]> {
  const baseQuery = db.select().from(reportsTable).orderBy(desc(reportsTable.generatedAt)).limit(limit);
  if (type) {
    return db.select().from(reportsTable).where(eq(reportsTable.type, type)).orderBy(desc(reportsTable.generatedAt)).limit(limit);
  }
  return baseQuery;
}

export async function getReport(id: number): Promise<Report | null> {
  const rows = await db.select().from(reportsTable).where(eq(reportsTable.id, id)).limit(1);
  return rows[0] ?? null;
}
