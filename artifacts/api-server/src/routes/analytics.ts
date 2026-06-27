import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
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
  const [agg] = await db
    .select({
      totalTrades:  sql<string>`COUNT(*) FILTER (WHERE status = 'closed')`,
      winCount:     sql<string>`COUNT(*) FILTER (WHERE status = 'closed' AND pnl > 0)`,
      lossCount:    sql<string>`COUNT(*) FILTER (WHERE status = 'closed' AND pnl <= 0)`,
      totalPnl:     sql<string>`COALESCE(SUM(pnl) FILTER (WHERE status = 'closed'), 0)`,
      grossProfit:  sql<string>`COALESCE(SUM(pnl) FILTER (WHERE status = 'closed' AND pnl > 0), 0)`,
      grossLoss:    sql<string>`COALESCE(ABS(SUM(pnl) FILTER (WHERE status = 'closed' AND pnl < 0)), 0)`,
      avgWin:       sql<string>`COALESCE(AVG(pnl) FILTER (WHERE status = 'closed' AND pnl > 0), 0)`,
      avgLoss:      sql<string>`COALESCE(AVG(pnl) FILTER (WHERE status = 'closed' AND pnl < 0), 0)`,
      bestTrade:    sql<string>`COALESCE(MAX(pnl) FILTER (WHERE status = 'closed'), 0)`,
      worstTrade:   sql<string>`COALESCE(MIN(pnl) FILTER (WHERE status = 'closed'), 0)`,
      avgRr:        sql<string>`COALESCE(AVG(risk_reward_ratio) FILTER (WHERE status = 'closed'), 0)`,
    })
    .from(tradesTable);

  const totalTrades = parseInt(agg?.totalTrades ?? "0", 10);

  if (totalTrades === 0) {
    res.json(GetAnalyticsSummaryResponse.parse({
      totalTrades: 0, winningTrades: 0, losingTrades: 0, winRate: 0,
      totalPnl: 0, avgRr: 0, maxDrawdown: 0, profitFactor: 0, expectancy: 0,
      avgWin: 0, avgLoss: 0, bestTrade: 0, worstTrade: 0, consecutiveWins: 0, consecutiveLosses: 0,
    }));
    return;
  }

  const winCount    = parseInt(agg?.winCount    ?? "0", 10);
  const lossCount   = parseInt(agg?.lossCount   ?? "0", 10);
  const totalPnl    = parseFloat(agg?.totalPnl    ?? "0");
  const grossProfit = parseFloat(agg?.grossProfit ?? "0");
  const grossLoss   = parseFloat(agg?.grossLoss   ?? "0");
  const avgWin      = parseFloat(agg?.avgWin      ?? "0");
  const avgLoss     = parseFloat(agg?.avgLoss     ?? "0");
  const bestTrade   = parseFloat(agg?.bestTrade   ?? "0");
  const worstTrade  = parseFloat(agg?.worstTrade  ?? "0");
  const avgRr       = parseFloat(agg?.avgRr       ?? "0");

  const winRate      = (winCount / totalTrades) * 100;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit;
  const expectancy   = (winRate / 100) * avgWin + (1 - winRate / 100) * avgLoss;

  // Load only pnl column (not JSONB blobs) for equity-curve calculations
  const pnlRows = await db
    .select({ pnl: tradesTable.pnl })
    .from(tradesTable)
    .where(eq(tradesTable.status, "closed"))
    .orderBy(tradesTable.closedAt);

  let maxDrawdown = 0;
  let peak = 10000;
  let equity = 10000;
  let consWins = 0; let maxConsWins = 0;
  let consLosses = 0; let maxConsLosses = 0;

  for (const row of pnlRows) {
    const pnl = parseFloat(row.pnl ?? "0");
    equity += pnl;
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;

    if (pnl > 0) { consWins++; consLosses = 0; maxConsWins = Math.max(maxConsWins, consWins); }
    else { consLosses++; consWins = 0; maxConsLosses = Math.max(maxConsLosses, consLosses); }
  }

  res.json(GetAnalyticsSummaryResponse.parse({
    totalTrades, winningTrades: winCount, losingTrades: lossCount,
    winRate, totalPnl, avgRr, maxDrawdown, profitFactor, expectancy,
    avgWin, avgLoss, bestTrade, worstTrade,
    consecutiveWins: maxConsWins, consecutiveLosses: maxConsLosses,
  }));
});

router.get("/analytics/equity-curve", async (req, res): Promise<void> => {
  const parsed = GetEquityCurveQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const trades = await db
    .select({ pnl: tradesTable.pnl, closedAt: tradesTable.closedAt })
    .from(tradesTable)
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
  // Only load grouping columns + pnl — not full rows with JSONB blobs
  const rows = await db
    .select({
      pair:       tradesTable.pair,
      session:    tradesTable.session,
      zoneType:   tradesTable.zoneType,
      amdPattern: tradesTable.amdPattern,
      pnl:        tradesTable.pnl,
    })
    .from(tradesTable)
    .where(eq(tradesTable.status, "closed"));

  function breakdown(groupFn: (t: typeof rows[0]) => string) {
    const groups: Record<string, { wins: number; total: number; pnl: number }> = {};
    for (const t of rows) {
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
    byPair:       breakdown(t => t.pair),
    bySession:    breakdown(t => t.session),
    byZoneType:   breakdown(t => t.zoneType),
    byAmdPattern: breakdown(t => t.amdPattern),
  }));
});

router.get("/analytics/monthly-pnl", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      month:       sql<string>`to_char(closed_at AT TIME ZONE 'UTC', 'YYYY-MM')`,
      totalPnl:    sql<string>`COALESCE(SUM(pnl), 0)`,
      tradeCount:  sql<string>`COUNT(*)`,
      winCount:    sql<string>`COUNT(*) FILTER (WHERE pnl > 0)`,
    })
    .from(tradesTable)
    .where(eq(tradesTable.status, "closed"))
    .groupBy(sql`to_char(closed_at AT TIME ZONE 'UTC', 'YYYY-MM')`)
    .orderBy(sql`to_char(closed_at AT TIME ZONE 'UTC', 'YYYY-MM')`);

  const result = rows.map(r => GetMonthlyPnlResponseItem.parse({
    month:   r.month ?? "unknown",
    pnl:     parseFloat(r.totalPnl),
    trades:  parseInt(r.tradeCount, 10),
    winRate: parseInt(r.tradeCount, 10) > 0
      ? (parseInt(r.winCount, 10) / parseInt(r.tradeCount, 10)) * 100
      : 0,
  }));

  res.json(result);
});

router.get("/analytics/drawdown", async (_req, res): Promise<void> => {
  const trades = await db
    .select({ pnl: tradesTable.pnl, closedAt: tradesTable.closedAt })
    .from(tradesTable)
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
