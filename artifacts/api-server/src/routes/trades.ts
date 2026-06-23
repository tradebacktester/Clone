import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, tradesTable } from "@workspace/db";
import {
  ListTradesQueryParams,
  ListTradesResponse,
  GetTradeParams,
  GetTradeResponse,
  CloseTradeParams,
  CloseTradeResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function mapTrade(t: typeof tradesTable.$inferSelect) {
  return {
    id: t.id,
    pair: t.pair,
    direction: t.direction as "buy" | "sell",
    entryPrice: parseFloat(t.entryPrice),
    stopLoss: parseFloat(t.stopLoss),
    takeProfit: parseFloat(t.takeProfit),
    currentPrice: t.currentPrice != null ? parseFloat(t.currentPrice) : null,
    closedPrice: t.closedPrice != null ? parseFloat(t.closedPrice) : null,
    lotSize: parseFloat(t.lotSize),
    status: t.status as "open" | "closed" | "cancelled",
    pnl: t.pnl != null ? parseFloat(t.pnl) : null,
    pnlPercent: t.pnlPercent != null ? parseFloat(t.pnlPercent) : null,
    session: t.session as "london" | "newyork" | "asian",
    setupScore: parseFloat(t.setupScore ?? "0"),
    amdPattern: (t.amdPattern ?? "unknown") as "accumulation" | "manipulation" | "distribution" | "unknown",
    zoneType: t.zoneType as "demand" | "supply",
    zoneStrength: parseFloat(t.zoneStrength ?? "0"),
    liquiditySweep: t.liquiditySweep ?? false,
    fibLevel: t.fibLevel != null ? parseFloat(t.fibLevel) : null,
    riskRewardRatio: parseFloat(t.riskRewardRatio ?? "0"),
    breakEvenMoved: t.breakEvenMoved ?? false,
    closeReason: t.closeReason ?? null,
    openedAt: t.openedAt?.toISOString() ?? new Date().toISOString(),
    closedAt: t.closedAt?.toISOString() ?? null,
  };
}

router.get("/trades", async (req, res): Promise<void> => {
  const parsed = ListTradesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { status, pair, limit = 50, offset = 0 } = parsed.data;

  const conditions = [];
  if (status && status !== "all") {
    conditions.push(eq(tradesTable.status, status));
  }
  if (pair) {
    conditions.push(eq(tradesTable.pair, pair));
  }

  const trades = await db
    .select()
    .from(tradesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(tradesTable.openedAt))
    .limit(limit)
    .offset(offset);

  const total = await db.$count(tradesTable, conditions.length ? and(...conditions) : undefined);

  res.json(ListTradesResponse.parse({ trades: trades.map(mapTrade), total }));
});

router.get("/trades/:id", async (req, res): Promise<void> => {
  const params = GetTradeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [trade] = await db.select().from(tradesTable).where(eq(tradesTable.id, params.data.id));
  if (!trade) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }

  res.json(GetTradeResponse.parse(mapTrade(trade)));
});

router.post("/trades/:id/close", async (req, res): Promise<void> => {
  const params = CloseTradeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [trade] = await db.select().from(tradesTable).where(eq(tradesTable.id, params.data.id));
  if (!trade) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }

  if (trade.status !== "open") {
    res.status(400).json({ error: "Trade is not open" });
    return;
  }

  const closedPrice = trade.currentPrice ?? trade.entryPrice;
  const pnlRaw = trade.direction === "buy"
    ? (parseFloat(closedPrice) - parseFloat(trade.entryPrice)) * parseFloat(trade.lotSize) * 10000
    : (parseFloat(trade.entryPrice) - parseFloat(closedPrice)) * parseFloat(trade.lotSize) * 10000;

  const [updated] = await db
    .update(tradesTable)
    .set({
      status: "closed",
      closedPrice: closedPrice,
      pnl: String(pnlRaw.toFixed(4)),
      closedAt: new Date(),
      closeReason: "manual",
    })
    .where(eq(tradesTable.id, params.data.id))
    .returning();

  res.json(CloseTradeResponse.parse(mapTrade(updated!)));
});

export default router;
