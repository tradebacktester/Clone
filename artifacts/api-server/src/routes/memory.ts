import { Router, type IRouter } from "express";
import {
  getMemorySummary,
  getRecentMemory,
  getMissedOpportunities,
  getConfidenceProfiles,
  getSetupRanking,
} from "../lib/memory-engine.js";
import { logger } from "../lib/logger.js";
import { memoryService } from "@workspace/market-analysis";
import {
  parseSetupQuery,
  parseSkippedQuery,
  parseSnapshotQuery,
  parseTradeQuery,
  parseStoreRequest,
  apiError,
  apiNotFound,
  MEMORY_TABLES,
} from "@workspace/market-analysis";
import {
  getTradeTimeline,
  getGlobalTimeline,
  getMemoryHistory,
  getTradeEvents,
} from "../lib/memory-capture-engine.js";

const router: IRouter = Router();

// ─── Legacy Endpoints (existing memory engine) ─────────────────────────────

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
    const top   = await getSetupRanking(10, "asc");
    const worst = await getSetupRanking(10, "desc");
    res.json({ top, worst });
  } catch (err) {
    logger.error({ err }, "memory top-setups error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── V2 Long-Term Memory Endpoints ────────────────────────────────────────

// GET /memory/trades — paginated trade memory with filters
router.get("/memory/trades", async (req, res): Promise<void> => {
  try {
    const { filters, pagination } = parseTradeQuery(req.query as Record<string, unknown>);
    const result = await memoryService.getTrades(filters, pagination);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "GET /memory/trades error");
    res.status(500).json(apiError("Failed to retrieve trade memory"));
  }
});

// GET /memory/setups — paginated setup memory with filters
router.get("/memory/setups", async (req, res): Promise<void> => {
  try {
    const { filters, pagination } = parseSetupQuery(req.query as Record<string, unknown>);
    const result = await memoryService.getSetups(filters, pagination);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "GET /memory/setups error");
    res.status(500).json(apiError("Failed to retrieve setup memory"));
  }
});

// GET /memory/setups/:id — single setup by ID
router.get("/memory/setups/:id", async (req, res): Promise<void> => {
  try {
    const record = await memoryService.getSetupById(req.params.id);
    if (!record) { res.status(404).json(apiNotFound("setup")); return; }
    res.json(record);
  } catch (err) {
    logger.error({ err }, "GET /memory/setups/:id error");
    res.status(500).json(apiError("Failed to retrieve setup"));
  }
});

// GET /memory/skipped — paginated skipped setup memory with filters
router.get("/memory/skipped", async (req, res): Promise<void> => {
  try {
    const { filters, pagination } = parseSkippedQuery(req.query as Record<string, unknown>);
    const result = await memoryService.getSkippedSetups(filters, pagination);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "GET /memory/skipped error");
    res.status(500).json(apiError("Failed to retrieve skipped setups"));
  }
});

// GET /memory/skipped/:id — single skipped setup by ID
router.get("/memory/skipped/:id", async (req, res): Promise<void> => {
  try {
    const record = await memoryService.getSkippedSetupById(req.params.id);
    if (!record) { res.status(404).json(apiNotFound("skipped setup")); return; }
    res.json(record);
  } catch (err) {
    logger.error({ err }, "GET /memory/skipped/:id error");
    res.status(500).json(apiError("Failed to retrieve skipped setup"));
  }
});

// GET /memory/snapshot — paginated market snapshots with filters
router.get("/memory/snapshot", async (req, res): Promise<void> => {
  try {
    const { filters, pagination } = parseSnapshotQuery(req.query as Record<string, unknown>);
    const result = await memoryService.getSnapshots(filters, pagination);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "GET /memory/snapshot error");
    res.status(500).json(apiError("Failed to retrieve market snapshots"));
  }
});

// GET /memory/snapshot/:id — single snapshot by ID
router.get("/memory/snapshot/:id", async (req, res): Promise<void> => {
  try {
    const record = await memoryService.getSnapshotById(req.params.id);
    if (!record) { res.status(404).json(apiNotFound("snapshot")); return; }
    res.json(record);
  } catch (err) {
    logger.error({ err }, "GET /memory/snapshot/:id error");
    res.status(500).json(apiError("Failed to retrieve snapshot"));
  }
});

// GET /memory/search — cross-table search across trades, setups, skipped
router.get("/memory/search", async (req, res): Promise<void> => {
  try {
    const q = req.query as Record<string, unknown>;
    const results = await memoryService.search({
      pair:      q.pair      ? String(q.pair).toUpperCase()      : undefined,
      direction: q.direction ? String(q.direction).toLowerCase() : undefined,
      session:   q.session   ? String(q.session).toLowerCase()   : undefined,
      regime:    q.regime    ? String(q.regime)                  : undefined,
      dateFrom:  q.dateFrom  ? new Date(String(q.dateFrom))      : undefined,
      dateTo:    q.dateTo    ? new Date(String(q.dateTo))        : undefined,
      limit:     q.limit     ? parseInt(String(q.limit))         : 20,
    });
    res.json(results);
  } catch (err) {
    logger.error({ err }, "GET /memory/search error");
    res.status(500).json(apiError("Search failed"));
  }
});

// GET /memory/integrity — list invalid / corrupt memory records
router.get("/memory/integrity", async (req, res): Promise<void> => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "100")), 500);
    const invalid = await memoryService.getInvalidRecords(limit);
    res.json({ count: invalid.length, records: invalid });
  } catch (err) {
    logger.error({ err }, "GET /memory/integrity error");
    res.status(500).json(apiError("Failed to retrieve integrity report"));
  }
});

// POST /memory/store — generic store endpoint for any memory table
router.post("/memory/store", async (req, res): Promise<void> => {
  try {
    const storeReq = parseStoreRequest(req.body);
    if (!storeReq) {
      res.status(400).json(apiError("Invalid store request — must include table, sourceModule, data"));
      return;
    }

    let result;
    switch (storeReq.table) {
      case MEMORY_TABLES.SETUP_MEMORY:
        result = await memoryService.storeSetup(storeReq.data as Parameters<typeof memoryService.storeSetup>[0]);
        break;
      case MEMORY_TABLES.SKIPPED_SETUP_MEMORY:
        result = await memoryService.storeSkippedSetup(storeReq.data as Parameters<typeof memoryService.storeSkippedSetup>[0]);
        break;
      case MEMORY_TABLES.MARKET_SNAPSHOT:
        result = await memoryService.storeSnapshot(storeReq.data as Parameters<typeof memoryService.storeSnapshot>[0]);
        break;
      default:
        res.status(400).json(apiError(`Unknown memory table: ${storeReq.table}`));
        return;
    }

    if (!result.success) {
      res.status(422).json(apiError("Validation failed", result.errors));
      return;
    }

    res.status(201).json(result.record);
  } catch (err) {
    logger.error({ err }, "POST /memory/store error");
    res.status(500).json(apiError("Failed to store memory record"));
  }
});

// POST /memory/setups/:id/link — link a setup to a trade
router.post("/memory/setups/:id/link", async (req, res): Promise<void> => {
  try {
    const { tradeId, tradeUuid } = req.body as { tradeId?: number; tradeUuid?: string };
    if (!tradeId || typeof tradeId !== "number") {
      res.status(400).json(apiError("tradeId (number) is required"));
      return;
    }

    const result = await memoryService.linkSetupToTrade(req.params.id, tradeId, tradeUuid);
    if (!result.success) {
      res.status(404).json(apiError(result.error ?? "Link failed"));
      return;
    }

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "POST /memory/setups/:id/link error");
    res.status(500).json(apiError("Failed to link setup to trade"));
  }
});

// POST /memory/setups/:id/archive — soft-delete a setup
router.post("/memory/setups/:id/archive", async (req, res): Promise<void> => {
  try {
    const result = await memoryService.archiveSetup(req.params.id);
    if (!result.success) {
      res.status(404).json(apiError(result.error ?? "Archive failed"));
      return;
    }
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "POST /memory/setups/:id/archive error");
    res.status(500).json(apiError("Failed to archive setup"));
  }
});

// ─── Memory Capture Engine — Timeline Endpoints ───────────────────────────

// GET /memory/timeline — global chronological event timeline across all pairs
router.get("/memory/timeline", async (req, res): Promise<void> => {
  try {
    const q      = req.query as Record<string, string | undefined>;
    const limit  = Math.min(parseInt(q.limit  ?? "50"),  200);
    const offset = Math.max(parseInt(q.offset ?? "0"),     0);
    const pair   = q.pair ? String(q.pair).toUpperCase() : undefined;

    const result = await getGlobalTimeline({ pair, limit, offset });
    res.json(result);
  } catch (err) {
    logger.error({ err }, "GET /memory/timeline error");
    res.status(500).json(apiError("Failed to retrieve memory timeline"));
  }
});

// GET /memory/trade/:id — full episodic timeline for a single trade
router.get("/memory/trade/:id", async (req, res): Promise<void> => {
  try {
    const tradeId = parseInt(req.params.id, 10);
    if (isNaN(tradeId) || tradeId <= 0) {
      res.status(400).json(apiError("Invalid trade ID — must be a positive integer"));
      return;
    }
    const result = await getTradeTimeline(tradeId);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "GET /memory/trade/:id error");
    res.status(500).json(apiError("Failed to retrieve trade timeline"));
  }
});

// GET /memory/trade/:id/events — just the event log for a single trade
router.get("/memory/trade/:id/events", async (req, res): Promise<void> => {
  try {
    const tradeId = parseInt(req.params.id, 10);
    if (isNaN(tradeId) || tradeId <= 0) {
      res.status(400).json(apiError("Invalid trade ID"));
      return;
    }
    const events = await getTradeEvents(tradeId);
    res.json({ tradeId, count: events.length, events });
  } catch (err) {
    logger.error({ err }, "GET /memory/trade/:id/events error");
    res.status(500).json(apiError("Failed to retrieve trade events"));
  }
});

// GET /memory/history — paginated full history of all memory records
router.get("/memory/history", async (req, res): Promise<void> => {
  try {
    const q      = req.query as Record<string, string | undefined>;
    const limit  = Math.min(parseInt(q.limit  ?? "50"),  200);
    const offset = Math.max(parseInt(q.offset ?? "0"),     0);

    const result = await getMemoryHistory({ limit, offset });
    res.json(result);
  } catch (err) {
    logger.error({ err }, "GET /memory/history error");
    res.status(500).json(apiError("Failed to retrieve memory history"));
  }
});

export default router;
