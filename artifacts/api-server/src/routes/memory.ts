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
import {
  uploadScreenshot,
  validateScreenshot,
  getTradeScreenshots,
  getScreenshotImage,
  getScreenshotThumbnail,
  deleteScreenshot,
  getAllScreenshots,
  getScreenshotSummary,
} from "../lib/visual-memory.js";
import {
  upsertTradeContext,
  patchTradeContext,
  getTradeContext,
  getContextTimeline,
  searchContextMemory,
  addContextTimelineEvent,
  recordLesson,
} from "../lib/context-memory.js";
import {
  getExperience,
  getExperienceByTradeId,
  searchExperiences,
  getExperienceTimeline,
  upsertExperienceRecord,
} from "../lib/experience-builder.js";
import {
  getRelationshipsForEntity,
  getAllTradeRelationships,
  getRelationshipStats,
  autoLinkTradeChain,
  detectOrphanedRelationships,
  getRelationshipHistory,
  type EntityType,
} from "../lib/relationship-engine.js";
import {
  runIntegrityCheck,
  getMemoryStatistics,
  runRepair,
} from "../lib/memory-health.js";

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

// ═══════════════════════════════════════════════════════════════════════════
// VISUAL MEMORY — Screenshot Management
// ═══════════════════════════════════════════════════════════════════════════

// POST /memory/screenshots — upload a screenshot
router.post("/memory/screenshots", async (req, res): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;

    const upload = {
      tradeId:          body.tradeId    ? Number(body.tradeId)  : undefined,
      setupId:          body.setupId    ? String(body.setupId)  : undefined,
      snapshotId:       body.snapshotId ? String(body.snapshotId) : undefined,
      contextId:        body.contextId  ? String(body.contextId) : undefined,
      stage:            String(body.stage    ?? "custom"),
      timeframe:        body.timeframe  ? String(body.timeframe) : undefined,
      pair:             body.pair       ? String(body.pair)      : undefined,
      theme:            (body.theme === "light" ? "light" : "dark") as "dark" | "light",
      resolution:       body.resolution ? String(body.resolution) : undefined,
      notes:            body.notes      ? String(body.notes)     : undefined,
      tags:             Array.isArray(body.tags) ? body.tags as string[] : undefined,
      chartAnnotations: typeof body.chartAnnotations === "object" ? body.chartAnnotations as Record<string, unknown> : undefined,
      imageData:        String(body.imageData ?? ""),
      capturedAt:       body.capturedAt ? String(body.capturedAt) : undefined,
    };

    const errors = validateScreenshot(upload);
    if (errors.length > 0) {
      res.status(400).json({ error: "Validation failed", details: errors });
      return;
    }

    const result = await uploadScreenshot(upload);
    res.status(result.isDuplicate ? 200 : 201).json(result);
  } catch (err) {
    logger.error({ err }, "POST /memory/screenshots error");
    res.status(500).json(apiError("Failed to upload screenshot"));
  }
});

// GET /memory/screenshots/gallery — all screenshots (paginated)
router.get("/memory/screenshots/gallery", async (req, res): Promise<void> => {
  try {
    const q      = req.query as Record<string, string | undefined>;
    const limit  = Math.min(parseInt(q.limit  ?? "50"),  200);
    const offset = Math.max(parseInt(q.offset ?? "0"),     0);
    const results = await getAllScreenshots({ pair: q.pair, stage: q.stage, timeframe: q.timeframe, limit, offset });
    res.json({ count: results.length, screenshots: results });
  } catch (err) {
    logger.error({ err }, "GET /memory/screenshots/gallery error");
    res.status(500).json(apiError("Failed to retrieve screenshot gallery"));
  }
});

// GET /memory/screenshots/:tradeId — all screenshots for a trade (no imageData)
router.get("/memory/screenshots/:tradeId", async (req, res): Promise<void> => {
  try {
    const tradeId = parseInt(req.params.tradeId, 10);
    if (isNaN(tradeId) || tradeId <= 0) {
      res.status(400).json(apiError("Invalid trade ID"));
      return;
    }
    const [screenshots, summary] = await Promise.all([
      getTradeScreenshots(tradeId),
      getScreenshotSummary(tradeId),
    ]);
    res.json({ tradeId, ...summary, screenshots });
  } catch (err) {
    logger.error({ err }, "GET /memory/screenshots/:tradeId error");
    res.status(500).json(apiError("Failed to retrieve screenshots"));
  }
});

// GET /memory/screenshot/:id/image — full resolution image
router.get("/memory/screenshot/:id/image", async (req, res): Promise<void> => {
  try {
    const record = await getScreenshotImage(req.params.id);
    if (!record) {
      res.status(404).json(apiError("Screenshot not found"));
      return;
    }
    res.json(record);
  } catch (err) {
    logger.error({ err }, "GET /memory/screenshot/:id/image error");
    res.status(500).json(apiError("Failed to retrieve screenshot image"));
  }
});

// GET /memory/screenshot/:id/thumbnail — small thumbnail
router.get("/memory/screenshot/:id/thumbnail", async (req, res): Promise<void> => {
  try {
    const record = await getScreenshotThumbnail(req.params.id);
    if (!record) {
      res.status(404).json(apiError("Screenshot not found"));
      return;
    }
    res.json(record);
  } catch (err) {
    logger.error({ err }, "GET /memory/screenshot/:id/thumbnail error");
    res.status(500).json(apiError("Failed to retrieve thumbnail"));
  }
});

// DELETE /memory/screenshots/:id — remove screenshot
router.delete("/memory/screenshots/:id", async (req, res): Promise<void> => {
  try {
    const deleted = await deleteScreenshot(req.params.id);
    if (!deleted) {
      res.status(404).json(apiError("Screenshot not found"));
      return;
    }
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    logger.error({ err }, "DELETE /memory/screenshots/:id error");
    res.status(500).json(apiError("Failed to delete screenshot"));
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT MEMORY
// ═══════════════════════════════════════════════════════════════════════════

// POST /memory/context/:tradeId — create or replace context for a trade
router.post("/memory/context/:tradeId", async (req, res): Promise<void> => {
  try {
    const tradeId = parseInt(req.params.tradeId, 10);
    if (isNaN(tradeId) || tradeId <= 0) {
      res.status(400).json(apiError("Invalid trade ID"));
      return;
    }
    const body    = req.body as Record<string, unknown>;
    const record  = await upsertTradeContext({ tradeId, ...body as Record<string, unknown> });
    res.status(201).json(record);
  } catch (err) {
    logger.error({ err }, "POST /memory/context/:tradeId error");
    res.status(500).json(apiError("Failed to save context"));
  }
});

// GET /memory/context/:tradeId — retrieve context for a trade
router.get("/memory/context/:tradeId", async (req, res): Promise<void> => {
  try {
    const tradeId = parseInt(req.params.tradeId, 10);
    if (isNaN(tradeId) || tradeId <= 0) {
      res.status(400).json(apiError("Invalid trade ID"));
      return;
    }
    const record = await getTradeContext(tradeId);
    if (!record) {
      res.status(404).json(apiError("No context found for this trade — POST to create one"));
      return;
    }
    res.json(record);
  } catch (err) {
    logger.error({ err }, "GET /memory/context/:tradeId error");
    res.status(500).json(apiError("Failed to retrieve context"));
  }
});

// PATCH /memory/context/:tradeId — update trader notes / emotion / lessons
router.patch("/memory/context/:tradeId", async (req, res): Promise<void> => {
  try {
    const tradeId = parseInt(req.params.tradeId, 10);
    if (isNaN(tradeId) || tradeId <= 0) {
      res.status(400).json(apiError("Invalid trade ID"));
      return;
    }
    const body   = req.body as Record<string, unknown>;
    const patch  = {
      manualNotes:    body.manualNotes    ? String(body.manualNotes)    : undefined,
      confidence:     body.confidence     !== undefined ? Number(body.confidence) : undefined,
      emotionTag:     body.emotionTag     ? String(body.emotionTag)     : undefined,
      reasonAccepted: body.reasonAccepted ? String(body.reasonAccepted) : undefined,
      reasonRejected: body.reasonRejected ? String(body.reasonRejected) : undefined,
      lessonsLearned: body.lessonsLearned ? String(body.lessonsLearned) : undefined,
      reviewedAt:     body.reviewedAt     ? new Date(String(body.reviewedAt)) : undefined,
    };
    const updated = await patchTradeContext(tradeId, patch);
    if (!updated) {
      res.status(404).json(apiError("No context found for this trade"));
      return;
    }
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "PATCH /memory/context/:tradeId error");
    res.status(500).json(apiError("Failed to update context"));
  }
});

// POST /memory/context/:tradeId/lesson — add a lesson learned
router.post("/memory/context/:tradeId/lesson", async (req, res): Promise<void> => {
  try {
    const tradeId = parseInt(req.params.tradeId, 10);
    if (isNaN(tradeId) || tradeId <= 0) {
      res.status(400).json(apiError("Invalid trade ID"));
      return;
    }
    const body    = req.body as Record<string, unknown>;
    const lesson  = String(body.lesson ?? "");
    const emotion = body.emotion ? String(body.emotion) : undefined;

    if (!lesson.trim()) {
      res.status(400).json(apiError("lesson field is required"));
      return;
    }

    await recordLesson(tradeId, lesson, emotion);
    res.json({ success: true, tradeId });
  } catch (err) {
    logger.error({ err }, "POST /memory/context/:tradeId/lesson error");
    res.status(500).json(apiError("Failed to record lesson"));
  }
});

// POST /memory/context/:tradeId/event — add a manual timeline event
router.post("/memory/context/:tradeId/event", async (req, res): Promise<void> => {
  try {
    const tradeId = parseInt(req.params.tradeId, 10);
    if (isNaN(tradeId) || tradeId <= 0) {
      res.status(400).json(apiError("Invalid trade ID"));
      return;
    }
    const body = req.body as Record<string, unknown>;
    if (!body.stage || !body.title) {
      res.status(400).json(apiError("stage and title are required"));
      return;
    }
    await addContextTimelineEvent(
      tradeId,
      body.setupId ? String(body.setupId) : undefined,
      String(body.stage),
      String(body.title),
      body.description ? String(body.description) : undefined,
      typeof body.meta === "object" ? body.meta as Record<string, unknown> : undefined,
      "user",
    );
    res.json({ success: true, tradeId });
  } catch (err) {
    logger.error({ err }, "POST /memory/context/:tradeId/event error");
    res.status(500).json(apiError("Failed to add timeline event"));
  }
});

// GET /memory/context-timeline/:tradeId — full rich context timeline
router.get("/memory/context-timeline/:tradeId", async (req, res): Promise<void> => {
  try {
    const tradeId = parseInt(req.params.tradeId, 10);
    if (isNaN(tradeId) || tradeId <= 0) {
      res.status(400).json(apiError("Invalid trade ID"));
      return;
    }
    const events = await getContextTimeline(tradeId);
    res.json({ tradeId, count: events.length, events });
  } catch (err) {
    logger.error({ err }, "GET /memory/context-timeline/:tradeId error");
    res.status(500).json(apiError("Failed to retrieve context timeline"));
  }
});

// GET /memory/context/search — search context by pair, session, regime, notes, etc.
router.get("/memory/context/search", async (req, res): Promise<void> => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const results = await searchContextMemory({
      session:    q.session,
      regime:     q.regime,
      notes:      q.notes,
      emotionTag: q.emotionTag,
      dayOfWeek:  q.dayOfWeek,
      dateFrom:   q.dateFrom,
      dateTo:     q.dateTo,
      limit:      q.limit  ? Math.min(parseInt(q.limit),  200) : 50,
      offset:     q.offset ? Math.max(parseInt(q.offset), 0)   : 0,
    });
    res.json(results);
  } catch (err) {
    logger.error({ err }, "GET /memory/context/search error");
    res.status(500).json(apiError("Failed to search context memory"));
  }
});

// ─── Experience by Experience UUID ─────────────────────────────────────────────
router.get("/memory/experience/:id", async (req, res): Promise<void> => {
  try {
    const experience = await getExperience(req.params.id!);
    if (!experience) {
      res.status(404).json(apiNotFound("Experience not found"));
      return;
    }
    res.json(experience);
  } catch (err) {
    logger.error({ err }, "GET /memory/experience/:id error");
    res.status(500).json(apiError("Failed to retrieve experience"));
  }
});

// ─── Experience by Trade ID ─────────────────────────────────────────────────
router.get("/memory/experience/trade/:tradeId", async (req, res): Promise<void> => {
  try {
    const tradeId = parseInt(req.params.tradeId!);
    if (isNaN(tradeId)) { res.status(400).json(apiError("Invalid tradeId")); return; }
    const experience = await getExperienceByTradeId(tradeId);
    if (!experience) {
      res.status(404).json(apiNotFound("Experience not found for this trade"));
      return;
    }
    res.json(experience);
  } catch (err) {
    logger.error({ err }, "GET /memory/experience/trade/:tradeId error");
    res.status(500).json(apiError("Failed to retrieve experience by trade"));
  }
});

// ─── Experience Timeline ────────────────────────────────────────────────────
router.get("/memory/experience/:id/timeline", async (req, res): Promise<void> => {
  try {
    const exp = await getExperience(req.params.id!);
    if (!exp?.tradeId) { res.status(404).json(apiNotFound("Experience not found")); return; }
    const timeline = await getExperienceTimeline(exp.tradeId);
    res.json(timeline);
  } catch (err) {
    logger.error({ err }, "GET /memory/experience/:id/timeline error");
    res.status(500).json(apiError("Failed to build experience timeline"));
  }
});

// ─── Refresh / Rebuild a Single Experience ─────────────────────────────────
router.post("/memory/experience/trade/:tradeId/refresh", async (req, res): Promise<void> => {
  try {
    const tradeId = parseInt(req.params.tradeId!);
    if (isNaN(tradeId)) { res.status(400).json(apiError("Invalid tradeId")); return; }
    await autoLinkTradeChain({ tradeId });
    const record = await upsertExperienceRecord(tradeId);
    res.json({ ok: true, tradeId, experienceId: record.experienceId });
  } catch (err) {
    logger.error({ err }, "POST /memory/experience/trade/:tradeId/refresh error");
    res.status(500).json(apiError("Failed to refresh experience"));
  }
});

// ─── List / Search Experiences ──────────────────────────────────────────────
// Compound filter — all params are optional.
// GET /memory/experiences?pair=EUR/USD&session=london&outcome=win&limit=20
router.get("/memory/experiences", async (req, res): Promise<void> => {
  try {
    const q = req.query as Record<string, string>;
    const opts = {
      pair:             q.pair,
      session:          q.session,
      marketRegime:     q.marketRegime,
      outcome:          q.outcome,
      direction:        q.direction,
      volatility:       q.volatility,
      emotionTag:       q.emotionTag,
      dayOfWeek:        q.dayOfWeek,
      htfBias:          q.htfBias,
      hasLessons:       q.hasLessons    === "true" ? true  : q.hasLessons    === "false" ? false : undefined,
      hasScreenshots:   q.hasScreenshots=== "true" ? true  : q.hasScreenshots=== "false" ? false : undefined,
      hasReview:        q.hasReview     === "true" ? true  : q.hasReview     === "false" ? false : undefined,
      pnlMin:           q.pnlMin        ? parseFloat(q.pnlMin)        : undefined,
      pnlMax:           q.pnlMax        ? parseFloat(q.pnlMax)        : undefined,
      rrMin:            q.rrMin         ? parseFloat(q.rrMin)         : undefined,
      rrMax:            q.rrMax         ? parseFloat(q.rrMax)         : undefined,
      liquidityScoreMin: q.liquidityScoreMin ? parseFloat(q.liquidityScoreMin) : undefined,
      liquidityScoreMax: q.liquidityScoreMax ? parseFloat(q.liquidityScoreMax) : undefined,
      confidenceMin:    q.confidenceMin ? parseFloat(q.confidenceMin) : undefined,
      confidenceMax:    q.confidenceMax ? parseFloat(q.confidenceMax) : undefined,
      zoneQualityMin:   q.zoneQualityMin? parseFloat(q.zoneQualityMin): undefined,
      zoneQualityMax:   q.zoneQualityMax? parseFloat(q.zoneQualityMax): undefined,
      dateFrom:         q.dateFrom,
      dateTo:           q.dateTo,
      orderBy:          q.orderBy as "newest" | "oldest" | "pnl_desc" | "pnl_asc" | "rr_desc" | undefined,
      limit:            q.limit  ? parseInt(q.limit)  : 50,
      offset:           q.offset ? parseInt(q.offset) : 0,
    };

    const result = await searchExperiences(opts);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "GET /memory/experiences error");
    res.status(500).json(apiError("Failed to list experiences"));
  }
});

// ─── Relationships for an Entity ───────────────────────────────────────────
// GET /memory/relationships?type=trade&id=42
router.get("/memory/relationships", async (req, res): Promise<void> => {
  try {
    const { type, id } = req.query as { type?: string; id?: string };
    if (!type || !id) {
      // Return graph-wide stats if no entity specified
      const stats = await getRelationshipStats();
      res.json(stats);
      return;
    }
    const entityType = type as EntityType;
    const result     = await getRelationshipsForEntity(entityType, id);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "GET /memory/relationships error");
    res.status(500).json(apiError("Failed to retrieve relationships"));
  }
});

// GET /memory/relationships/trade/:tradeId — all relationships for a trade
router.get("/memory/relationships/trade/:tradeId", async (req, res): Promise<void> => {
  try {
    const tradeId = parseInt(req.params.tradeId!);
    if (isNaN(tradeId)) { res.status(400).json(apiError("Invalid tradeId")); return; }
    const relationships = await getAllTradeRelationships(tradeId);
    res.json({ tradeId, relationships, count: relationships.length });
  } catch (err) {
    logger.error({ err }, "GET /memory/relationships/trade/:tradeId error");
    res.status(500).json(apiError("Failed to retrieve trade relationships"));
  }
});

// ─── Memory Statistics ──────────────────────────────────────────────────────
router.get("/memory/statistics", async (req, res): Promise<void> => {
  try {
    const stats = await getMemoryStatistics();
    res.json(stats);
  } catch (err) {
    logger.error({ err }, "GET /memory/statistics error");
    res.status(500).json(apiError("Failed to compute memory statistics"));
  }
});

// ─── Memory Health Check ─────────────────────────────────────────────────────
router.get("/memory/health", async (req, res): Promise<void> => {
  try {
    const report = await runIntegrityCheck();
    res.json(report);
  } catch (err) {
    logger.error({ err }, "GET /memory/health error");
    res.status(500).json(apiError("Failed to run memory health check"));
  }
});

// ─── Trigger Memory Repair ───────────────────────────────────────────────────
router.post("/memory/health/repair", async (req, res): Promise<void> => {
  try {
    const result = await runRepair();
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err }, "POST /memory/health/repair error");
    res.status(500).json(apiError("Failed to run memory repair"));
  }
});

// ─── Relationship History ────────────────────────────────────────────────────
router.get("/memory/relationships/history", async (req, res): Promise<void> => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const history = await getRelationshipHistory(limit);
    res.json({ history, count: history.length });
  } catch (err) {
    logger.error({ err }, "GET /memory/relationships/history error");
    res.status(500).json(apiError("Failed to retrieve relationship history"));
  }
});

// ─── Orphan Detection ────────────────────────────────────────────────────────
router.get("/memory/relationships/orphans", async (req, res): Promise<void> => {
  try {
    const report = await detectOrphanedRelationships();
    res.json(report);
  } catch (err) {
    logger.error({ err }, "GET /memory/relationships/orphans error");
    res.status(500).json(apiError("Failed to detect orphans"));
  }
});

export default router;

