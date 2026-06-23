import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, tradesTable } from "@workspace/db";
import {
  GetAnalyticsSummaryResponse,
  GetEquityCurveQueryParams,
  GetEquityCurveResponseItem,
  GetWinRateBreakdownResponse,
  GetMonthlyPnlResponseItem,
  GetDrawdownResponseItem,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/analytics/summary", async (_req, res): Promise<void> => {
  const trades = await db.select().from(tradesTable).where(eq(tradesTable.status, "closed"));

  const totalTrades = trades.length;
  if (totalTrades === 0) {
    res.json(GetAnalyticsSummaryResponse.parse({
      totalTrades: 0, winningTrades: 0, losingTrades: 0, winRate: 0,
      totalPnl: 0, avgRr: 0, maxDrawdown: 0, profitFactor: 0, expectancy: 0,
      avgWin: 0, avgLoss: 0, bestTrade: 0, worstTrade: 0, consecutiveWins: 0, consecutiveLosses: 0,
    }));
    return;
  }

  const pnls = trades.map(t => parseFloat(t.pnl ?? "0"));
  const winners = pnls.filter(p => p > 0);
  const losers = pnls.filter(p => p < 0);
  const winRate = (winners.length / totalTrades) * 100;
  const totalPnl = pnls.reduce((a, b) => a + b, 0);
  const avgWin = winners.length ? winners.reduce((a, b) => a + b, 0) / winners.length : 0;
  const avgLoss = losers.length ? losers.reduce((a, b) => a + b, 0) / losers.length : 0;
  const grossProfit = winners.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losers.reduce((a, b) => a + b, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit;
  const expectancy = (winRate / 100) * avgWin + (1 - winRate / 100) * avgLoss;
  const avgRr = trades.reduce((s, t) => s + parseFloat(t.riskRewardRatio ?? "0"), 0) / totalTrades;

  let maxDrawdown = 0;
  let peak = 0;
  let equity = 10000;
  for (const pnl of pnls) {
    equity += pnl;
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  let consWins = 0; let maxConsWins = 0; let consLosses = 0; let maxConsLosses = 0;
  for (const pnl of pnls) {
    if (pnl > 0) { consWins++; consLosses = 0; maxConsWins = Math.max(maxConsWins, consWins); }
    else { consLosses++; consWins = 0; maxConsLosses = Math.max(maxConsLosses, consLosses); }
  }

  res.json(GetAnalyticsSummaryResponse.parse({
    totalTrades, winningTrades: winners.length, losingTrades: losers.length,
    winRate, totalPnl, avgRr, maxDrawdown, profitFactor, expectancy,
    avgWin, avgLoss, bestTrade: Math.max(...pnls, 0), worstTrade: Math.min(...pnls, 0),
    consecutiveWins: maxConsWins, consecutiveLosses: maxConsLosses,
  }));
});

router.get("/analytics/equity-curve", async (req, res): Promise<void> => {
  const parsed = GetEquityCurveQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const trades = await db.select().from(tradesTable)
    .where(eq(tradesTable.status, "closed"))
    .orderBy(tradesTable.closedAt);

  let equity = 10000;
  let peak = equity;
  const points: Array<typeof GetEquityCurveResponseItem._type> = [];

  points.push({ date: new Date().toISOString().split("T")[0]!, equity, drawdown: 0 });

  for (const trade of trades) {
    equity += parseFloat(trade.pnl ?? "0");
    if (equity > peak) peak = equity;
    const drawdown = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    points.push({
      date: trade.closedAt?.toISOString().split("T")[0] ?? new Date().toISOString().split("T")[0]!,
      equity,
      drawdown,
    });
  }

  res.json(points.map(p => GetEquityCurveResponseItem.parse(p)));
});

router.get("/analytics/win-rate-breakdown", async (_req, res): Promise<void> => {
  const trades = await db.select().from(tradesTable).where(eq(tradesTable.status, "closed"));

  function breakdown(groupFn: (t: typeof tradesTable.$inferSelect) => string) {
    const groups: Record<string, { wins: number; total: number; pnl: number }> = {};
    for (const t of trades) {
      const key = groupFn(t);
      if (!groups[key]) groups[key] = { wins: 0, total: 0, pnl: 0 };
      groups[key]!.total++;
      const pnl = parseFloat(t.pnl ?? "0");
      groups[key]!.pnl += pnl;
      if (pnl > 0) groups[key]!.wins++;
    }
    return Object.entries(groups).map(([label, g]) => ({
      label,
      winRate: g.total > 0 ? (g.wins / g.total) * 100 : 0,
      trades: g.total,
      pnl: g.pnl,
    }));
  }

  res.json(GetWinRateBreakdownResponse.parse({
    byPair: breakdown(t => t.pair),
    bySession: breakdown(t => t.session),
    byZoneType: breakdown(t => t.zoneType),
    byAmdPattern: breakdown(t => t.amdPattern),
  }));
});

router.get("/analytics/monthly-pnl", async (_req, res): Promise<void> => {
  const trades = await db.select().from(tradesTable).where(eq(tradesTable.status, "closed"));
  const monthly: Record<string, { pnl: number; wins: number; total: number }> = {};
  for (const t of trades) {
    const month = t.closedAt?.toISOString().substring(0, 7) ?? "unknown";
    if (!monthly[month]) monthly[month] = { pnl: 0, wins: 0, total: 0 };
    monthly[month]!.pnl += parseFloat(t.pnl ?? "0");
    monthly[month]!.total++;
    if (parseFloat(t.pnl ?? "0") > 0) monthly[month]!.wins++;
  }
  const result = Object.entries(monthly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, g]) => GetMonthlyPnlResponseItem.parse({
      month,
      pnl: g.pnl,
      trades: g.total,
      winRate: g.total > 0 ? (g.wins / g.total) * 100 : 0,
    }));
  res.json(result);
});

router.get("/analytics/drawdown", async (_req, res): Promise<void> => {
  const trades = await db.select().from(tradesTable)
    .where(eq(tradesTable.status, "closed"))
    .orderBy(tradesTable.closedAt);

  let equity = 10000;
  let peak = equity;
  const points: Array<typeof GetDrawdownResponseItem._type> = [
    { date: new Date().toISOString().split("T")[0]!, drawdown: 0 }
  ];

  for (const trade of trades) {
    equity += parseFloat(trade.pnl ?? "0");
    if (equity > peak) peak = equity;
    const drawdown = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    points.push({
      date: trade.closedAt?.toISOString().split("T")[0] ?? new Date().toISOString().split("T")[0]!,
      drawdown,
    });
  }
  res.json(points.map(p => GetDrawdownResponseItem.parse(p)));
});

export default router;
