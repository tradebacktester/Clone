---
name: Market Data Provider Architecture
description: Pluggable provider system for real market data; backtest engine no-synthesis enforcement; DB dependency/export quirks; BiasType naming conflict.
---

## Rule
The backtest and historical validation engines must never synthesize candles. Real 15M (or any TF) data is fetched from the ProviderRegistry. If no real data → return an empty result with dataWarnings explaining what's missing.

**Why:** User's explicit requirement — synthetic backtests are misleading for strategy validation. The `dataSynthetic: false` and `dataWarnings` fields in BacktestResult make the absence of real data clearly visible to the frontend.

**How to apply:** `runBacktest` in `lib/market-analysis/src/backtest/engine.ts` uses `createDefaultRegistry().fetchBest()`. If `candles.length < 50`, return early with a zeroed result and a warning. Never call `generateSyntheticCandlesForDateRange` in the backtest path (the live analysis engine's fetcher.ts synthetic fallback is acceptable for the live price feed only).

---

## DB dependency quirk
`lib/market-analysis` needs `@workspace/db` as a workspace dependency (in `package.json`) and `lib/db` as a reference in `tsconfig.json`. Without this, the standalone `pnpm --filter @workspace/market-analysis run typecheck` fails with "Cannot find module @workspace/db".

The DB package declarations must be pre-built (`node_modules/.bin/tsc -p lib/db/tsconfig.json`) before the market-analysis typecheck can use composite project resolution.

---

## DB schema export quirk
`lib/db/src/schema/index.ts` must explicitly re-export `./historical` to expose `historicalCandlesTable` and `historicalSessionsTable`. Without this, any package importing `@workspace/db/schema` will get "no exported member" errors. After adding to schema index, rebuild declarations.

---

## BiasType naming conflict
`lib/market-analysis/src/replay/bias-detector.ts` and `lib/market-analysis/src/historical/bias-checker.ts` both export `BiasType`. Using `export * from "./historical/index.js"` in the root index causes TS2308 ambiguity. Fix: selectively re-export from historical, renaming the conflicting type: `export type { BiasType as HistoricalBiasType }`.

---

## Provider priorities (as of implementation)
- OANDA: priority 3 — requires OANDA_API_KEY env var
- Dukascopy: priority 5 — stub, not yet fully implemented
- HistData.com: priority 7 — CSV files in `uploads/market-data/histdata/`; 1M bars aggregated to 15M/1H/4H/1D on-the-fly
- MT5 CSV Export: priority 8 — files in `uploads/market-data/mt5/`
- Local CSV: priority 9 — files in `uploads/market-data/local/`
- Yahoo Finance: priority 10 — active, 15M limited to 60 days, 1H up to 730 days

## Upload directories
Created at startup: `uploads/market-data/{mt5,local,histdata}/`. CSV upload route supports type `"mt5"`, `"local"`, or `"histdata"`.

## API routes
All under `/api/historical/`:
- `GET /providers` — provider list with configured status
- `GET /data-status` — cache coverage for all 12 pair×tf combos
- `GET /sessions` — validation sessions from DB
- `GET /sessions/:id` — full session detail
- `DELETE /:id` — delete session
- `POST /fetch` — fetch from registry + cache
- `POST /run` — async validation pipeline (creates DB session, responds immediately, runs in setImmediate)
- `POST /upload-csv` — base64 CSV upload to correct upload dir

## BacktestResult new fields
`dataSource?: string`, `dataSynthetic?: boolean`, `dataWarnings?: string[]`, `dataCoveragePct?: number` — added to both the type in types.ts and `buildBacktestResponse` in the backtest route.
