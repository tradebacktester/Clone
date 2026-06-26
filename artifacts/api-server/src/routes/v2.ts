import { Router } from "express";
import { db, tradesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { getMtfAlignment } from "../lib/mtf-engine.js";
import { computeTqi } from "../lib/tqi-engine.js";
import { getCorrelationMatrix } from "../lib/correlation-engine.js";
import { getCachedAnalysis } from "../lib/analyzer.js";
import type { Pair } from "@workspace/market-analysis";

const PAIRS: Pair[] = ["EURUSD", "GBPUSD", "USDJPY"];
const router = Router();

// ── GET /v2/mtf/:pair ─────────────────────────────────────────────────────
router.get("/v2/mtf/:pair", (req, res) => {
  const pair = req.params.pair.toUpperCase() as Pair;
  if (!PAIRS.includes(pair)) {
    res.status(400).json({ error: "Invalid pair" });
    return;
  }
  const direction = req.query.direction as "buy" | "sell" | undefined;
  const alignment = getMtfAlignment(pair, direction);
  res.json(alignment);
});

// ── GET /v2/tqi/:pair ─────────────────────────────────────────────────────
router.get("/v2/tqi/:pair", (req, res) => {
  const pair = req.params.pair.toUpperCase() as Pair;
  if (!PAIRS.includes(pair)) {
    res.status(400).json({ error: "Invalid pair" });
    return;
  }

  const analysis = getCachedAnalysis(pair, "4h");
  if (!analysis) {
    res.json([]);
    return;
  }

  const mtf = getMtfAlignment(pair);
  const results = analysis.signals.map(signal => computeTqi(signal, analysis, mtf.score));
  res.json(results);
});

// ── GET /v2/correlation ──────────────────────────────────────────────────
router.get("/v2/correlation", async (_req, res) => {
  const matrix = getCorrelationMatrix();
  const openTrades = await db
    .select({ pair: tradesTable.pair, direction: tradesTable.direction })
    .from(tradesTable)
    .where(eq(tradesTable.status, "open"));

  res.json({
    matrix,
    openExposure: openTrades.map(t => ({ pair: t.pair, direction: t.direction })),
  });
});

// ── GET /analytics/time-performance ─────────────────────────────────────
router.get("/analytics/time-performance", async (req, res) => {
  const dimension = req.query.dimension as string;
  const VALID_DIMENSIONS = ["weekday", "hour", "session", "pair", "regime", "setup", "volatility"];
  if (!VALID_DIMENSIONS.includes(dimension)) {
    res.status(400).json({ error: `dimension must be one of: ${VALID_DIMENSIONS.join(", ")}` });
    return;
  }

  const trades = await db
    .select({
      pair: tradesTable.pair,
      direction: tradesTable.direction,
      pnl: tradesTable.pnl,
      session: tradesTable.session,
      regime: tradesTable.regime,
      amdPattern: tradesTable.amdPattern,
      openedAt: tradesTable.openedAt,
      closedAt: tradesTable.closedAt,
    })
    .from(tradesTable)
    .where(eq(tradesTable.status, "closed"))
    .orderBy(tradesTable.closedAt);

  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  function getLabel(t: typeof trades[0]): string {
    switch (dimension) {
      case "weekday": return WEEKDAYS[t.openedAt.getUTCDay()];
      case "hour": return `${String(t.openedAt.getUTCHours()).padStart(2, "0")}:00 UTC`;
      case "session": return t.session;
      case "pair": return t.pair;
      case "regime": return t.regime ?? "unknown";
      case "setup": return t.amdPattern ?? "unknown";
      case "volatility": return t.regime === "volatile" ? "high" : t.regime === "low_volatility" ? "low" : "medium";
      default: return "unknown";
    }
  }

  const grouped: Record<string, { trades: number; wins: number; pnl: number[] }> = {};
  for (const t of trades) {
    const label = getLabel(t);
    if (!grouped[label]) grouped[label] = { trades: 0, wins: 0, pnl: [] };
    const pnl = parseFloat(t.pnl ?? "0");
    grouped[label].trades++;
    if (pnl > 0) grouped[label].wins++;
    grouped[label].pnl.push(pnl);
  }

  const rows = Object.entries(grouped)
    .map(([label, g]) => {
      const totalPnl = g.pnl.reduce((s, p) => s + p, 0);
      return {
        label,
        trades: g.trades,
        wins: g.wins,
        losses: g.trades - g.wins,
        winRate: g.trades > 0 ? Math.round((g.wins / g.trades) * 1000) / 10 : 0,
        totalPnl: Math.round(totalPnl * 100) / 100,
        avgPnl: g.trades > 0 ? Math.round((totalPnl / g.trades) * 100) / 100 : 0,
      };
    })
    .sort((a, b) => b.winRate - a.winRate);

  res.json({ dimension, rows, totalTrades: trades.length });
});

// ── GET /trades/:id/explanation ──────────────────────────────────────────
router.get("/trades/:id/explanation", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid trade id" });
    return;
  }

  const rows = await db.select().from(tradesTable).where(eq(tradesTable.id, id)).limit(1);
  if (rows.length === 0) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }

  const trade = rows[0];
  if (!trade.explanation) {
    res.status(404).json({ error: "No explanation available for this trade" });
    return;
  }

  res.json(trade.explanation);
});

export default router;
