import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, tradesTable, botStateTable } from "@workspace/db";
import {
  ListTradesQueryParams,
  ListTradesResponse,
  GetTradeParams,
  GetTradeResponse,
  CloseTradeParams,
  CloseTradeResponse,
} from "@workspace/api-zod";
import { getCurrentPrice } from "../lib/price-feed.js";
import { logManualClose } from "../lib/broker-engine.js";
import type { Pair } from "@workspace/market-analysis";

const router: IRouter = Router();

function getPipSize(pair: string): number {
  return pair.includes("JPY") ? 0.01 : 0.0001;
}

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
    slippagePips: t.slippagePips != null ? parseFloat(t.slippagePips) : null,
    exitSlippagePips: t.exitSlippagePips != null ? parseFloat(t.exitSlippagePips) : null,
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

  const pair = trade.pair as Pair;
  const priceEntry = getCurrentPrice(pair);
  const rawClose = priceEntry?.mid
    ? priceEntry.mid
    : (trade.currentPrice ? parseFloat(trade.currentPrice) : parseFloat(trade.entryPrice));

  const pipSize = getPipSize(trade.pair);
  const slippagePips = 0.3 + Math.random() * 0.7;
  const slippagePrice = slippagePips * pipSize;
  const closedPrice = trade.direction === "buy"
    ? rawClose - slippagePrice
    : rawClose + slippagePrice;

  const entryPrice = parseFloat(trade.entryPrice);
  const lotSize = parseFloat(trade.lotSize);
  const priceDiff = trade.direction === "buy"
    ? closedPrice - entryPrice
    : entryPrice - closedPrice;
  const pips = priceDiff / pipSize;
  const pnlRaw = Math.round(pips * lotSize * 10 * 100) / 100;
  const pnlPercent = (pnlRaw / 10000) * 100;

  const [updated] = await db
    .update(tradesTable)
    .set({
      status: "closed",
      closedPrice: String(Math.round(closedPrice * 1_000_000) / 1_000_000),
      currentPrice: String(Math.round(closedPrice * 1_000_000) / 1_000_000),
      pnl: String(pnlRaw),
      pnlPercent: String(Math.round(pnlPercent * 1000) / 1000),
      closedAt: new Date(),
      closeReason: "manual",
      exitSlippagePips: String(Math.round(slippagePips * 10) / 10),
    })
    .where(eq(tradesTable.id, params.data.id))
    .returning();

  const [botState] = await db.select().from(botStateTable).limit(1);
  const mode = (botState?.mode ?? "paper") as "paper" | "live";

  logManualClose({
    tradeId: params.data.id,
    pair: trade.pair,
    direction: trade.direction,
    price: Math.round(closedPrice * 1_000_000) / 1_000_000,
    pnl: pnlRaw,
    mode,
  }).catch(() => {});

  res.json(CloseTradeResponse.parse(mapTrade(updated!)));
});

export default router;
