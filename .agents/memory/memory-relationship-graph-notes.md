---
name: Memory Relationship Graph
description: Relationship graph + Experience objects — architecture decisions and gotchas for the Phase 2 memory layer.
---

## Tables added to lib/db/src/schema/memory.ts

- `memory_relationships` — directed soft-link graph; unique index on (fromType, fromId, toType, toId, relType); idempotent insert via SELECT first
- `memory_relationship_history` — append-only audit log for all graph operations
- `memory_experiences` — one row per trade; tradeId has UNIQUE constraint → upsert via onConflictDoUpdate({ target: tradeId })

## Table name gotcha

When importing memory tables from @workspace/db, the actual export names are:
- `marketSnapshotMemoryTable` (NOT tradeSnapshotsTable)
- `setupMemoryTable` (NOT tradeSetupsTable)
- `tradeReviewsTable` — exists in `lib/db/src/schema/trade-reviews.ts` with fields: id, tradeId, agreement, reason, confidence, notes, reviewedAt

## Auto-link hook points in paper-engine.ts

- **Trade open**: after `autoPopulateContextFromTrade()` → call `autoLinkTradeChain()` + `upsertExperienceRecord()` (both .catch(() => {}))
- **Trade close**: after `captureTradeClose()` → same two calls again (idempotent)

## Feature Vector (NOT AI)

10-dim number[] stored as JSONB in memory_experiences.featureVector. Dimensions: pnlPips, riskReward (max 20), durationMins (max 2880), volatilityScore, confirmationQuality, tiScore, liquidityScore, spreadPips (max 10), traderConfidence, screenshotCount (max 20).

**Why:** Architecture placeholder for future ML similarity search. Never computed by any AI module today.

## API routes (in routes/memory.ts)

All new imports must go at the TOP of the file — not inline after handlers (TypeScript requirement). esbuild compiles fine with top-of-file imports only.

New endpoints: GET /memory/experience/:id, /memory/experience/trade/:tradeId, /memory/experience/:id/timeline, /memory/experiences, /memory/relationships, /memory/relationships/trade/:tradeId, /memory/relationships/history, /memory/relationships/orphans, /memory/statistics, /memory/health, POST /memory/health/repair, POST /memory/experience/trade/:tradeId/refresh

## Health check auto-repairs

runIntegrityCheck() auto-repairs orphaned relationships (removes them) and missing experience records (backfills). Safe to call repeatedly. 7 checks total.

## Test results

51/51 tests pass in artifacts/api-server/src/lib/__tests__/memory-graph.test.ts
