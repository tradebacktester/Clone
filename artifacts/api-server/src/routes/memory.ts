import { Router, type IRouter } from "express";
import {
  getMemorySummary,
  getRecentMemory,
  getMissedOpportunities,
  getConfidenceProfiles,
  getSetupRanking,
} from "../lib/memory-engine.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

router.get("/analytics/memory/summary", async (_req, res): Promise<void> => {
  try {
    res.json(await getMemorySummary());
  } catch (err) {
    logger.error({ err }, "memory summary error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/analytics/memory/trades", async (req, res): Promise<void> => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 200);
    res.json(await getRecentMemory(limit));
  } catch (err) {
    logger.error({ err }, "memory trades error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/analytics/memory/missed", async (req, res): Promise<void> => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 200);
    res.json(await getMissedOpportunities(limit));
  } catch (err) {
    logger.error({ err }, "memory missed error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/analytics/memory/confidence-profiles", async (_req, res): Promise<void> => {
  try {
    res.json(await getConfidenceProfiles());
  } catch (err) {
    logger.error({ err }, "memory confidence profiles error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/analytics/memory/top-setups", async (_req, res): Promise<void> => {
  try {
    const top  = await getSetupRanking(10, "asc");
    const worst = await getSetupRanking(10, "desc");
    res.json({ top, worst });
  } catch (err) {
    logger.error({ err }, "memory top-setups error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
