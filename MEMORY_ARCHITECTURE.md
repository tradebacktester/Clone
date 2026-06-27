# KRYTOS Long-Term Memory Architecture

> **Phase 2 — Foundation Layer**
> This document covers the permanent memory infrastructure introduced in Phase 2.
> AI learning, pattern recognition, similarity search, and recommendation engines are out of scope for this phase.

---

## 1. Purpose

The KRYTOS Memory System is the institutional-grade, permanent storage layer for every meaningful event produced by the trading engine. Unlike logs (ephemeral, append-only, unstructured), memory is:

- **Queryable** — filtered, paginated, and searchable across multiple dimensions
- **Relational** — records link to one another with maintained referential integrity
- **Auditable** — every record carries a provenance hash and version history
- **Scalable** — indexed and pagination-ready for millions of rows
- **Modular** — each sub-system (validation, search, storage, API) is isolated

Every future AI module (Learning AI, Strategy AI, Risk AI, Executive AI) will query this memory as its source of truth.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        API Layer                                │
│  GET /memory/trades  GET /memory/setups  GET /memory/search     │
│  GET /memory/skipped  GET /memory/snapshot  POST /memory/store  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     MemoryService (Singleton)                   │
│  store()  update()  delete()  search()  link()  archive()       │
│  validate()  getInvalidRecords()  buildClusterKey()             │
└──┬───────────┬──────────────┬──────────────┬────────────────────┘
   │           │              │              │
   ▼           ▼              ▼              ▼
memory-    memory-       memory-        memory-
storage    search        validation     index
(raw DB)   (filters)     (rules)        (keys)
   │
   ▼
┌─────────────────────────────────────────────────────────────────┐
│                     PostgreSQL                                  │
│  trade_memory  setup_memory  skipped_setup_memory               │
│  market_snapshot_memory  memory_metadata                        │
│  (+ legacy: missed_opportunities, setup_confidence_profiles)    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Module Structure

```
lib/market-analysis/src/memory/
├── index.ts                    Public API surface (re-exports)
├── memory-core/
│   └── index.ts                MemoryService — the single gateway
├── memory-storage/
│   └── index.ts                Raw Drizzle DB access (private to MemoryService)
├── memory-search/
│   └── index.ts                Filter builders, pagination helpers
├── memory-index/
│   └── index.ts                Key construction, bucketing, composite scores
├── memory-events/
│   └── index.ts                Event type constants, skip reasons, outcomes
├── memory-validation/
│   └── index.ts                Record validation, data hash (SHA-256)
├── memory-api/
│   └── index.ts                Request parsers, response shapers
└── tests/
    ├── memory-validation.test.ts
    ├── memory-index.test.ts
    ├── memory-search.test.ts
    └── memory-api.test.ts
```

---

## 4. Database Schema

### 4.1 `setup_memory`

Every detected setup — whether or not a trade is executed.

| Column | Type | Description |
|---|---|---|
| `id` | uuid PK | Stable identifier |
| `pair` | text | EURUSD / GBPUSD / USDJPY |
| `direction` | text | long / short |
| `session` | text | london / new_york |
| `strategy_version` | text | Version tag of the detection strategy |
| `htf_structure` | text | Higher-timeframe bias description |
| `supply_zone_high/low` | numeric | Supply zone price levels |
| `demand_zone_high/low` | numeric | Demand zone price levels |
| `premium_discount_level` | numeric | 50% level of range |
| `premium_discount_label` | text | premium / discount / equilibrium |
| `zone_score` | numeric | 0–100 |
| `liquidity_score` | numeric | 0–100 |
| `amd_score` | numeric | 0–100 |
| `confirmation_score` | numeric | 0–100 |
| `tqi` | numeric | Trade Quality Index |
| `confidence` | numeric | Final confidence % |
| `is_valid` | boolean | False = archived/soft-deleted |
| `is_accepted` | boolean | True = trade was taken from this setup |
| `linked_trade_id` | integer | FK to trades table |
| `linked_trade_uuid` | uuid | FK for future UUID-primary trades |
| `market_snapshot_id` | uuid | FK to market_snapshot_memory |
| `regime` | text | Market regime at evaluation time |
| `news_state` | text | News impact state |
| `meta` | jsonb | Optional extended context |
| `evaluated_at` | timestamptz | When the setup was detected |
| `created_at` | timestamptz | Record creation time |

**Indexes:** pair, evaluated_at, is_accepted, is_valid, session, linked_trade_id

---

### 4.2 `skipped_setup_memory`

Every setup that was evaluated and rejected. Never deleted — forms the rejection audit trail.

| Column | Type | Description |
|---|---|---|
| `id` | uuid PK | |
| `setup_id` | uuid | FK to setup_memory (if setup was stored first) |
| `pair` / `direction` / `session` | text | Core identifiers |
| `regime` | text | Market regime |
| `skip_reason` | text | Canonical reason code |
| `rejecting_rule` | text | The specific rule that triggered rejection |
| `rejecting_module` | text | Which module applied the rule |
| `zone_score` → `confidence` | numeric | Scores at rejection time |
| `price_at_skip` | numeric | Price when rejected |
| `screenshot_ref` | text | Future visual analysis reference |
| `news_state` / `volatility` / `spread` | text/numeric | Market context |
| `market_context` | jsonb | Full market context blob |
| `price_at_1h/4h/24h` | numeric | Aftermath tracking (background job) |
| `hypothetical_outcome` | text | would_win / would_lose / unknown |
| `created_at` | timestamptz | |

**Indexes:** pair, created_at, rejecting_rule, setup_id

---

### 4.3 `market_snapshot_memory`

Point-in-time market state captured at setup evaluation time.

| Column | Type | Description |
|---|---|---|
| `id` | uuid PK | |
| `captured_at` | timestamptz | When the snapshot was taken |
| `pair` / `session` | text | Identifiers |
| `price_open/high/low/close` | numeric | OHLC at capture time |
| `spread` | numeric | Bid/ask spread in pips |
| `tf_15m` / `tf_1h` / `tf_4h` / `tf_1d` | jsonb | Per-timeframe regime + structure |
| `trend` | text | Current trend direction |
| `trend_strength` | numeric | 0–100 |
| `volatility` | text | low / medium / high |
| `volatility_score` | numeric | 0–100 |
| `regime` / `regime_confidence` | text/numeric | Market regime |
| `liquidity_above/below` | numeric | Key liquidity levels |
| `nearest_resistance/support` | numeric | Key S/R levels |
| `correlated_pairs` | jsonb | { pair: correlation_coefficient } |
| `correlation_risk` | text | low / medium / high |
| `news_status` | text | clear / upcoming / active |
| `upcoming_events` | jsonb | Array of event objects |
| `high_impact_within_1h` | boolean | News warning flag |

**Indexes:** pair, captured_at, session

---

### 4.4 `memory_metadata`

Provenance and integrity tracking for every memory record.

| Column | Type | Description |
|---|---|---|
| `id` | uuid PK | |
| `record_id` | text | The ID of the referenced record |
| `record_table` | text | Which table it belongs to |
| `record_version` | integer | Incremented on every update |
| `data_hash` | text | SHA-256 of the record payload at write time |
| `is_valid` | boolean | False = failed integrity check |
| `validation_errors` | jsonb | Array of error strings |
| `source_module` | text | Which module wrote this record |
| `source_version` | text | Version of the source module |
| `created_by` | text | system / user |
| `created_at` / `updated_at` | timestamptz | |

**Indexes:** record_id, record_table, is_valid, created_at
**Unique constraint:** (record_id, record_table)

---

### 4.5 `trade_memory` (enhanced legacy)

Complete per-trade record with scores, risk, and outcome data.

Core fields: id, trade_id (FK), pair, direction, session, regime, zone/liquidity/amd/confirmation/final scores, confidence, zone_type, amd_pattern, fib_level, risk/reward (planned + actual), slippage, outcome, pnl, close_reason, timing, cluster_key.

**Indexes:** pair, opened_at, outcome, cluster_key

---

## 5. Table Relationships

```
market_snapshot_memory
        │
        │ market_snapshot_id (UUID FK)
        ▼
  setup_memory ──────────────────────────── trade_memory
        │         linked_trade_id (int FK)      │
        │                                       │
        ▼                                       │
skipped_setup_memory                            │
  (setup_id FK)                                 │
                                                ▼
                                    setup_confidence_profiles
                                      (cluster_key join)

memory_metadata (1:1 per record in any table above)
```

---

## 6. MemoryService API

All access passes through `memoryService` — a singleton exported from `lib/market-analysis/src/memory/`.

```typescript
import { memoryService } from "@workspace/market-analysis";

// Store a detected setup
const result = await memoryService.storeSetup({ pair: "EURUSD", ... });

// Store a skipped opportunity
await memoryService.storeSkippedSetup({ pair: "GBPUSD", skipReason: "below_confidence", ... });

// Store a market snapshot
await memoryService.storeSnapshot({ pair: "USDJPY", session: "london", ... });

// Link a setup to the trade that was opened
await memoryService.linkSetupToTrade(setupId, tradeId);

// Paginated queries
const setups  = await memoryService.getSetups({ pair: "EURUSD", isAccepted: true }, { limit: 50, offset: 0 });
const skipped = await memoryService.getSkippedSetups({ rejectingRule: "below_confidence" }, { limit: 50, offset: 0 });
const snaps   = await memoryService.getSnapshots({ pair: "EURUSD" }, { limit: 20, offset: 0 });
const trades  = await memoryService.getTrades({ outcome: "win" }, { limit: 100, offset: 0 });

// Cross-table search
const { trades, setups, skipped } = await memoryService.search({ pair: "EURUSD", session: "london" });

// Integrity
const invalid = await memoryService.getInvalidRecords(100);

// Soft-delete
await memoryService.archiveSetup(setupId);
```

---

## 7. REST API Endpoints

All endpoints require the API server's standard authentication header.

### Read Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/memory/trades` | Paginated trade memory |
| GET | `/memory/setups` | Paginated setup memory |
| GET | `/memory/setups/:id` | Single setup by UUID |
| GET | `/memory/skipped` | Paginated skipped setups |
| GET | `/memory/skipped/:id` | Single skipped setup by UUID |
| GET | `/memory/snapshot` | Paginated market snapshots |
| GET | `/memory/snapshot/:id` | Single snapshot by UUID |
| GET | `/memory/search` | Cross-table search |
| GET | `/memory/integrity` | Invalid / corrupt records |

### Query Parameters (shared)

| Param | Type | Description |
|---|---|---|
| `pair` | string | EURUSD / GBPUSD / USDJPY |
| `direction` | string | long / short |
| `session` | string | london / new_york |
| `regime` | string | trending / ranging / volatile / low_volatility |
| `dateFrom` | ISO8601 | Start of date range |
| `dateTo` | ISO8601 | End of date range |
| `limit` | integer | Page size (max 500, default 50) |
| `offset` | integer | Page offset (default 0) |

### Setup-specific Parameters

| Param | Type | Description |
|---|---|---|
| `isAccepted` | boolean | Filter by trade-taken flag |
| `isValid` | boolean | Filter by archive status |
| `minConfidence` | number | Minimum confidence threshold |

### Skipped-specific Parameters

| Param | Type | Description |
|---|---|---|
| `skipReason` | string | Filter by canonical skip reason |
| `rejectingRule` | string | Filter by rule name |

### Write Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/memory/store` | Generic store to any memory table |
| POST | `/memory/setups/:id/link` | Link setup to a trade |
| POST | `/memory/setups/:id/archive` | Soft-delete a setup |

### POST `/memory/store` Body

```json
{
  "table": "setup_memory",
  "sourceModule": "paper_engine",
  "data": { ... }
}
```

Supported table values: `setup_memory`, `skipped_setup_memory`, `market_snapshot_memory`

---

## 8. Cluster Key System

The cluster key groups similar setups for performance analysis. Format:

```
z{zone_bucket}|l{liq_bucket}|a{amd_bucket}|c{conf_bucket}|s{session}
```

Score buckets: `<70` | `70-79` | `80-89` | `90+`

Example: `z80-89|l70-79|a90+|c<70|slondon`

The cluster key is also used by `setup_confidence_profiles` to aggregate cumulative win rates and adjust signal confidence dynamically.

---

## 9. Data Integrity

Every stored record generates a SHA-256 hash over `{ table, recordId, payload }` and writes a `memory_metadata` row. On update, the metadata row is bumped to a new version.

Integrity violations (tampered data, invalid timestamps, broken references) are flagged by setting `is_valid = false` and recording `validation_errors`. The `/memory/integrity` endpoint surfaces all invalid records.

---

## 10. Scaling Strategy

### Current (Phase 2)
- Indexed columns for all common query patterns
- Paginated all list endpoints (max 500 per page)
- UUID primary keys for setup/snapshot tables (no hotspot on serial PK)
- `count()` pre-computed alongside each list query for accurate totals

### Future (Phase 3+)
- **Partitioning**: `setup_memory` and `market_snapshot_memory` can be range-partitioned by `evaluated_at` / `captured_at` (monthly partitions) to maintain query speed at millions of rows
- **Archival**: Records older than N months can be moved to a cold partition or object storage
- **Read replicas**: All `/memory/*` GET routes are read-only; a replica connection pool can be added to `memory-storage` without touching the service layer
- **Caching**: `buildSearchCacheKey()` in `memory-index` produces stable cache keys; Redis layer can be inserted inside `MemoryService.search()` without API changes
- **Async writes**: High-volume writes (snapshots) can be batched via a queue; the storage layer accepts bulk inserts

---

## 11. Performance Considerations

| Operation | Expected Performance | Notes |
|---|---|---|
| Single record lookup by UUID | < 1ms | PK index |
| Filtered list (indexed column) | < 10ms | Index seek |
| Paginated list (50 rows) | < 20ms | Combined with count |
| Cross-table search | < 50ms | 3 parallel queries |
| Integrity scan (100 records) | < 5ms | is_valid index |
| Cluster key upsert | < 5ms | Unique index conflict resolution |

All estimates assume < 1M rows per table on standard Replit PostgreSQL.

---

## 12. Validation Rules Summary

| Record | Required Fields | Score Range | Additional |
|---|---|---|---|
| setup_memory | pair, direction, session | 0–100 per score | pair must be EURUSD/GBPUSD/USDJPY |
| skipped_setup_memory | pair, direction, session, skipReason, rejectingRule, rejectingModule | — | skipReason must be non-empty |
| market_snapshot_memory | pair, session | — | priceHigh >= priceLow |
| memory_metadata | recordId, recordTable, dataHash, sourceModule | — | dataHash = 64-char hex |

---

## 13. Roadmap (Future Phases)

| Phase | Feature |
|---|---|
| Phase 3 | AI Learning Engine — reads setup_memory + trade_memory to compute pattern effectiveness |
| Phase 3 | Similarity search — vector embeddings on score vectors for nearest-neighbour setup lookup |
| Phase 4 | Executive AI — reads memory to make go/no-go decisions |
| Phase 4 | Confidence learning — dynamic adjustment of signal confidence from cluster win rates |
| Phase 5 | Memory-driven reports — automated insights from accumulated memory |

---

*Document version: 2.0 — Phase 2 Foundation*
*Last updated: 2026-06-27*
