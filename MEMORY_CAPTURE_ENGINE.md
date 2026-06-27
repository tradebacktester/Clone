# Memory Capture Engine

**KRYTOS V2 — Automatic Episodic Memory System**

The Memory Capture Engine is a fire-and-forget subsystem that automatically records every meaningful trading lifecycle event as permanent, linked episodic memory. **No manual calls are required** in the core trading logic — the engine hooks into every gate and event automatically.

---

## Architecture Overview

```
Market Scan (every 10 min per pair)
    │
    ▼
captureMarketSnapshot()          ← market_snapshot_memory record
    │
    ▼
captureSetupDetected()           ← setup_memory record (isAccepted=false)
    │
    ├─── [Gate rejected] ──────► captureSkippedSetup()   → skipped_setup_memory
    │
    └─── [All gates passed] ───► captureTradeOpened()    → trade_events (type="opened")
                                      │                   → setup_memory (isAccepted=true)
                                      │                   → seeds excursion tracker
                                      │
                               monitorOpenTrades()
                                      │
                                      ├── every tick ──► updateExcursionTracker() [in-memory]
                                      │
                                      └── on close ────► captureTradeClose()     → trade_events (type="closed")
                                                                                   → MFE/MAE from tracker
```

---

## Database Tables

### `market_snapshot_memory`
Point-in-time snapshot of market conditions per pair per analysis run.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Auto-generated |
| `captured_at` | TIMESTAMPTZ | When the snapshot was taken |
| `pair` | TEXT | EUR/USD, GBP/USD, USD/JPY |
| `session` | TEXT | london / newyork / asian |
| `regime` | TEXT | trending / ranging / volatile / low_volatility |
| `regime_confidence` | NUMERIC | 0-100 |
| `supply_zone_count` | INT | Active supply zones at capture time |
| `demand_zone_count` | INT | Active demand zones at capture time |
| `active_signal_count` | INT | Signals detected at capture time |
| `high_impact_within_1h` | BOOL | News block active |
| `liquidity_above` | NUMERIC | Nearest supply low (resistance) |
| `liquidity_below` | NUMERIC | Nearest demand high (support) |

---

### `setup_memory`
Every detected setup, accepted or rejected.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Auto-generated |
| `pair` / `direction` / `session` | TEXT | Signal identifiers |
| `is_valid` | BOOL | Always true at detection time |
| `is_accepted` | BOOL | `false` initially; updated to `true` if trade opens |
| `linked_trade_id` | INT | Populated when trade opens |
| `market_snapshot_id` | UUID | FK to `market_snapshot_memory` |
| `zone_score` / `liquidity_score` / `amd_score` / `confirmation_score` | NUMERIC | Score breakdown |
| `tqi` | NUMERIC | Trade Quality Index at evaluation |
| `entry_price` / `stop_loss` / `take_profit` | NUMERIC | Entry parameters |
| `risk_reward` | NUMERIC | Planned R:R |
| `evaluated_at` | TIMESTAMPTZ | When setup was evaluated |

---

### `skipped_setup_memory`
Every opportunity that was evaluated and deliberately rejected.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Auto-generated |
| `setup_id` | UUID | FK to `setup_memory` (the parent setup) |
| `skip_reason` | TEXT | Human-readable reason (e.g. `tqi_below_threshold`) |
| `rejecting_rule` | TEXT | Internal rule name (e.g. `tqi_gate`) |
| `rejecting_module` | TEXT | Always `memory-capture-engine` |
| `market_snapshot_id` | UUID | FK to `market_snapshot_memory` |
| `price_at_skip` | NUMERIC | Live price at rejection |
| `hypothetical_outcome` | TEXT | `would_win` / `would_lose` (populated later) |
| `price_at_1h` / `price_at_4h` / `price_at_24h` | NUMERIC | Aftermath tracking |

---

### `trade_events`
Append-only event log. One row per lifecycle event per trade. **Never updated.**

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL PK | Auto-increment |
| `trade_id` | INT | FK to `trades.id` |
| `setup_id` | UUID | FK to `setup_memory` |
| `snapshot_id` | UUID | FK to `market_snapshot_memory` |
| `event_type` | TEXT | See Event Types below |
| `price` / `stop_loss` / `take_profit` / `lot_size` | NUMERIC | State at event time |
| `pnl` / `pnl_percent` / `risk_reward` | NUMERIC | Close-specific |
| `mfe_pips` / `mae_pips` | NUMERIC | MFE/MAE at close (see Excursion Tracking) |
| `outcome` | TEXT | `win` / `loss` / `break_even` |
| `duration_mins` | INT | Minutes from open to close |
| `close_reason` | TEXT | `sl_hit` / `tp_hit` / `manual_close` |
| `broker_response` | TEXT | Always `"accepted"` for opens |
| `meta` | JSONB | Extra context (news, regime, rule evaluations) |
| `occurred_at` | TIMESTAMPTZ | When the event happened |

**Event Types:**

| Type | When Emitted |
|------|-------------|
| `opened` | Trade successfully inserted |
| `break_even` | Stop-loss moved to break-even |
| `trailing_stop` | Trailing stop update |
| `sl_updated` | SL change |
| `tp_updated` | TP change |
| `partial_close` | Partial position close |
| `size_changed` | Lot size reduction |
| `price_update` | Monitoring tick (for debugging) |
| `manual_close` | User-initiated close |
| `closed` | SL/TP hit; trade exits |

---

## Excursion Tracking (MFE/MAE)

**Maximum Favorable Excursion (MFE)** — the highest profit the trade reached (in pips) before closing.  
**Maximum Adverse Excursion (MAE)** — the deepest drawdown the trade reached (in pips) before closing.

```
MFE = max(0, (currentPrice - entryPrice) / pipSize)   [for buy]
MAE = max(0, (entryPrice - currentPrice) / pipSize)   [for buy]
```

- Tracked in-memory via a `Map<tradeId, ExcursionState>` — zero DB I/O per tick
- Written to the `trade_events` close record at close time
- If the tracker is empty (e.g. after a restart), the engine approximates from the close price
- **Pip size**: `0.0001` for non-JPY pairs, `0.01` for JPY pairs

### Restart Recovery

Call `seedExcursionTracker()` from the recovery engine on startup for every open trade:

```typescript
import { seedExcursionTracker } from "./memory-capture-engine.js";

// Called from recovery engine on server startup
for (const trade of openTrades) {
  seedExcursionTracker(
    trade.id,
    parseFloat(trade.entryPrice),
    trade.direction,
    trade.pair,
    trade.openedAt,
  );
}
```

This ensures MFE/MAE are tracked from restart, not just from the next tick.

---

## API Endpoints

All endpoints are prefixed with `/api` (router mounted at `/`).

### `GET /memory/timeline`
Global chronological event timeline across all pairs.

**Query Parameters:**
- `pair` — filter by pair (e.g. `EURUSD`)
- `limit` — max 200, default 50
- `offset` — pagination offset, default 0

**Response:**
```json
{
  "total": 247,
  "entries": [
    {
      "type": "snapshot",
      "occurredAt": "2024-01-15T09:00:00Z",
      "pair": "EURUSD",
      "data": { ... }
    },
    {
      "type": "setup",
      "occurredAt": "2024-01-15T09:00:05Z",
      "pair": "EURUSD",
      "data": { ... }
    },
    {
      "type": "trade_event",
      "occurredAt": "2024-01-15T09:00:10Z",
      "pair": "UNKNOWN",
      "data": { "eventType": "opened", ... }
    }
  ]
}
```

---

### `GET /memory/trade/:id`
Complete episodic timeline for a single trade — all linked records.

**Response:**
```json
{
  "tradeId": 42,
  "events": [
    { "eventType": "opened",  "occurredAt": "...", "price": "1.10000", ... },
    { "eventType": "break_even", "occurredAt": "...", ... },
    { "eventType": "closed",  "occurredAt": "...", "mfePips": "45.2", "maePips": "8.5", "outcome": "win" }
  ],
  "setup": { "id": "...", "isAccepted": true, "zoneScore": "82", ... },
  "snapshot": { "id": "...", "regime": "trending", "supplyZoneCount": 3, ... },
  "skipped": []
}
```

---

### `GET /memory/trade/:id/events`
Just the event log for a single trade.

**Response:**
```json
{
  "tradeId": 42,
  "count": 3,
  "events": [ ... ]
}
```

---

### `GET /memory/history`
Paginated full history of all captured memory records.

**Query Parameters:**
- `limit` — max 200, default 50
- `offset` — pagination offset

**Response:**
```json
{
  "snapshots":   [ ... ],
  "setups":      [ ... ],
  "skipped":     [ ... ],
  "tradeEvents": [ ... ],
  "counts": {
    "snapshots": 12,
    "setups": 8,
    "skipped": 4,
    "tradeEvents": 24
  }
}
```

---

## Fire-and-Forget Pattern

Every capture function uses `.catch(() => {})` — they **never throw** and never block the trading engine:

```typescript
// This is how all captures are called in the paper engine:
captureTradeOpened(data, snapshotId, setupId).catch(() => {});
captureSkippedSetup(signal, "tqi_below_threshold", ...).catch(() => {});
captureTradeClose(data).catch(() => {});
```

If the DB is temporarily unavailable, the engine continues trading. Memory capture failure is logged at `WARN` level but never propagates.

---

## Event Chain Example

A complete trade lifecycle produces these records:

```
1. market_snapshot_memory  (pair=EURUSD, regime=trending, zones=5)
      id: "snap-abc-123"

2. setup_memory             (isAccepted=false initially)
      id: "setup-def-456"
      marketSnapshotId: "snap-abc-123"

3. trade_events            (type="opened", tradeId=42)
      setupId: "setup-def-456"
      snapshotId: "snap-abc-123"

4. setup_memory UPDATE     (isAccepted=true, linkedTradeId=42)

5. trade_events            (type="break_even", tradeId=42)

6. trade_events            (type="closed", tradeId=42)
      mfePips: "48.2"
      maePips: "9.1"
      outcome: "win"
      durationMins: 127
```

---

## Skipped Setup Example

A signal that fails the TQI gate produces:

```
1. market_snapshot_memory  (already captured for this pair scan)

2. setup_memory             (isAccepted=false, remains false)
      id: "setup-ghi-789"

3. skipped_setup_memory    (permanently skipped)
      setupId: "setup-ghi-789"
      skipReason: "tqi_below_threshold"
      rejectingRule: "tqi_gate"

4. [background job: aftermath tracking]
   skipped_setup_memory UPDATE
      priceAt1h: "1.10250"
      priceAt4h: "1.10500"
      hypotheticalOutcome: "would_win"
```

---

## Testing

Run the test suite:

```bash
cd artifacts/api-server
pnpm exec tsx --test src/lib/__tests__/memory-capture.test.ts
```

The test suite has **~250 lines** covering 18 describe blocks:
- Excursion tracker correctness (MFE/MAE math)
- Outcome classification
- Risk-reward calculation
- Duration calculation
- Session classification
- Event type validation
- Rejection rule audit
- Market snapshot zone summarization
- Setup score capture
- Skipped setup audit trail
- Event append-only integrity
- Timeline reconstruction
- MFE/MAE approximation on restart
- Data integrity (never overwrites)
- Restart recovery (excursion seeding)
- Hypothetical outcome tracking

---

## Schema Push

After any schema changes:

```bash
pnpm --filter @workspace/db run push
```

---

## Files

| File | Purpose |
|------|---------|
| `lib/db/src/schema/memory.ts` | Schema definitions for all memory tables |
| `artifacts/api-server/src/lib/memory-capture-engine.ts` | Core engine: capture functions + timeline queries |
| `artifacts/api-server/src/lib/paper-engine.ts` | Trading engine with capture hooks at every gate |
| `artifacts/api-server/src/lib/analyzer.ts` | Analysis loop with `captureMarketSnapshot` call |
| `artifacts/api-server/src/routes/memory.ts` | Timeline API endpoints |
| `artifacts/api-server/src/lib/__tests__/memory-capture.test.ts` | Test suite |
