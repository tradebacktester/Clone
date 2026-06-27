import { Router, type IRouter } from "express";
import { db, paperExecConfigTable, execQualityLogTable, tradesTable } from "@workspace/db";
import { eq, sql, desc, avg } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const PAIRS = ["EURUSD", "GBPUSD", "USDJPY"];

const DEFAULTS: Record<string, { spreadPips: number; minEntrySlippagePips: number; maxEntrySlippagePips: number; minExitSlippagePips: number; maxExitSlippagePips: number; commissionPerLot: number }> = {
  EURUSD: { spreadPips: 1.2, minEntrySlippagePips: 0.3, maxEntrySlippagePips: 2.0, minExitSlippagePips: 0.3, maxExitSlippagePips: 1.0, commissionPerLot: 3.5 },
  GBPUSD: { spreadPips: 1.5, minEntrySlippagePips: 0.4, maxEntrySlippagePips: 2.5, minExitSlippagePips: 0.4, maxExitSlippagePips: 1.2, commissionPerLot: 3.5 },
  USDJPY: { spreadPips: 1.0, minEntrySlippagePips: 0.3, maxEntrySlippagePips: 1.8, minExitSlippagePips: 0.3, maxExitSlippagePips: 0.8, commissionPerLot: 3.5 },
};

async function ensureDefaults() {
  for (const pair of PAIRS) {
    const existing = await db.select({ id: paperExecConfigTable.id }).from(paperExecConfigTable).where(eq(paperExecConfigTable.pair, pair)).limit(1);
    if (existing.length === 0) {
      const d = DEFAULTS[pair]!;
      await db.insert(paperExecConfigTable).values({
        pair,
        spreadPips: String(d.spreadPips),
        minEntrySlippagePips: String(d.minEntrySlippagePips),
        maxEntrySlippagePips: String(d.maxEntrySlippagePips),
        minExitSlippagePips: String(d.minExitSlippagePips),
        maxExitSlippagePips: String(d.maxExitSlippagePips),
        commissionPerLot: String(d.commissionPerLot),
      });
    }
  }
}

ensureDefaults().catch((err) => logger.warn({ err }, "Could not seed paper exec config defaults"));

function mapConfig(row: typeof paperExecConfigTable.$inferSelect) {
  return {
    id: row.id,
    pair: row.pair,
    spreadPips: parseFloat(row.spreadPips),
    minEntrySlippagePips: parseFloat(row.minEntrySlippagePips),
    maxEntrySlippagePips: parseFloat(row.maxEntrySlippagePips),
    minExitSlippagePips: parseFloat(row.minExitSlippagePips),
    maxExitSlippagePips: parseFloat(row.maxExitSlippagePips),
    commissionPerLot: parseFloat(row.commissionPerLot),
    partialFillsEnabled: row.partialFillsEnabled,
    fillRejectionRatePct: parseFloat(row.fillRejectionRatePct),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// GET /paper/exec-config
router.get("/paper/exec-config", async (_req, res): Promise<void> => {
  try {
    const rows = await db.select().from(paperExecConfigTable).orderBy(paperExecConfigTable.pair);
    res.json({ configs: rows.map(mapConfig) });
  } catch (err) {
    logger.error({ err }, "GET /paper/exec-config failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /paper/exec-config/:pair
router.get("/paper/exec-config/:pair", async (req, res): Promise<void> => {
  try {
    const pair = req.params["pair"]?.toUpperCase();
    const [row] = await db.select().from(paperExecConfigTable).where(eq(paperExecConfigTable.pair, pair ?? "")).limit(1);
    if (!row) {
      res.status(404).json({ error: "Config not found for pair" });
      return;
    }
    res.json(mapConfig(row));
  } catch (err) {
    logger.error({ err }, "GET /paper/exec-config/:pair failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /paper/exec-config/:pair
router.put("/paper/exec-config/:pair", async (req, res): Promise<void> => {
  try {
    const pair = req.params["pair"]?.toUpperCase();
    const body = req.body as Record<string, unknown>;
    const update: Partial<typeof paperExecConfigTable.$inferInsert> = {};

    if (body["spreadPips"] !== undefined) update.spreadPips = String(Math.max(0, Number(body["spreadPips"])));
    if (body["minEntrySlippagePips"] !== undefined) update.minEntrySlippagePips = String(Math.max(0, Number(body["minEntrySlippagePips"])));
    if (body["maxEntrySlippagePips"] !== undefined) update.maxEntrySlippagePips = String(Math.max(0, Number(body["maxEntrySlippagePips"])));
    if (body["minExitSlippagePips"] !== undefined) update.minExitSlippagePips = String(Math.max(0, Number(body["minExitSlippagePips"])));
    if (body["maxExitSlippagePips"] !== undefined) update.maxExitSlippagePips = String(Math.max(0, Number(body["maxExitSlippagePips"])));
    if (body["commissionPerLot"] !== undefined) update.commissionPerLot = String(Math.max(0, Number(body["commissionPerLot"])));
    if (body["partialFillsEnabled"] !== undefined) update.partialFillsEnabled = Boolean(body["partialFillsEnabled"]);
    if (body["fillRejectionRatePct"] !== undefined) update.fillRejectionRatePct = String(Math.min(100, Math.max(0, Number(body["fillRejectionRatePct"]))));

    const existing = await db.select({ id: paperExecConfigTable.id }).from(paperExecConfigTable).where(eq(paperExecConfigTable.pair, pair ?? "")).limit(1);

    let row;
    if (existing.length > 0) {
      [row] = await db.update(paperExecConfigTable).set(update).where(eq(paperExecConfigTable.pair, pair ?? "")).returning();
    } else {
      const d = DEFAULTS[pair ?? "EURUSD"] ?? DEFAULTS["EURUSD"]!;
      [row] = await db.insert(paperExecConfigTable).values({
        pair: pair ?? "",
        spreadPips: String(d.spreadPips),
        minEntrySlippagePips: String(d.minEntrySlippagePips),
        maxEntrySlippagePips: String(d.maxEntrySlippagePips),
        minExitSlippagePips: String(d.minExitSlippagePips),
        maxExitSlippagePips: String(d.maxExitSlippagePips),
        commissionPerLot: String(d.commissionPerLot),
        ...update,
      }).returning();
    }

    res.json(mapConfig(row!));
  } catch (err) {
    logger.error({ err }, "PUT /paper/exec-config/:pair failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /paper/exec-quality
router.get("/paper/exec-quality", async (req, res): Promise<void> => {
  try {
    const limit = Math.min(parseInt(String(req.query["limit"] ?? "100"), 10), 500);
    const pair = req.query["pair"] as string | undefined;

    const [metrics] = await db
      .select({
        avgSignalToFillMs: sql<string>`COALESCE(AVG(signal_to_fill_ms), 0)`,
        avgEntrySlippage: sql<string>`COALESCE(AVG(entry_slippage), 0)`,
        avgExitSlippage: sql<string>`COALESCE(AVG(exit_slippage), 0)`,
        avgSpreadPips: sql<string>`COALESCE(AVG(spread_pips), 0)`,
        avgQualityScore: sql<string>`COALESCE(AVG(quality_score), 0)`,
        totalLogs: sql<string>`COUNT(*)`,
        p95SignalToFill: sql<string>`COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY signal_to_fill_ms), 0)`,
        p95EntrySlippage: sql<string>`COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY entry_slippage), 0)`,
      })
      .from(execQualityLogTable);

    const recentRows = await db
      .select()
      .from(execQualityLogTable)
      .orderBy(desc(execQualityLogTable.createdAt))
      .limit(limit);

    res.json({
      summary: {
        avgSignalToFillMs: Math.round(parseFloat(metrics?.avgSignalToFillMs ?? "0")),
        avgEntrySlippagePips: Math.round(parseFloat(metrics?.avgEntrySlippage ?? "0") * 10) / 10,
        avgExitSlippagePips: Math.round(parseFloat(metrics?.avgExitSlippage ?? "0") * 10) / 10,
        avgSpreadPips: Math.round(parseFloat(metrics?.avgSpreadPips ?? "0") * 10) / 10,
        avgQualityScore: Math.round(parseFloat(metrics?.avgQualityScore ?? "0")),
        totalLogs: parseInt(metrics?.totalLogs ?? "0", 10),
        p95SignalToFillMs: Math.round(parseFloat(metrics?.p95SignalToFill ?? "0")),
        p95EntrySlippagePips: Math.round(parseFloat(metrics?.p95EntrySlippage ?? "0") * 10) / 10,
      },
      recent: recentRows.map((r) => ({
        id: r.id,
        tradeId: r.tradeId,
        pair: r.pair,
        direction: r.direction,
        signalToFillMs: r.signalToFillMs,
        idealEntryPrice: r.idealEntryPrice != null ? parseFloat(r.idealEntryPrice) : null,
        actualEntryPrice: r.actualEntryPrice != null ? parseFloat(r.actualEntryPrice) : null,
        entrySlippagePips: r.entrySlippagePips != null ? parseFloat(r.entrySlippagePips) : null,
        spreadPips: r.spreadPips != null ? parseFloat(r.spreadPips) : null,
        exitSlippagePips: r.exitSlippagePips != null ? parseFloat(r.exitSlippagePips) : null,
        commissionPaid: r.commissionPaid != null ? parseFloat(r.commissionPaid) : null,
        qualityScore: r.qualityScore,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    logger.error({ err }, "GET /paper/exec-quality failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /paper/equity-curve
router.get("/paper/equity-curve", async (_req, res): Promise<void> => {
  try {
    const INITIAL_BALANCE = 10_000;
    const rows = await db
      .select({
        id: tradesTable.id,
        pnl: tradesTable.pnl,
        closedAt: tradesTable.closedAt,
        pair: tradesTable.pair,
        direction: tradesTable.direction,
        closeReason: tradesTable.closeReason,
      })
      .from(tradesTable)
      .where(eq(tradesTable.status, "closed"))
      .orderBy(tradesTable.closedAt);

    let balance = INITIAL_BALANCE;
    let peak = INITIAL_BALANCE;
    let maxDrawdown = 0;
    const curve = rows.map((r) => {
      const pnl = parseFloat(r.pnl ?? "0");
      balance += pnl;
      if (balance > peak) peak = balance;
      const drawdown = peak > 0 ? ((peak - balance) / peak) * 100 : 0;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      return {
        tradeId: r.id,
        closedAt: r.closedAt?.toISOString() ?? null,
        pnl: Math.round(pnl * 100) / 100,
        balance: Math.round(balance * 100) / 100,
        drawdownPct: Math.round(drawdown * 100) / 100,
        pair: r.pair,
        closeReason: r.closeReason,
      };
    });

    res.json({
      initialBalance: INITIAL_BALANCE,
      currentBalance: Math.round(balance * 100) / 100,
      peakBalance: Math.round(peak * 100) / 100,
      maxDrawdownPct: Math.round(maxDrawdown * 100) / 100,
      totalReturn: Math.round(((balance - INITIAL_BALANCE) / INITIAL_BALANCE) * 10000) / 100,
      curve,
    });
  } catch (err) {
    logger.error({ err }, "GET /paper/equity-curve failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /paper/drawdown
router.get("/paper/drawdown", async (_req, res): Promise<void> => {
  try {
    const INITIAL_BALANCE = 10_000;
    const rows = await db
      .select({ pnl: tradesTable.pnl, closedAt: tradesTable.closedAt, pair: tradesTable.pair })
      .from(tradesTable)
      .where(eq(tradesTable.status, "closed"))
      .orderBy(tradesTable.closedAt);

    let balance = INITIAL_BALANCE;
    let peak = INITIAL_BALANCE;
    let maxDrawdown = 0;
    let maxDrawdownStartBal = INITIAL_BALANCE;
    let currentDrawdown = 0;
    let inDrawdown = false;
    const drawdownPeriods: Array<{ startBalance: number; troughBalance: number; drawdownPct: number; durationTrades: number }> = [];
    let ddStart = 0;
    let ddPeak = INITIAL_BALANCE;
    let ddTrade = 0;

    for (const r of rows) {
      const pnl = parseFloat(r.pnl ?? "0");
      balance += pnl;
      ddTrade++;
      if (balance > peak) {
        if (inDrawdown && ddTrade - ddStart > 0) {
          drawdownPeriods.push({ startBalance: ddPeak, troughBalance: balance - pnl, drawdownPct: Math.round(((ddPeak - (balance - pnl)) / ddPeak) * 10000) / 100, durationTrades: ddTrade - ddStart });
        }
        peak = balance;
        ddPeak = balance;
        ddStart = ddTrade;
        inDrawdown = false;
      } else {
        inDrawdown = true;
        const dd = ((peak - balance) / peak) * 100;
        if (dd > maxDrawdown) {
          maxDrawdown = dd;
          maxDrawdownStartBal = peak;
        }
        currentDrawdown = dd;
      }
    }

    res.json({
      currentDrawdownPct: Math.round(currentDrawdown * 100) / 100,
      maxDrawdownPct: Math.round(maxDrawdown * 100) / 100,
      maxDrawdownStartBalance: Math.round(maxDrawdownStartBal * 100) / 100,
      currentBalance: Math.round(balance * 100) / 100,
      periods: drawdownPeriods.slice(-10),
    });
  } catch (err) {
    logger.error({ err }, "GET /paper/drawdown failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
