import { runMonteCarlo } from "../backtest/montecarlo.js";
import { db } from "@workspace/db";
import { tradesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import type { StageResult, Finding } from "./types.js";

interface TradeStats {
  winRate: number;
  avgWin: number;
  avgLoss: number;
  totalTrades: number;
  source: "live" | "default";
}

async function getTradeStats(): Promise<TradeStats> {
  try {
    const trades = await db
      .select({ pnl: tradesTable.pnl, status: tradesTable.status })
      .from(tradesTable)
      .where(eq(tradesTable.status, "closed"));

    if (trades.length < 10) {
      return { winRate: 52, avgWin: 1.5, avgLoss: 1.0, totalTrades: 0, source: "default" };
    }

    const pnls = trades.map((t) => parseFloat(t.pnl ?? "0")).filter((p) => isFinite(p));
    const winners = pnls.filter((p) => p > 0);
    const losers = pnls.filter((p) => p < 0);
    const winRate = (winners.length / pnls.length) * 100;
    const avgWin = winners.length > 0 ? winners.reduce((s, p) => s + p, 0) / winners.length : 1.5;
    const avgLoss = losers.length > 0 ? Math.abs(losers.reduce((s, p) => s + p, 0) / losers.length) : 1.0;

    return { winRate, avgWin, avgLoss, totalTrades: pnls.length, source: "live" };
  } catch {
    return { winRate: 52, avgWin: 1.5, avgLoss: 1.0, totalTrades: 0, source: "default" };
  }
}

export async function runStage5(): Promise<StageResult> {
  const t0 = Date.now();
  const findings: Finding[] = [];
  const blockers: string[] = [];

  const stats = await getTradeStats();

  if (stats.source === "default") {
    findings.push({
      level: "warn",
      message: "Insufficient closed trade history — using conservative baseline parameters (WR: 52%, Avg Win: $1.50, Avg Loss: $1.00)",
    });
  } else {
    findings.push({
      level: "info",
      message: `Using real trade data: ${stats.totalTrades} closed trades, WR ${stats.winRate.toFixed(1)}%, Avg Win $${stats.avgWin.toFixed(2)}, Avg Loss $${stats.avgLoss.toFixed(2)}`,
    });
  }

  const mcResult = runMonteCarlo({
    winRate: stats.winRate,
    avgWin: stats.avgWin,
    avgLoss: stats.avgLoss,
    numSimulations: 10000,
    numTrades: 200,
    startingCapital: 10000,
    ruinThreshold: 0.5,
    tradesPerMonth: 15,
  });

  const { probabilityOfRuin, expectedDrawdown, medianReturn, worstCaseReturn } = mcResult;

  findings.push({
    level: probabilityOfRuin < 5 ? "info" : probabilityOfRuin < 15 ? "warn" : "critical",
    message: `Probability of Ruin (equity < 50%): ${probabilityOfRuin.toFixed(1)}% — ${probabilityOfRuin < 5 ? "acceptable" : probabilityOfRuin < 15 ? "elevated" : "HIGH RISK"}`,
  });

  findings.push({
    level: expectedDrawdown < 20 ? "info" : expectedDrawdown < 35 ? "warn" : "critical",
    message: `Expected maximum drawdown: ${expectedDrawdown.toFixed(1)}%`,
  });

  findings.push({
    level: "info",
    message: `Median return (200 trades): ${medianReturn >= 0 ? "+" : ""}${medianReturn.toFixed(1)}%`,
  });

  findings.push({
    level: worstCaseReturn > -50 ? "warn" : "critical",
    message: `Worst-case return (P5): ${worstCaseReturn.toFixed(1)}%`,
  });

  const ciRange = (mcResult as any).confidenceIntervals ?? null;
  if (ciRange) {
    findings.push({ level: "info", message: `90% Confidence interval: [${ciRange.p5?.toFixed(1) ?? "?"}%, ${ciRange.p95?.toFixed(1) ?? "?"}%]` });
  }

  if (probabilityOfRuin > 15) {
    blockers.push(`High ruin probability (${probabilityOfRuin.toFixed(1)}%) — reduce risk per trade or improve win rate before live deployment`);
  }

  if (expectedDrawdown > 40) {
    blockers.push(`Extreme expected drawdown (${expectedDrawdown.toFixed(1)}%) — position sizing must be reviewed`);
  }

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 -
          probabilityOfRuin * 2 -
          Math.max(0, expectedDrawdown - 15) * 1.5,
      ),
    ),
  );

  const status = blockers.length > 0 ? "fail" : probabilityOfRuin > 5 || expectedDrawdown > 25 ? "warn" : "pass";

  return {
    id: 5,
    name: "Monte Carlo Analysis",
    status,
    score,
    findings,
    blockers,
    durationMs: Date.now() - t0,
    details: {
      simulations: 10000,
      inputSource: stats.source,
      inputWinRate: Math.round(stats.winRate * 10) / 10,
      inputAvgWin: Math.round(stats.avgWin * 100) / 100,
      inputAvgLoss: Math.round(stats.avgLoss * 100) / 100,
      probabilityOfRuin: Math.round(probabilityOfRuin * 10) / 10,
      expectedDrawdown: Math.round(expectedDrawdown * 10) / 10,
      medianReturn: Math.round(medianReturn * 10) / 10,
      worstCaseReturn: Math.round(worstCaseReturn * 10) / 10,
      equityCurves: mcResult.equityCurves,
    },
  };
}
