import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, marketZonesTable, marketRegimeTable, tradeSignalsTable } from "@workspace/db";
import {
  GetMarketZonesQueryParams,
  GetMarketZonesResponseItem,
  GetMarketRegimeResponseItem,
  GetActiveSignalsResponseItem,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/market/zones", async (req, res): Promise<void> => {
  const parsed = GetMarketZonesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const conditions = [eq(marketZonesTable.active, true)];
  if (parsed.data.pair) conditions.push(eq(marketZonesTable.pair, parsed.data.pair));
  if (parsed.data.timeframe) conditions.push(eq(marketZonesTable.timeframe, parsed.data.timeframe));

  const zones = await db.select().from(marketZonesTable).where(and(...conditions));
  res.json(zones.map(z => GetMarketZonesResponseItem.parse({
    id: z.id,
    pair: z.pair,
    timeframe: z.timeframe,
    zoneType: z.zoneType as "demand" | "supply",
    priceTop: parseFloat(z.priceTop),
    priceBottom: parseFloat(z.priceBottom),
    strength: parseFloat(z.strength ?? "0"),
    tested: z.tested ?? 0,
    active: z.active ?? true,
    fibLevel: z.fibLevel != null ? parseFloat(z.fibLevel) : null,
    createdAt: z.createdAt?.toISOString() ?? new Date().toISOString(),
  })));
});

router.get("/market/regime", async (_req, res): Promise<void> => {
  const regimes = await db.select().from(marketRegimeTable);
  res.json(regimes.map(r => GetMarketRegimeResponseItem.parse({
    pair: r.pair,
    regime: r.regime as "trending" | "ranging" | "volatile" | "unknown",
    trend: r.trend as "bullish" | "bearish" | "neutral",
    volatility: r.volatility as "low" | "medium" | "high",
    atr: parseFloat(r.atr ?? "0"),
    updatedAt: r.updatedAt?.toISOString() ?? new Date().toISOString(),
  })));
});

router.get("/market/signals", async (_req, res): Promise<void> => {
  const signals = await db.select().from(tradeSignalsTable).where(eq(tradeSignalsTable.active, true));
  res.json(signals.map(s => GetActiveSignalsResponseItem.parse({
    id: s.id,
    pair: s.pair,
    direction: s.direction as "buy" | "sell",
    confidence: parseFloat(s.confidence ?? "0"),
    zoneType: s.zoneType as "demand" | "supply",
    zoneStrength: parseFloat(s.zoneStrength ?? "0"),
    amdPhase: s.amdPhase as "accumulation" | "manipulation" | "distribution",
    fibLevel: parseFloat(s.fibLevel ?? "0"),
    session: s.session,
    generatedAt: s.generatedAt?.toISOString() ?? new Date().toISOString(),
  })));
});

export default router;
