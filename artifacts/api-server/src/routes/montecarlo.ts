import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tradesTable } from "@workspace/db";
import { runMonteCarlo } from "@workspace/market-analysis";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

router.post("/analytics/monte-carlo", async (req, res): Promise<void> => {
  const body = req.body ?? {};

  let derivedWinRate    = 0.55;
  let derivedAvgWin     = 150;
  let derivedAvgLoss    = 80;
  let derivedStartingCapital = 10_000;

  // Derive parameters from historical closed trades
  if (body.useHistoricalData !== false) {
    try {
      const trades = await db
        .select()
        .from(tradesTable)
        .where(eq(tradesTable.status, "closed"));

      if (trades.length >= 5) {
        const pnls     = trades.map(t => parseFloat(t.pnl ?? "0"));
        const winners  = pnls.filter(p => p > 0);
        const losers   = pnls.filter(p => p < 0);

        if (winners.length > 0 && losers.length > 0) {
          derivedWinRate  = winners.length / pnls.length;
          derivedAvgWin   = winners.reduce((s, p) => s + p, 0) / winners.length;
          derivedAvgLoss  = Math.abs(losers.reduce((s, p) => s + p, 0) / losers.length);
        }

        // Estimate starting capital from earliest trade or default 10k
        const balances = trades
          .filter(t => t.pnl != null)
          .map(t => parseFloat(t.pnl ?? "0"));
        const totalPnl = balances.reduce((s, p) => s + p, 0);
        derivedStartingCapital = Math.max(10_000, 10_000 + totalPnl);
      }
    } catch (err) {
      logger.warn({ err }, "Failed to derive Monte Carlo params from DB — using defaults");
    }
  }

  const numSimulations  = Math.min(parseInt(body.numSimulations  ?? "10000"), 50_000);
  const numTrades       = Math.min(parseInt(body.numTrades       ?? "100"),   1_000);
  const winRate         = parseFloat(body.winRate         ?? String(derivedWinRate));
  const avgWin          = parseFloat(body.avgWin          ?? String(derivedAvgWin));
  const avgLoss         = parseFloat(body.avgLoss         ?? String(derivedAvgLoss));
  const startingCapital = parseFloat(body.startingCapital ?? String(derivedStartingCapital));
  const ruinThreshold   = parseFloat(body.ruinThreshold   ?? "0.5");
  const tradesPerMonth  = parseInt(body.tradesPerMonth    ?? "20");

  // Input validation
  if (winRate <= 0 || winRate >= 1) {
    res.status(400).json({ error: "winRate must be between 0 and 1 (exclusive)" });
    return;
  }
  if (avgWin <= 0 || avgLoss <= 0) {
    res.status(400).json({ error: "avgWin and avgLoss must be positive" });
    return;
  }
  if (startingCapital <= 0) {
    res.status(400).json({ error: "startingCapital must be positive" });
    return;
  }

  const start = Date.now();
  logger.info({ numSimulations, numTrades, winRate, avgWin, avgLoss }, "Running Monte Carlo simulation");

  const result = runMonteCarlo({
    numSimulations,
    numTrades,
    winRate,
    avgWin,
    avgLoss,
    startingCapital,
    ruinThreshold,
    tradesPerMonth,
  });

  logger.info({ durationMs: Date.now() - start, probabilityOfRuin: result.probabilityOfRuin }, "Monte Carlo complete");

  res.json(result);
});

export default router;
