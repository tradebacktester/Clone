# Code Audit Report — TradeClone AI

Generated: 2026-06-27

---

## Executive Summary

The codebase is architecturally well-structured with clear separation between the API server, market analysis library, database schema, and React frontend. OpenAPI-first design with Drizzle ORM and Zod validation prevents entire categories of bugs. However, the audit identified significant dead-weight in exports, duplicated utility functions across modules, several O(n²) algorithms that will not scale, incorrect rejection-reason codes in the paper engine, and a frontend with no code splitting. None of these affect trading logic correctness, but they create maintainability debt and will cause performance degradation under real trading volume.

---

## 1. Dead Code and Unused Exports

The `lib/market-analysis/src/index.ts` barrel file re-exports approximately 350 symbols. Many of these — particularly internal algorithm helpers from `analysis/`, `signals/`, and `robustness/` sub-modules — are consumed only within the library itself and should not be part of the public API. Exposing every internal function increases the surface area for unintended usage and makes it impossible for bundlers to tree-shake unused code in downstream consumers.

**Specific concerns:**
- Internal helpers such as individual Fibonacci calculator functions, swing-detection utilities, and zone-scoring internals are re-exported directly. These should be unexported or moved to a `internal/` module.
- The `lib/market-analysis/src/tests/` directory exists alongside `__tests__` directories in sub-modules, creating an inconsistent test file naming convention.
- The `artifacts/mockup-sandbox/` directory contains a complete duplicate of the Shadcn/UI component library and Tailwind configuration that exists in `artifacts/dashboard/`. This is a development-time sandbox and does not affect production builds, but it represents significant maintenance burden — any UI component update must be made in two places.

---

## 2. Duplicated Logic

**`getPipSize(pair)` is duplicated.** This one-liner appears in `artifacts/api-server/src/lib/paper-engine.ts` and is logically equivalent to calculations inside the market-analysis library. A single canonical implementation should live in `@workspace/market-analysis` and be imported wherever needed.

**`calcLotSize()` in paper-engine.ts** reimplements position sizing logic that also exists in the market-analysis library's dynamic-sizing engine. When `sizingResult` is null (i.e., when `analysis` is unavailable), the paper engine falls back to its own `calcLotSize()`. This shadow implementation means risk calculations can diverge between the two code paths.

**`calcSession()` in paper-engine.ts** computes the current trading session from UTC hours. The explanation engine (`explanation-engine.ts`) performs an identical UTC-hour check inline. Both should use a single exported `currentSession()` function from the market-analysis library, which already has session-awareness in its analysis pipeline.

**Error response pattern inconsistency.** Routes in `routes/memory.ts` return `{ error: "Internal server error" }` (safe), while routes in `routes/historical.ts`, `routes/deployment.ts`, and `routes/production-readiness.ts` return `{ error: String(err) }` (leaks internal messages). This inconsistency means the codebase has two different error-handling policies operating simultaneously with no enforced standard.

---

## 3. Incorrect Rejection Reason Codes

In `paper-engine.ts`, three distinct trade rejection reasons are all recorded as `"below_confidence"` when calling `recordMissedOpportunity()`:

- MTF alignment failure (< 2 timeframes aligned) → incorrectly logged as `"below_confidence"`
- TQI gate failure (quality index below threshold) → incorrectly logged as `"below_confidence"`
- Correlation gate rejection (correlated overexposure) → incorrectly logged as `"pair_already_open"`

This means the trade memory and missed-opportunity analytics cannot distinguish between a genuine low-confidence signal and one that was rejected purely due to multi-timeframe divergence or correlation risk. The Trade Memory dashboard and Learning Engine pages will show misleading rejection distributions as a result.

**The fix** is to use the correct reason codes: `"mtf_insufficient"` for MTF failures, `"tqi_below_threshold"` for TQI rejections, and `"correlation_blocked"` for the correlation gate — all of which are valid values in the missed-opportunity tracking system.

---

## 4. Algorithmic Complexity Issues

**O(n²) peak balance calculation in paper-engine.ts (lines 242–246).** When computing the current drawdown percentage before sizing a new trade, the paper engine iterates over all closed trades and, for each trade, re-filters and re-reduces the entire closed trades array to compute the running balance at that point in time. With 1,000 closed trades this performs 1,000,000 arithmetic operations on a hot path that runs on every signal execution. The correct approach is a single O(n) forward scan to build the running balance series and extract the peak.

**`executePaperSignals()` fetches all closed trades on every call.** This function is invoked once per pair per analysis cycle (3 pairs × 4 timeframes = up to 12 calls every 10 minutes). Each call issues an unbounded `SELECT * FROM trades WHERE status = 'closed'` query and then filters and reduces the results in JavaScript. With 500 closed trades this is 6,000 rows transferred per analysis cycle. This should be replaced with a single SQL aggregate query (`SELECT SUM(pnl) WHERE closedAt >= today`) run once at the start of the scheduler cycle and passed down.

**`getPaperBalance()` fetches all closed trades on every invocation.** This helper is called independently inside the engine and re-fetches the same data already loaded by `executePaperSignals()`. It should accept the already-loaded closed trades as a parameter rather than issuing a second database round-trip.

---

## 5. Architectural Issues

**Analytics routes aggregate in JavaScript instead of SQL.** Routes in `analytics.ts` and `quality.ts` fetch the entire `trades` table into memory and then compute win rates, profit factors, and trade comparisons using JavaScript `.filter()` and `.reduce()`. PostgreSQL can compute all of these metrics natively with `COUNT()`, `SUM()`, `AVG()`, and `CASE WHEN` expressions over indexed columns, returning a single row. The current approach will cause memory exhaustion and multi-second response times as trade history grows.

**Market zones are fully cleared and re-inserted on every analysis run.** In `analyzer.ts`, the scheduler deletes all records from `market_zones` and then re-inserts the freshly computed zones. This creates a brief window where the API returns empty zone data during the re-computation, causing UI flicker. An upsert-based approach (insert or update on conflict) would eliminate this window.

**Strategy health monitor and `checkDrawdown()` fetch the entire trades table.** The drawdown monitor runs every 30 minutes and fetches all closed trades from inception to compute the historical equity peak. This query grows unbounded over time. A materialized peak balance stored and updated incrementally as trades close would reduce this to a constant-time lookup.

**The `missedOpportunitiesTable` is queried without limit.** In `memory-engine.ts`, several reads against `missed_opportunities` and `trade_memory` tables have no `LIMIT` clause. These tables will grow continuously for the lifetime of the bot.

**The TQI gate is optional.** When `analysisResult` is `null`, the paper engine skips the TQI check entirely and still executes the trade (line 208–216). In practice `analysis` is always provided by the scheduler, but the code allows a path where trades execute without quality validation. This should be a hard requirement with explicit rejection when analysis is unavailable.

---

## 6. Frontend Bundle and Code Splitting

`artifacts/dashboard/src/App.tsx` statically imports all 23 pages at the top of the file. This means every user's initial page load downloads JavaScript for the Replay Engine, Monte Carlo page, Production Readiness page, Robustness page, and 18 other pages — regardless of which page they navigate to first. React's `lazy()` and `Suspense` combined with Vite's dynamic imports would split each page into a separate chunk, dramatically reducing the initial bundle size (estimated 60–70% reduction in bytes parsed on first load).

**Unused Shadcn/UI components.** The dashboard's `components/ui/` directory contains over 50 primitive components (carousel, input-otp, context-menu, drawer, etc.). Given the current pages use a subset of these, unused components contribute dead code to the bundle. Tree-shaking handles most of this automatically, but components that are imported-but-not-rendered in any page should be removed.

---

## 7. Refactoring Completed During This Audit

The following code-level fixes were applied as part of this audit (trading behavior unchanged):

- **Rejection reason codes corrected** in `paper-engine.ts`: MTF gate now records `"mtf_insufficient"`, TQI gate records `"tqi_below_threshold"`, and correlation gate records `"correlation_blocked"`.
- **Code-splitting applied** to `App.tsx`: all 23 page imports converted to `React.lazy()` with a `Suspense` boundary.
- **DB indexes added** to `trades(status, pair, openedAt)` and `market_zones(pair, active)` via schema migration.

---

## 8. Recommended Follow-Up Work

The following items are documented but not automatically refactored because they require careful review of downstream consumers:

- Consolidate `getPipSize()`, `calcLotSize()`, and `calcSession()` into shared utilities in `@workspace/market-analysis`.
- Replace in-memory analytics aggregation with SQL `SUM/COUNT/AVG` queries in all analytics routes.
- Replace O(n²) peak-balance calculation with a single-pass forward scan.
- Reduce `lib/market-analysis/src/index.ts` public exports to only types and functions consumed by external packages.
- Replace full-table DELETE/INSERT zone refresh with an upsert-based incremental update.
- Cache closed-trade totals for daily/weekly P&L checks rather than re-querying on every signal.
