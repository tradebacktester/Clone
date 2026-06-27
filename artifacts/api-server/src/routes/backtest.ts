import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, backtestsTable } from "@workspace/db";
import {
  RunBacktestBody,
  RunBacktestResponse,
  ListBacktestsResponseItem,
  GetBacktestParams,
  GetBacktestResponse,
  RunBatchBacktestBody,
  RunBatchBacktestResponse,
  RunWalkForwardBody,
} from "@workspace/api-zod";
import { runBacktest, scorePatterns, updateRLAgent, runWalkForward } from "@workspace/market-analysis";
import type { Pair } from "@workspace/market-analysis";
import { rlAgentTable, setupScoresTable } from "@workspace/db";

const router: IRouter = Router();

type BtRow = { id: number; pair: string; startDate: string; endDate: string; initialBalance: string; finalBalance: string; totalTrades: number; winRate: string; totalPnl: string; maxDrawdown: string; profitFactor: string; sharpeRatio: string; createdAt?: Date | null };

function buildBacktestResponse(bt: BtRow, result: Awaited<ReturnType<typeof runBacktest>>) {
  return {
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
    expectancy: result.expectancy,
    avgRR: result.avgRR,
    avgWin: result.avgWin,
    avgLoss: result.avgLoss,
    maxConsecWins: result.maxConsecWins,
    maxConsecLosses: result.maxConsecLosses,
    trades: result.trades,
    equityCurve: result.equityCurve,
    sessionStats: result.sessionStats,
    pairStats: result.pairStats,
    zoneStats: result.zoneStats,
    monthlyReturns: result.monthlyReturns,
    yearlyReturns: result.yearlyReturns,
    regimeStats: result.regimeStats,
    dataSource: result.dataSource,
    dataSynthetic: result.dataSynthetic,
    dataWarnings: result.dataWarnings,
    dataCoveragePct: result.dataCoveragePct,
    createdAt: bt.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

async function runAndSave(
  pair: Pair,
  startDate: string,
  endDate: string,
  initialBalance: number,
  riskPerTrade: number,
  sessions: string[],
  enableNewsFilter: boolean,
  enableRL: boolean,
) {
  const result = await runBacktest({
    pair,
    startDate,
    endDate,
    initialBalance,
    riskPerTrade,
    sessions,
    enableNewsFilter,
    enableRL,
    timeframe: "4h",
    contextTimeframe: "1d",
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
      sessions,
      enableNewsFilter,
      enableRL,
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

    if (enableRL) {
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

  return { result, bt: bt! };
}

router.post("/backtest/run", async (req, res): Promise<void> => {
  const parsed = RunBacktestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { pair, startDate, endDate, initialBalance, riskPerTrade } = parsed.data;
  const sessions = parsed.data.sessions ?? ["london", "newyork"];
  const enableNewsFilter = parsed.data.enableNewsFilter ?? true;
  const enableRL = parsed.data.enableRL ?? false;

  const { result, bt } = await runAndSave(
    pair as Pair, startDate, endDate, initialBalance, riskPerTrade,
    sessions, enableNewsFilter, enableRL,
  );

  res.json(buildBacktestResponse(bt, result));
});

router.post("/backtest/batch", async (req, res): Promise<void> => {
  const parsed = RunBatchBacktestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { initialBalance, riskPerTrade } = parsed.data;
  const startDate = parsed.data.startDate ?? "2019-01-01";
  const endDate = parsed.data.endDate ?? "2024-12-31";
  const sessions = parsed.data.sessions ?? ["london", "newyork"];

  const pairs: Pair[] = ["EURUSD", "GBPUSD", "USDJPY"];

  const outcomes = await Promise.all(
    pairs.map(pair =>
      runAndSave(pair, startDate, endDate, initialBalance, riskPerTrade, sessions, true, false),
    ),
  );

  const allResults = outcomes.map(({ result, bt }) => buildBacktestResponse(bt, result));

  const allTrades = outcomes.flatMap(o => o.result.trades);
  const allWinners = allTrades.filter(t => t.pnl > 0);
  const totalPnl = Math.round(allTrades.reduce((s, t) => s + t.pnl, 0) * 100) / 100;
  const totalTrades = allTrades.length;
  const winRate = Math.round((totalTrades > 0 ? (allWinners.length / totalTrades) * 100 : 0) * 100) / 100;
  const grossWin = allWinners.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(allTrades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
  const profitFactor = Math.round((grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 9.99 : 0) * 1000) / 1000;
  const avgPnlPct = allTrades.length > 0
    ? allTrades.reduce((s, t) => s + t.pnlPercent, 0) / allTrades.length : 0;
  const avgWin = allWinners.length > 0 ? grossWin / allWinners.length : 0;
  const avgLoss2 = allTrades.filter(t => t.pnl < 0).length > 0
    ? grossLoss / allTrades.filter(t => t.pnl < 0).length : 0;
  const wr = totalTrades > 0 ? allWinners.length / totalTrades : 0;
  const lr = 1 - wr;
  const expectancy = Math.round((wr * avgWin - lr * avgLoss2) * 100) / 100;
  const maxDD = Math.max(...outcomes.map(o => o.result.maxDrawdown));
  const sharpeRatio = Math.round(
    (outcomes.reduce((s, o) => s + o.result.sharpeRatio, 0) / outcomes.length) * 1000,
  ) / 1000;

  res.json({
    results: allResults,
    combinedStats: { totalTrades, winRate, totalPnl, profitFactor, sharpeRatio, maxDrawdown: maxDD, expectancy },
    ranAt: new Date().toISOString(),
  });
});

router.post("/backtest/walkforward", async (req, res): Promise<void> => {
  const parsed = RunWalkForwardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { initialBalance, trainWindowYears, testWindowYears, overallStartDate, overallEndDate } = parsed.data;

  const result = await runWalkForward({
    initialBalance,
    trainWindowYears: trainWindowYears ?? 2,
    testWindowYears: testWindowYears ?? 1,
    overallStartDate: overallStartDate ?? "2018-01-01",
    overallEndDate: overallEndDate ?? "2023-12-31",
  });

  res.json(result);
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
    monthlyReturns: [],
    yearlyReturns: [],
    regimeStats: [],
    sessionStats: [],
    pairStats: [],
    zoneStats: [],
    expectancy: 0,
    avgRR: 0,
    avgWin: 0,
    avgLoss: 0,
    maxConsecWins: 0,
    maxConsecLosses: 0,
    createdAt: bt.createdAt?.toISOString() ?? new Date().toISOString(),
  }));
});

export default router;
