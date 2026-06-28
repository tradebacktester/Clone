---
name: Context & Visual Memory
description: Screenshot storage + rich trade context system — DB tables, API routes, image storage design, paper-engine hook, dashboard page.
---

## Key Design Decisions

**Screenshot storage**: base64 TEXT in PostgreSQL (no native `sharp`). TOAST handles large values out-of-line. Express body limit override required: `app.post("/api/memory/screenshots", express.json({ limit: "15mb" }))` must be placed BEFORE `app.use(express.json({ limit: "1mb" }))` to take effect (Express applies the first matching middleware).

**Thumbnail strategy**: images ≤ 200KB decoded → thumbnail = full image. Images > 200KB → `base64.slice(0, 50000)` as preview (~37KB). True resize requires native `sharp` (future upgrade).

**Duplicate detection**: SHA-256 of raw `Buffer.from(base64, "base64")`. Check same hash + same tradeId before INSERT.

**Max image size**: 10MB raw = ~13.7MB base64 length. Validated via `MAX_BASE64_LENGTH = Math.ceil(10_485_760 * 1.37)`.

## Valid Values

- **Stages**: before_entry, entry, during_trade, break_even, partial_tp, htf_analysis, ltf_analysis, after_exit, custom
- **MIME types**: image/png, image/jpeg, image/jpg, image/webp, image/gif
- **Timeframes**: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w
- **Emotions**: calm, confident, disciplined, uncertain, fearful, fomo

## Tables

- `trade_screenshots` — append-only, one row per screenshot, fileHash for dedup
- `trade_context` — one row per trade (upsert on trade_id UNIQUE), three sub-domains: market/strategy/trader
- `context_timeline_events` — append-only event log; merged with trade_events + screenshots in `getContextTimeline()`

## Paper Engine Hook

`autoPopulateContextFromTrade()` called in paper-engine.ts after `captureTradeOpened()`. Located in the `if (inserted?.id)` block after the V2 episodic memory section. Populates market + strategy context; trader context always left empty for manual input.

## API Routes (all under /api/memory/)

- POST /memory/screenshots — upload (15mb body limit override required)
- GET /memory/screenshots/gallery — paginated all (no imageData)
- GET /memory/screenshots/:tradeId — by trade (no imageData)
- GET /memory/screenshot/:id/image — full image
- GET /memory/screenshot/:id/thumbnail — preview
- DELETE /memory/screenshots/:id
- POST /memory/context/:tradeId — create/replace
- GET /memory/context/:tradeId — retrieve
- PATCH /memory/context/:tradeId — partial update (notes/emotion/lessons)
- POST /memory/context/:tradeId/lesson — record lesson
- POST /memory/context/:tradeId/event — add manual timeline event
- GET /memory/context-timeline/:tradeId — merged timeline (3 sources)
- GET /memory/context/search — ILIKE search (session/regime/notes/emotion/dayOfWeek)

## Dashboard

Route: `/context-memory`. Tabs: Timeline | Screenshots | Context | Notes | Search. Nav: under "AI Engine" group with Camera icon. Uses direct fetch + React Query (not generated hooks) since not in OpenAPI spec.

## Test Coverage

37 unit tests in `artifacts/api-server/src/lib/__tests__/context-visual-memory.test.ts`. All pure-JS (no DB). Tests: validateScreenshot (15), hashImage (4), generateThumbnail (3), parseImageData (5), buildSearchVector (5), set coverage (3), multi-error (2).

**Why**: thumbnail approach chosen to avoid adding native `sharp` binary dependency which complicates the esbuild CJS bundle and Replit environment.
