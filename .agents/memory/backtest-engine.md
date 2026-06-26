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

## Walk-Forward Analysis (walkforward.ts)
- `runWalkForward()` exported from `lib/market-analysis/src/backtest/walkforward.ts`, re-exported via index.
- Rolling windows: trainWindowYears=2, testWindowYears=1, stepping by testWindowYears. Default 2018-2023 = 4 windows.
- Param optimization: tries riskPerTrade ∈ {0.5, 1.0, 1.5, 2.0} on IS data, picks highest composite score (Sharpe 40%+PF 40%+WR 20%), then runs OOS with best params.
- Efficiency ratio = min(OOS_PF / IS_PF, 1.5). Overfit flag when < 0.5.
- Recommendation: "Pass" if overfitScore ≤ 25% + ER ≥ 0.65 + stable params; "Overfit" if ≥ 75% or ER < 0.4.
- Regime sensitivity = IS vs OOS win rate diff per regime (aggregated across all windows per pair).
- Parameter stability: coefficient of variation (stdDev/mean) < 0.35 = stable.
- Route: POST `/api/backtest/walkforward` — validated via `RunWalkForwardBody` from `@workspace/api-zod`.
- Dashboard: two-tab layout (Batch Backtest / Walk-Forward). WFA tab has config panel, radar chart, efficiency timeline, per-pair collapsible cards with window table + param stability + regime sensitivity charts.

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
