import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, backtestsTable } from "@workspace/db";
import {
  RunBacktestBody,
  RunBacktestResponse,
  ListBacktestsResponseItem,
  GetBacktestParams,
  GetBacktestResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function simulateTrades(pair: string, count: number, winRate: number) {
  const pairs: Record<string, number> = { EURUSD: 1.085, GBPUSD: 1.265, USDJPY: 149.5 };
  const basePrice = pairs[pair] ?? 1.085;
  const trades = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const isWin = Math.random() < winRate / 100;
    const direction = Math.random() > 0.5 ? "buy" : "sell";
    const entryPrice = basePrice + (Math.random() - 0.5) * 0.01;
    const pipSize = pair === "USDJPY" ? 0.01 : 0.0001;
    const stopPips = 15 + Math.floor(Math.random() * 10);
    const tpPips = stopPips * (1.5 + Math.random());
    const pnl = isWin ? tpPips * 10 : -stopPips * 10;
    const sessions = ["london", "newyork"] as const;
    const amdPatterns = ["accumulation", "manipulation", "distribution"] as const;
    const openedAt = new Date(now.getTime() - (count - i) * 4 * 60 * 60 * 1000);

    trades.push({
      id: i + 1,
      pair,
      direction,
      entryPrice,
      stopLoss: direction === "buy" ? entryPrice - stopPips * pipSize : entryPrice + stopPips * pipSize,
      takeProfit: direction === "buy" ? entryPrice + tpPips * pipSize : entryPrice - tpPips * pipSize,
      currentPrice: null,
      closedPrice: isWin
        ? (direction === "buy" ? entryPrice + tpPips * pipSize : entryPrice - tpPips * pipSize)
        : (direction === "buy" ? entryPrice - stopPips * pipSize : entryPrice + stopPips * pipSize),
      lotSize: 0.1,
      status: "closed" as const,
      pnl,
      pnlPercent: (pnl / 10000) * 100,
      session: sessions[Math.floor(Math.random() * sessions.length)]!,
      setupScore: 60 + Math.random() * 40,
      amdPattern: amdPatterns[Math.floor(Math.random() * amdPatterns.length)]!,
      zoneType: (Math.random() > 0.5 ? "demand" : "supply") as "demand" | "supply",
      zoneStrength: 60 + Math.random() * 40,
      liquiditySweep: Math.random() > 0.4,
      fibLevel: Math.random() > 0.5 ? 0.618 : 0.5,
      riskRewardRatio: tpPips / stopPips,
      breakEvenMoved: Math.random() > 0.5,
      closeReason: isWin ? "tp_hit" : "sl_hit",
      openedAt: openedAt.toISOString(),
      closedAt: new Date(openedAt.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    });
  }
  return trades;
}

router.post("/backtest/run", async (req, res): Promise<void> => {
  const parsed = RunBacktestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { pair, startDate, endDate, initialBalance, riskPerTrade } = parsed.data;
  const winRate = 55 + Math.random() * 15;
  const tradeCount = 30 + Math.floor(Math.random() * 40);
  const trades = simulateTrades(pair, tradeCount, winRate);
  const winners = trades.filter(t => t.pnl > 0);
  const losers = trades.filter(t => t.pnl < 0);
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const finalBalance = initialBalance + totalPnl;
  const maxDrawdown = 5 + Math.random() * 10;
  const profitFactor = losers.length > 0
    ? winners.reduce((s, t) => s + t.pnl, 0) / Math.abs(losers.reduce((s, t) => s + t.pnl, 0))
    : 999;
  const sharpeRatio = 1.2 + Math.random() * 1.5;

  const [bt] = await db
    .insert(backtestsTable)
    .values({
      pair,
      startDate,
      endDate,
      initialBalance: String(initialBalance),
      finalBalance: String(finalBalance),
      totalTrades: tradeCount,
      winRate: String(winRate),
      totalPnl: String(totalPnl),
      maxDrawdown: String(maxDrawdown),
      profitFactor: String(profitFactor),
      sharpeRatio: String(sharpeRatio),
      riskPerTrade: String(riskPerTrade),
      sessions: parsed.data.sessions ?? ["london", "newyork"],
      enableNewsFilter: parsed.data.enableNewsFilter ?? true,
      enableRL: parsed.data.enableRL ?? false,
      tradesJson: trades,
    })
    .returning();

  res.json(RunBacktestResponse.parse({
    id: bt!.id,
    pair: bt!.pair,
    startDate: bt!.startDate,
    endDate: bt!.endDate,
    initialBalance: parseFloat(bt!.initialBalance),
    finalBalance: parseFloat(bt!.finalBalance),
    totalTrades: bt!.totalTrades,
    winRate: parseFloat(bt!.winRate),
    totalPnl: parseFloat(bt!.totalPnl),
    maxDrawdown: parseFloat(bt!.maxDrawdown),
    profitFactor: parseFloat(bt!.profitFactor),
    sharpeRatio: parseFloat(bt!.sharpeRatio),
    trades,
    createdAt: bt!.createdAt?.toISOString() ?? new Date().toISOString(),
  }));
});

router.get("/backtest/history", async (_req, res): Promise<void> => {
  const backtests = await db.select().from(backtestsTable).orderBy(backtestsTable.createdAt);
  res.json(backtests.map(bt => ListBacktestsResponseItem.parse({
    id: bt.id,
    pair: bt.pair,
    startDate: bt.startDate,
    endDate: bt.endDate,
    winRate: parseFloat(bt.winRate),
    totalPnl: parseFloat(bt.totalPnl),
    maxDrawdown: parseFloat(bt.maxDrawdown),
    totalTrades: bt.totalTrades,
    createdAt: bt.createdAt?.toISOString() ?? new Date().toISOString(),
  })));
});

router.get("/backtest/:id", async (req, res): Promise<void> => {
  const params = GetBacktestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [bt] = await db.select().from(backtestsTable).where(eq(backtestsTable.id, params.data.id));
  if (!bt) {
    res.status(404).json({ error: "Backtest not found" });
    return;
  }

  res.json(GetBacktestResponse.parse({
    id: bt.id,
    pair: bt.pair,
    startDate: bt.startDate,
    endDate: bt.endDate,
    initialBalance: parseFloat(bt.initialBalance),
    finalBalance: parseFloat(bt.finalBalance),
    totalTrades: bt.totalTrades,
    winRate: parseFloat(bt.winRate),
    totalPnl: parseFloat(bt.totalPnl),
    maxDrawdown: parseFloat(bt.maxDrawdown),
    profitFactor: parseFloat(bt.profitFactor),
    sharpeRatio: parseFloat(bt.sharpeRatio),
    trades: (bt.tradesJson as unknown[]) ?? [],
    createdAt: bt.createdAt?.toISOString() ?? new Date().toISOString(),
  }));
});

export default router;
