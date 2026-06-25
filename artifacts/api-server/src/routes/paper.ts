import { Router, type IRouter } from "express";
import { getOpenPositions, getPaperPerformance } from "../lib/paper-engine.js";
import { getPriceLastUpdated } from "../lib/price-feed.js";

const router: IRouter = Router();

router.get("/paper/positions", async (_req, res): Promise<void> => {
  const positions = await getOpenPositions();
  const totalUnrealizedPnl = positions.reduce((s, p) => s + p.unrealizedPnl, 0);
  const priceUpdatedAt = getPriceLastUpdated()?.toISOString() ?? null;

  res.json({
    positions,
    totalUnrealizedPnl: Math.round(totalUnrealizedPnl * 100) / 100,
    priceUpdatedAt,
  });
});

router.get("/paper/performance", async (_req, res): Promise<void> => {
  const perf = await getPaperPerformance();
  const priceUpdatedAt = getPriceLastUpdated()?.toISOString() ?? null;
  res.json({ ...perf, priceUpdatedAt });
});

export default router;
