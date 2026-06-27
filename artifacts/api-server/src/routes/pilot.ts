import { Router, type IRouter } from "express";
import {
  getPilotStatus,
  enablePilotMode,
  disablePilotMode,
  clearPilotHalt,
  updatePilotConfig,
  getPilotEvents,
} from "../lib/pilot-engine.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// GET /pilot/status
router.get("/pilot/status", async (_req, res): Promise<void> => {
  try {
    const status = await getPilotStatus();
    res.json(status);
  } catch (err) {
    logger.error({ err }, "GET /pilot/status failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /pilot/config
router.get("/pilot/config", async (_req, res): Promise<void> => {
  try {
    const status = await getPilotStatus();
    res.json(status);
  } catch (err) {
    logger.error({ err }, "GET /pilot/config failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /pilot/config
router.put("/pilot/config", async (req, res): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const result = await updatePilotConfig({
      maxRiskPerTradePct: body["maxRiskPerTradePct"] != null ? Number(body["maxRiskPerTradePct"]) : undefined,
      maxDailyLossPct: body["maxDailyLossPct"] != null ? Number(body["maxDailyLossPct"]) : undefined,
      maxWeeklyLossPct: body["maxWeeklyLossPct"] != null ? Number(body["maxWeeklyLossPct"]) : undefined,
      maxOpenTrades: body["maxOpenTrades"] != null ? Number(body["maxOpenTrades"]) : undefined,
      manualConfirmRequired: body["manualConfirmRequired"] != null ? Boolean(body["manualConfirmRequired"]) : undefined,
      shutdownOnNConsecLosses: body["shutdownOnNConsecLosses"] != null ? Number(body["shutdownOnNConsecLosses"]) : undefined,
      requireCertification: body["requireCertification"] != null ? Boolean(body["requireCertification"]) : undefined,
    });
    res.json(result);
  } catch (err) {
    logger.error({ err }, "PUT /pilot/config failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /pilot/enable
router.post("/pilot/enable", async (req, res): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const brokerAccountId = body["brokerAccountId"] != null ? Number(body["brokerAccountId"]) : undefined;
    const result = await enablePilotMode(brokerAccountId);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "POST /pilot/enable failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /pilot/disable
router.post("/pilot/disable", async (req, res): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const reason = body["reason"] != null ? String(body["reason"]) : undefined;
    const result = await disablePilotMode(reason);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "POST /pilot/disable failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /pilot/clear-halt
router.post("/pilot/clear-halt", async (_req, res): Promise<void> => {
  try {
    const result = await clearPilotHalt();
    res.json(result);
  } catch (err) {
    logger.error({ err }, "POST /pilot/clear-halt failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /pilot/events
router.get("/pilot/events", async (req, res): Promise<void> => {
  try {
    const limit = Math.min(parseInt(String(req.query["limit"] ?? "50"), 10), 200);
    const offset = parseInt(String(req.query["offset"] ?? "0"), 10);
    const events = await getPilotEvents(limit, offset);
    res.json({ events });
  } catch (err) {
    logger.error({ err }, "GET /pilot/events failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
