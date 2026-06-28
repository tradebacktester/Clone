# KRYTOS V2 — Memory Relationship Graph

**Phase 2 / Prompt 4: Memory Relationship Graph & Intelligent Retrieval**

---

## Overview

The Memory Relationship Graph transforms isolated trade records into an interconnected knowledge network.

KRYTOS no longer remembers individual trades.

It remembers **Experiences** — complete, timestamped, searchable knowledge objects that contain everything that happened in a trade journey: market context, strategy signal, screenshots, events, outcome, lessons, and all relationships between them.

Future AI modules request **Experiences**, not individual database rows.

---

## Architecture

```
Market Snapshot
      │
      │ has_setup
      ▼
  Trade Setup
      │
      │ has_trade
      ▼
    Trade ◄──────────────────────────────┐
      │                                  │
      │ has_context    has_screenshot    │  followed_by
      │ has_review     has_lesson        │
      ▼                                  │
  Context          Screenshot          Trade (next)
  Reviews          Events
  Lessons          Timeline Events
```

### Entity Types

| Type         | Description                              |
|--------------|------------------------------------------|
| `snapshot`   | Market snapshot / HTF analysis           |
| `setup`      | Trade setup (AMD, zone, signal)          |
| `trade`      | Executed trade (entry, SL, TP, outcome)  |
| `context`    | Market + strategy + trader context       |
| `screenshot` | Chart screenshot at any trade stage      |
| `event`      | Trade lifecycle event (opened, closed)   |
| `review`     | Post-trade review record                 |
| `lesson`     | Lesson extracted from review             |

### Relationship Types

| Relationship    | From       | To           | Description                              |
|-----------------|------------|--------------|------------------------------------------|
| `has_snapshot`  | snapshot   | setup        | Snapshot that identified the setup       |
| `has_setup`     | setup      | trade        | Setup that produced the trade            |
| `has_trade`     | setup      | trade        | (reverse direction convenience link)     |
| `has_context`   | trade      | context      | Market + strategy + trader context       |
| `has_screenshot`| trade      | screenshot   | Chart screenshot taken during trade      |
| `has_event`     | trade      | event        | Trade lifecycle event                    |
| `has_review`    | trade      | review       | Post-trade review                        |
| `has_lesson`    | trade      | lesson       | Extracted lesson (via review)            |
| `followed_by`   | trade      | trade        | Sequential trade chain                   |
| `superseded_by` | setup      | setup        | When a setup is replaced by a new one    |
| `related_to`    | any        | any          | Soft semantic link (future use)          |

---

## Experience Object

Every trade produces exactly one **Experience** record (`memory_experiences` table).

```typescript
interface ExperienceObject {
  // Identity
  experienceId:   string;   // Stable UUID — the permanent external ID
  tradeId:        number;   // Internal DB trade ID
  setupId:        string;   // Setup UUID
  snapshotId:     string;   // Snapshot UUID

  // Searchable labels (compound filter targets)
  pair:           string;   // "EUR/USD", "GBP/USD", "USD/JPY"
  direction:      string;   // "long" | "short"
  session:        string;   // "london" | "new_york" | "asian"
  marketRegime:   string;   // "trending" | "ranging" | "volatile" | "low_volatility"
  amdStage:       string;   // "accumulation" | "manipulation" | "distribution"
  outcome:        string;   // "win" | "loss" | "break_even" | "open"
  dayOfWeek:      string;
  volatility:     string;
  htfBias:        string;
  emotionTag:     string;

  // Metrics (range-queryable)
  pnlPips:        number;
  riskReward:     number;
  durationMins:   number;
  confidenceScore: number;
  zoneQuality:    number;
  liquidityScore: number;
  amdQuality:     number;

  // Completeness flags
  hasContext:      boolean;
  hasScreenshots:  boolean;
  hasReview:       boolean;
  hasLessons:      boolean;
  screenshotCount: number;
  eventCount:      number;
  relationshipCount: number;

  // Rich hydrated data (available on full GET /memory/experience/:id)
  context:      TradeContext;
  screenshots:  Screenshot[];
  timeline:     TimelineEvent[];
  relationships: RelationshipEdge[];
  notes:        string;
  lessons:      string;

  // ── AI Integration Placeholders (future — NOT active) ──────────────────
  featureVector:        number[];   // 10-dim numeric snapshot
  similarityMetadata:   { ... };    // nearest neighbours (future cosine search)
  embeddingPlaceholder: { ... };    // external vector DB slot
}
```

---

## Feature Vector

Every Experience includes a **10-dimensional feature vector** as a numeric snapshot.

This is **NOT an AI embedding**. It is a structured numeric representation of the trade's key metrics, reserved for future ML similarity search.

```
Dimension  Field                Example
─────────────────────────────────────────────────────
[0]        pnlPips              +23.5   (raw, unbounded)
[1]        riskReward           2.5     (clamped: 0–20)
[2]        durationMins         90      (clamped: 0–2880)
[3]        volatilityScore      65      (clamped: 0–100)
[4]        confirmationQuality  80      (clamped: 0–100)
[5]        traderIntelligenceScore 72   (clamped: 0–100)
[6]        liquidityScore       55      (clamped: 0–100)
[7]        spreadPips           1.2     (clamped: 0–10)
[8]        traderConfidence     80      (clamped: 0–100)
[9]        screenshotCount      3       (clamped: 0–20)
```

---

## Database Tables

### `memory_relationships`

Directed soft-link graph edges. No SQL foreign keys — integrity managed by RelationshipEngine.

| Column      | Type      | Description                        |
|-------------|-----------|------------------------------------|
| id          | SERIAL    | Primary key                        |
| from_type   | TEXT      | Source entity type                 |
| from_id     | TEXT      | Source entity ID (UUID or int)     |
| to_type     | TEXT      | Target entity type                 |
| to_id       | TEXT      | Target entity ID                   |
| rel_type    | TEXT      | Relationship type                  |
| strength    | NUMERIC   | Future relevance weight (0.0–1.0)  |
| meta        | JSONB     | Optional metadata                  |
| created_at  | TIMESTAMPTZ |                                  |
| updated_at  | TIMESTAMPTZ |                                  |

**Unique index** on `(from_type, from_id, to_type, to_id, rel_type)` — ensures idempotent relationship creation.

### `memory_relationship_history`

Append-only audit log for all relationship create/update/delete/repair actions.

### `memory_experiences`

One row per trade experience — the central index record for the graph.

Contains denormalised labels and metrics for fast compound filtering without joining all source tables.

---

## API Endpoints

### Experience Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/memory/experience/:id` | Retrieve full Experience by UUID |
| `GET`  | `/memory/experience/trade/:tradeId` | Retrieve Experience by trade ID |
| `GET`  | `/memory/experience/:id/timeline` | Reconstructed chronological timeline |
| `POST` | `/memory/experience/trade/:tradeId/refresh` | Rebuild relationship chain + experience record |
| `GET`  | `/memory/experiences` | List/search experiences (compound filter) |

### Search Query Parameters

All parameters are optional and combinable:

```
pair, session, marketRegime, outcome, direction, volatility,
emotionTag, dayOfWeek, htfBias,
hasLessons, hasScreenshots, hasReview (true/false),
pnlMin, pnlMax, rrMin, rrMax,
confidenceMin, confidenceMax, liquidityScoreMin, liquidityScoreMax,
zoneQualityMin, zoneQualityMax,
dateFrom, dateTo,
orderBy (newest|oldest|pnl_desc|pnl_asc|rr_desc),
limit, offset
```

**Compound search example:**

```
GET /memory/experiences?pair=EUR/USD&session=london&marketRegime=trending&outcome=win&rrMin=2.0
```

### Relationship Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/memory/relationships` | Graph-wide stats (no params) or entity relationships (?type=&id=) |
| `GET`  | `/memory/relationships/trade/:tradeId` | All relationships for a trade |
| `GET`  | `/memory/relationships/history` | Relationship audit log |
| `GET`  | `/memory/relationships/orphans` | Orphan detection (no deletion) |

### Health & Statistics

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/memory/statistics` | Full memory analytics |
| `GET`  | `/memory/health` | Run integrity check (with auto-repair) |
| `POST` | `/memory/health/repair` | Trigger full repair: remove orphans + backfill experiences |

---

## Integrity Validation

The Memory Health Engine runs 7 integrity checks:

| Check | Description | Auto-Repair |
|-------|-------------|-------------|
| 1. Orphaned relationships | Links pointing to deleted entities | ✅ Yes — removes links |
| 2. Ghost experiences | Records with no events | ❌ Alert only |
| 3. Missing experience records | Trades with events but no experience | ✅ Yes — backfills |
| 4. No context record | Experiences without trade context | ❌ Alert only |
| 5. No screenshots | Experiences without chart screenshots | ❌ Alert only |
| 6. Duplicate experiences | Multiple records per trade | ❌ Manual cleanup |
| 7. Low quality score | Integrity score < 40% | ❌ Alert with guidance |

**Health Score Calculation:**

```
dataQualityScore = 100
  - (criticals × 30)
  - (warnings  × 10)
  - (infos     × 2)
  clamp to [0, 100]
```

**Overall Health:**
- `healthy`  — zero issues
- `degraded` — warnings only
- `critical` — at least one critical issue

---

## Relationship Engine

### Auto-Link Trigger Points

The RelationshipEngine is called automatically from the paper engine at two points:

1. **Trade Open** → `autoLinkTradeChain({ tradeId, setupId, snapshotId })`
   - Creates: snapshot→setup, setup→trade, trade→context
   - Creates: trade→screenshot for any screenshots already uploaded

2. **Trade Close** → `autoLinkTradeChain({ tradeId })`
   - Re-runs the same logic (idempotent)
   - Picks up any screenshots/context added during the trade

### Idempotency

`ensureRelationship()` always does a SELECT before INSERT. The unique index prevents duplicate rows. It is safe to call `autoLinkTradeChain` many times for the same trade.

### Sequential Trade Chains

```typescript
await linkSequentialTrades(previousTradeId, currentTradeId);
// Creates: trade:prevId → followed_by → trade:currId
```

---

## Experience Timeline Reconstruction

The `getExperienceTimeline(tradeId)` function merges four event sources:

```
Engine Events      (tradeEventsTable)          → "Trade Entry", "Trade Exit"
Context Events     (contextTimelineEventsTable) → "Market Scan", "Setup Identified"
Screenshots        (tradeScreenshotsTable)       → "Screenshot — confirmation"
Reviews            (tradeReviewsTable)           → "Trade Reviewed"
```

All events are sorted by `occurredAt`. The result is a unified timeline showing everything that happened from market scan to post-trade review.

---

## Memory Statistics

`getMemoryStatistics()` returns:

```
totalExperiences, winningExperiences, losingExperiences, breakEvenExperiences, openExperiences
experiencesWithContext, experiencesWithScreenshots, experiencesWithReviews, experiencesWithLessons
avgDurationMins, avgRiskReward, avgPnlPips
avgScreenshotsPerTrade, avgEventsPerTrade
totalScreenshots, totalEvents, totalRelationships
memoryGrowthRate (experiences/day over last 7 days)
estimatedStorageMB
relationshipDensity (graph density score 0–100)
dataQualityScore (% of experiences with full coverage)
oldestExperience, newestExperience
byPair, byOutcome, bySession, byRegime, byEmotion
```

---

## Future AI Integration

The Experience model is designed for clean AI module integration.

### Embedding (future)

When an AI embedding module is enabled:

1. Compute embedding from `context.manualNotes + context.lessonsLearned + pair + session + regime + outcome`
2. Store in external vector DB (Pinecone, pgvector, etc.)
3. Update `embeddingPlaceholder.vectorId` and `embeddingPlaceholder.computed = true`

### Similarity Search (future)

When a similarity search module is enabled:

1. Query vector DB for nearest neighbours by `experienceId`
2. Update `similarityMetadata.nearestNeighbours` with top-k `experienceId` UUIDs
3. Store cosine similarity scores in `similarityMetadata.similarityScores`

### Feature Vector ML (future)

The 10-dim `featureVector` is a numeric snapshot that can be used as input to:
- K-means clustering for pattern discovery
- Nearest-neighbour search without embeddings
- Trade quality regression models

**These placeholders exist in the DB schema today but are not computed.**
No AI module is enabled in Phase 2.

---

## Performance Considerations

- **Compound search** queries the denormalised `memory_experiences` table — no JOINs needed for filtering
- **Hydration** (full GET by UUID) adds 4 parallel queries for context, screenshots, events, relationships
- **Auto-linking** is always async (.catch(() => {})) — never blocks trade execution
- **Experience upsert** uses `onConflictDoUpdate` on `trade_id` — safe to call on every open/close
- **Relationship unique index** on (fromType, fromId, toType, toId, relType) prevents duplicates at DB level
- **Backfill** is limited to 500 trades per run to avoid long-running DB operations

---

## Files

```
lib/db/src/schema/memory.ts            — Schema: memory_relationships, memory_experiences, memory_relationship_history
artifacts/api-server/src/lib/
  relationship-engine.ts               — Graph management: ensure, delete, auto-link, orphan detection, repair
  experience-builder.ts                — Experience assembly: upsert, hydrate, search, timeline
  memory-health.ts                     — Integrity validation, statistics, repair orchestration
artifacts/api-server/src/routes/
  memory.ts                            — API endpoints: experience, relationships, statistics, health
artifacts/dashboard/src/pages/
  memory.tsx                           — 6-tab dashboard: Explorer, Detail, Graph, Health, Statistics, Search
artifacts/api-server/src/lib/
  __tests__/memory-graph.test.ts       — Unit tests: feature vector, scoring, health, entity types
MEMORY_RELATIONSHIP_GRAPH.md           — This document
```
