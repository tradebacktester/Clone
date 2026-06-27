---
name: Paper Trading Workspace
description: DB tables, route file, and quirks for the paper trading workspace feature (trade reviews, signal log, exports).
---

# Paper Trading Workspace

## DB Tables Added
- `trade_reviews` — one row per trade (unique tradeId); agreement/reason/confidence/notes; upserted via onConflictDoUpdate on tradeId
- `signal_log` — every signal logged here whether executed or skipped; includes skipReason, executed bool, tradeId reference

## Columns Added to `trades`
- `spread_pips`, `news_status`, `screenshots` (jsonb string[]), `rule_evaluation` (jsonb)

## Routes
All under `/api/paper/workspace/*` in `artifacts/api-server/src/routes/paper-workspace.ts`:
- GET `/stats` — aggregate dashboard stats
- GET `/trades` — paginated trades with embedded review
- POST `/review/:tradeId` — upsert review (agree/disagree)
- GET `/review/:tradeId` — fetch single review
- GET `/signals` — signal log (all signals, paginated)
- POST `/screenshot/:tradeId` — append base64 dataUrl to screenshots[]
- GET `/export/csv` — full CSV download
- GET `/export/json` — full JSON download

## Signal Logging Hook Points
- `paper-engine.ts` `executePaperSignals()` logs every signal at every skip path (max_open_trades, pair_already_open, below_confidence, stale_price, mtf_insufficient, no_analysis, tqi_below_threshold, correlation_blocked) and on success (executed=true)
- `analyzer.ts` passes `newsStatus = blocked.has(pair) ? "high_impact" : "clear"` to `executePaperSignals`

## Critical Quirk
**esbuild cannot resolve `zod/v4`** — do NOT import `{ z } from "zod/v4"` in API server route files. Use inline validation (manual type checks) instead. The DB schema files can use `zod/v4` because they are never bundled by esbuild directly.

**Why:** esbuild bundles the API server and doesn't resolve the subpath export `zod/v4`. The DB/schema package imports are tree-shaken at the drizzle-kit level which handles it differently.
