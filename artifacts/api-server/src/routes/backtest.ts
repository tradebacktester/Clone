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
import { runBacktest, scorePatterns, updateRLAgent } from "@workspace/market-analysis";
import type { Pair } from "@workspace/market-analysis";
import { rlAgentTable, setupScoresTable } from "@workspace/db";

const router: IRouter = Router();

router.post("/backtest/run", async (req, res): Promise<void> => {
  const parsed = RunBacktestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { pair, startDate, endDate, initialBalance, riskPerTrade } = parsed.data;

  const result = await runBacktest({
    pair: pair as Pair,
    startDate,
    endDate,
    initialBalance,
    riskPerTrade,
    sessions: parsed.data.sessions ?? ["london", "newyork"],
    enableNewsFilter: parsed.data.enableNewsFilter ?? true,
    enableRL: parsed.data.enableRL ?? false,
    timeframe: "4h",
  });

  const [bt] = await db
    .insert(backtestsTable)
    .values({
      pair,
      startDate,
      endDate,
      initialBalance: String(initialBalance),
      finalBalance: String(result.finalBalance),
      totalTrades: result.totalTrades,
      winRate: String(result.winRate),
      totalPnl: String(result.totalPnl),
      maxDrawdown: String(result.maxDrawdown),
      profitFactor: String(result.profitFactor),
      sharpeRatio: String(result.sharpeRatio),
      riskPerTrade: String(riskPerTrade),
      sessions: parsed.data.sessions ?? ["london", "newyork"],
      enableNewsFilter: parsed.data.enableNewsFilter ?? true,
      enableRL: parsed.data.enableRL ?? false,
      tradesJson: result.trades,
    })
    .returning();

  if (result.trades.length > 0) {
    const patterns = scorePatterns(result.trades);

    for (const pattern of patterns) {
      await db
        .insert(setupScoresTable)
        .values({
          pattern: pattern.pattern,
          avgScore: String(pattern.avgScore),
          confidence: String(pattern.confidence),
          trades: pattern.trades,
          winRate: String(pattern.winRate),
          avgPnl: String(pattern.avgPnl),
        })
        .onConflictDoUpdate({
          target: setupScoresTable.pattern,
          set: {
            avgScore: String(pattern.avgScore),
            confidence: String(pattern.confidence),
            trades: pattern.trades,
            winRate: String(pattern.winRate),
            avgPnl: String(pattern.avgPnl),
          },
        });
    }

    if (parsed.data.enableRL) {
      const [agent] = await db.select().from(rlAgentTable).limit(1);
      const updated = updateRLAgent(
        agent?.episode ?? 0,
        parseFloat(agent?.totalReward ?? "0"),
        parseFloat(agent?.epsilon ?? "1"),
        result.trades,
      );

      if (agent) {
        await db.update(rlAgentTable).set({
          episode: updated.episode,
          totalReward: String(updated.totalReward),
          avgReward: String(updated.avgReward),
          epsilon: String(updated.epsilon),
          tradesAnalyzed: (agent.tradesAnalyzed ?? 0) + updated.tradesAnalyzed,
          lastTrained: new Date(),
        });
      } else {
        await db.insert(rlAgentTable).values({
          episode: updated.episode,
          totalReward: String(updated.totalReward),
          avgReward: String(updated.avgReward),
          epsilon: String(updated.epsilon),
          learningRate: "0.001",
          tradesAnalyzed: updated.tradesAnalyzed,
          modelVersion: 1,
          lastTrained: new Date(),
        });
      }
    }
  }

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
    trades: result.trades,
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
