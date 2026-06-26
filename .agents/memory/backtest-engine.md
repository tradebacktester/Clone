---
name: Backtest Engine
description: Zone-based backtest engine; why the full SMC pipeline was bypassed for synthetic-data backtesting.
---

## Rule
The backtest engine (`lib/market-analysis/src/backtest/engine.ts`) uses a direct zone-based signal generation, NOT the full `generateSignals()` SMC pipeline.

**Why:** `generateSignals()` has multi-gate filtering (confirmation candle BOS check requires 40+ pts, final score ≥ 80) that produces 0 trades on synthetic candle data. The live analysis scheduler also shows `signals: 0` consistently because real data rarely satisfies all gates simultaneously. For backtesting the analytics pipeline (monthly/yearly/regime stats) this would make the feature useless.

**How to apply:**
- `detectBacktestZones()` — scans last 60 candles for swing highs/lows (look 2 bars left/right), filters violated zones, keeps most-recent 8.
- `generateBacktestSignal()` — checks `inZone || approaching`, direction must match recent swing structure, requires bullish/bearish candle body ≥ 30% of range.
- Zone strength threshold: 60 (random 60–90), well below the 80 gate of the live pipeline.
- Session filter: EUR/GBP pairs skip Asian session; USD/JPY trades all sessions.
- Trailing stop: moves to break-even when price reaches 50% of TP distance.
- Max hold: 40 bars (force-closes at market).

## calcFinalTradeScore
Added optional 5th arg `minScore = 80` — backtests call with `minScore: 40` when bypassed (not currently used, but the param is wired in).

## Stats pipeline
- `lib/market-analysis/src/backtest/stats.ts` — `calcFullStats()` returns `monthlyReturns`, `yearlyReturns`, `regimeStats`, `sessionStats`, `pairStats`, `zoneStats`, `expectancy`, `avgRR`, etc.
- `BacktestTrade` has `regime` field to power regime breakdown.
- `BacktestResult` has `equityCurve`, `monthlyReturns`, `yearlyReturns`, `regimeStats`.

## API
- `/api/backtest/batch` (POST) — `BatchBacktestInput` → `BatchBacktestResult` (3 pairs + combinedStats).
- OpenAPI spec has full schemas; codegen generated React Query hooks.
- Route uses `buildBacktestResponse()` helper to avoid Zod parse failures on BacktestTrade vs Trade schema mismatch.
