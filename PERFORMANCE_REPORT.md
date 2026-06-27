# Performance Report — TradeClone AI

Generated: 2026-06-27

---

## Executive Summary

Under the current implementation, performance degrades predictably as trade history grows. The most severe bottlenecks are in the paper engine's hot path — which runs every 10 minutes and fetches the entire closed-trade history from the database multiple times per cycle — and in the analytics routes, which compute win rates and profit factors by loading every trade row into JavaScript memory and processing them with `.filter()` and `.reduce()`. A third class of problems is in the dashboard, which loads all 23 pages eagerly in a single JavaScript bundle. None of these issues affect live trading correctness, but they will cause observable degradation — multi-second API responses, increasing memory consumption, and slow dashboard load times — as the system accumulates real trade history.

---

## 1. Database — Missing Indexes

The `trades` table has no secondary indexes beyond the primary key. Every query that filters by `status`, `pair`, or `openedAt` performs a full sequential scan of the table. For a system accumulating trades over months, this means:

- `GET /api/analytics/summary` scans every row to find closed trades.
- `GET /api/analytics/win-rate-breakdown` scans the entire table, then filters in JavaScript.
- `GET /api/trades` with `?status=closed&pair=EURUSD` scans all rows and discards unmatched ones.
- `executePaperSignals()` queries all closed trades for P&L aggregation — this runs up to 12 times every 10 minutes.

A composite index on `trades(status, pair, openedAt)` would reduce these scans to targeted index lookups. Similarly, `market_zones(pair, active)` is queried on every page load of the Market Analysis view with no index.

**Estimated impact:** At 10,000 closed trades, an unindexed full scan takes approximately 50–200ms per query in PostgreSQL. The analytics summary endpoint, which triggers several such scans, could take over a second. With the index, these queries drop to single-digit milliseconds.

---

## 2. Paper Engine — Repeated Unbounded Queries on Every Analysis Cycle

The most performance-critical code path runs every 10 minutes via the analysis scheduler, which calls `executePaperSignals()` for each of the 3 pairs across 4 timeframes — up to 12 invocations per cycle.

**Inside each `executePaperSignals()` call:**

- `SELECT * FROM trades WHERE status = 'closed'` — an unbounded query fetching every closed trade in the database. All columns are selected, including `jsonb` explanation blobs that may be several kilobytes each.
- The result is iterated three times in JavaScript: once for today's P&L, once for the weekly P&L, and once for the current paper balance.
- A separate `getPaperBalance()` call sometimes issues the same unbounded query a second time.

With 1,000 closed trades averaging 2KB each (including the explanation JSONB), each cycle transfers approximately 24MB of data from PostgreSQL to Node.js across all 12 invocations. At 6 cycles per hour, this is 144MB per hour of database-to-application transfer serving no user request.

**Remediation path:** Replace all three calculations with targeted SQL aggregates run once at the start of the scheduler cycle:

```sql
SELECT SUM(pnl) FILTER (WHERE closed_at >= :today_start) AS today_pnl,
       SUM(pnl) FILTER (WHERE closed_at >= :week_start) AS weekly_pnl,
       SUM(pnl) AS total_pnl
FROM trades WHERE status = 'closed';
```

Pass the three scalar results as parameters to `executePaperSignals()` rather than re-querying inside it.

---

## 3. Paper Engine — O(n²) Peak Balance Calculation

When computing the current drawdown percentage for dynamic position sizing, the paper engine contains the following pattern (lines 242–247 of `paper-engine.ts`):

```typescript
const peakBalance = closedForDD.reduce((max, t) => {
  const bal = INITIAL_PAPER_BALANCE + closedForDD
    .filter(x => x.closedAt != null && x.closedAt <= t.closedAt!)
    .reduce((s, x) => s + parseFloat(x.pnl ?? "0"), 0);
  return Math.max(max, bal);
}, INITIAL_PAPER_BALANCE);
```

For each of n closed trades, this inner `.filter().reduce()` iterates up to n trades. The total operations are n×n — quadratic complexity. With 100 closed trades this is 10,000 operations per signal. With 1,000 trades it is 1,000,000 operations, adding tens of milliseconds to every signal execution. With 10,000 trades it becomes 100,000,000 operations, taking several seconds and blocking the Node.js event loop.

**Remediation path:** Sort trades by `closedAt` once, then perform a single forward pass to build the running balance array and find its maximum. This is O(n log n) total (dominated by the sort), reducing 10,000 trade peak-calc from seconds to microseconds.

---

## 4. Analytics Routes — In-Memory Aggregation Instead of SQL

The following routes fetch the entire trades dataset into Node.js memory and compute aggregate statistics in JavaScript:

- `GET /api/analytics/summary` — loads all closed trades, computes total P&L, win rate, profit factor, max drawdown.
- `GET /api/analytics/win-rate-breakdown` — loads all closed trades, groups by pair/session/zone type.
- `GET /api/analytics/trade-comparison` (quality.ts) — loads all closed trades to build score distributions.
- `GET /api/analytics/rule-adherence` (quality.ts) — loads the entire trades table.
- `strategy-health-monitor.ts checkDrawdown()` — loads all closed trades every 30 minutes for drawdown calculation.

Each of these is a straightforward SQL aggregate that PostgreSQL computes in the database engine with index support. Loading rows to JavaScript for aggregation bypasses the database's query optimizer, columnar memory layout, and index acceleration.

**Estimated scale at 5,000 closed trades:** Each analytics route currently transfers roughly 10MB of JSON over the loopback socket per request. With SQL aggregation, the same request returns a single-row result set of under 1KB.

---

## 5. Market Zone Refresh — Full DELETE + Re-INSERT Every 10 Minutes

In `analyzer.ts`, the analysis scheduler clears and repopulates the entire `market_zones` table on every run:

- `DELETE FROM market_zones WHERE pair = $pair AND timeframe = $tf`
- `INSERT INTO market_zones ...` (batch of new zones)

This runs for each of 12 pair/timeframe combinations every 10 minutes. The consequence is that for a brief period (milliseconds to seconds, depending on zone computation time), the API returns empty zone data for in-flight requests. On the dashboard's Market Analysis page this manifests as a visible flash where all zones disappear and reappear.

**Remediation path:** Use PostgreSQL upsert (`INSERT ... ON CONFLICT DO UPDATE`) keyed on `(pair, timeframe, priceHigh, priceLow)`. Zones that haven't changed are updated in-place; only genuinely new zones are inserted; stale zones can be pruned by a secondary cleanup pass after the upsert cycle. This eliminates the empty-state window entirely.

---

## 6. Concurrent Validation — Analysis Scheduler Serial Execution

The analysis scheduler runs 3 pairs × 4 timeframes = 12 analysis jobs every 10 minutes. Each job is CPU-bound market analysis (zone detection, signal scoring, AMD phase identification). These jobs are currently executed sequentially — each pair/timeframe combination waits for the previous one to complete.

On a single-core container, the 12 jobs each taking ~200ms would consume 2.4 seconds of CPU per 10-minute cycle (4% utilisation — acceptable). However, if individual analysis jobs grow in complexity (e.g., with richer zone detection or ML inference), sequential execution means the analysis cycle can miss its 10-minute window.

**Remediation path:** `Promise.all()` across all 12 jobs allows them to run concurrently within the Node.js event loop. Since each job is async (awaiting DB writes), concurrency is available even in a single-threaded environment.

---

## 7. Frontend Bundle — No Code Splitting

`artifacts/dashboard/src/App.tsx` statically imports all 23 page components at the top of the file. Vite bundles these into a single JavaScript chunk that the browser must download, parse, and compile before the first page renders. The pages include the Robustness Engine visualiser, Monte Carlo simulator, Replay Engine, Backtest runner, and 18 other heavy components — none of which a user navigating to the dashboard home page needs.

**Estimated bundle impact:** Without code splitting, the initial JS payload is estimated at 800KB–1.2MB uncompressed. With `React.lazy()` and dynamic imports, the initial chunk containing only the Dashboard page and shared layout would drop to approximately 150–250KB, with remaining pages loaded on demand.

**Remediation path:** This fix is applied as part of this audit — see the Refactoring section below.

---

## 8. No Response Compression

The Express server does not use compression middleware (`compression` or `express-compression`). All API responses are sent as uncompressed JSON. Analytics endpoints returning large trade lists (50 trades × ~2KB each = 100KB) would transmit at full size over the network. GZIP compression typically achieves 70–80% size reduction on JSON responses, meaning 100KB becomes 20–30KB.

**Remediation path:** `app.use(require('compression')())` before all route handlers. This is a one-line change with no application logic impact.

---

## 9. Price Feed — External HTTP Dependency on Hot Path

The price feed polls `query1.finance.yahoo.com` every 30 seconds. This is an unauthenticated, unofficial endpoint with variable latency (50–500ms). The `AbortSignal.timeout(8000)` provides an 8-second timeout, meaning a slow Yahoo Finance response can stall the price feed for 8 seconds before falling back. During this window, any trades being monitored for stop-loss or take-profit will use a stale price.

**Remediation path:** In production, replace with a proper FX broker WebSocket feed (OANDA streaming, TradeLocker websocket) that provides sub-second price updates with reconnection logic. The current Yahoo Finance feed is acceptable for paper trading development only.

---

## Refactoring Applied During This Audit

- **Code splitting applied:** All 23 page imports in `App.tsx` converted to `React.lazy()` with a top-level `Suspense` boundary. This reduces the initial JavaScript bundle by an estimated 60–70%.
- **DB indexes added:** `trades(status, pair, openedAt)` and `market_zones(pair, active)` indexes added via schema migration.
- **Rejection codes corrected:** Paper engine now logs correct rejection reasons, enabling accurate analytics without re-query overhead.
