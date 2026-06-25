import { Router, type IRouter } from "express";
import { GetNewsEventsQueryParams } from "@workspace/api-zod";
import {
  getUpcomingEvents,
  getPairStatuses,
  getCalendarWeek,
  getCacheMeta,
} from "../lib/news-fetcher.js";

const router: IRouter = Router();

const TRACKED_PAIRS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD", "GBPJPY", "EURJPY", "EURGBP"];

router.get("/news/events", async (req, res): Promise<void> => {
  const parsed = GetNewsEventsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const events = await getUpcomingEvents(parsed.data.pair, parsed.data.hours);
    const meta = getCacheMeta();
    res.json({
      events,
      fetchedAt: meta.fetchedAt ?? new Date().toISOString(),
      source: meta.source,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch news events" });
  }
});

router.get("/news/status", async (_req, res): Promise<void> => {
  try {
    const items = await getPairStatuses(TRACKED_PAIRS);
    const meta = getCacheMeta();
    res.json({
      items,
      windowMinutes: 30,
      fetchedAt: meta.fetchedAt ?? new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get news status" });
  }
});

router.get("/news/calendar", async (_req, res): Promise<void> => {
  try {
    const days = await getCalendarWeek();
    const meta = getCacheMeta();
    res.json({
      days,
      windowMinutes: 30,
      fetchedAt: meta.fetchedAt ?? new Date().toISOString(),
      source: meta.source,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get news calendar" });
  }
});

export default router;
