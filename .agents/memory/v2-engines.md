---
name: V2 Engine Suite
description: V2 build — MTF confirmation, TQI, dynamic sizing, correlation, explanation, reports; integration into paper-engine and analyzer; test runner path.
---

## What was built
6 engine modules in `artifacts/api-server/src/lib/`:
- `mtf-engine.ts` — Multi-Timeframe alignment (1D/4H/1H/15M); weighted scoring (0.35/0.30/0.20/0.15); getCachedAnalysis() called internally
- `tqi-engine.ts` — Trade Quality Index 0-100; grade A/B/C/D/F; tradeable threshold = 65
- `dynamic-sizing.ts` — 5 multiplicative factors (confidence, volatility, drawdown, regime, performance); lot size output
- `correlation-engine.ts` — EURUSD/GBPUSD +0.82, EURUSD/USDJPY −0.68, GBPUSD/USDJPY −0.60; blocks at effective corr > 0.70
- `explanation-engine.ts` — human-readable explanation object per trade
- `report-engine.ts` — daily/weekly/monthly P&L reports with suggestions

## Paper-engine V2 gate order
1. **MTF gate**: block if `alignedCount < 2`
2. **TQI gate**: block if `tqiResult.tradeable === false` (tqi < 65) — only fires if analysisResult provided
3. **Correlation gate**: block if `effectiveCorr > 0.70`
4. Dynamic sizing replaces fixed lot calc when analysisResult present

**Why:** Gates stack in order of strictness. MTF is cheapest (in-memory), TQI needs analysis, correlation needs open positions. Skip remaining gates if earlier one blocks.

## Analyzer change
`TIMEFRAMES` now includes `"15m"` and `"1h"` (was just `"4h"` and `"1d"`). `executePaperSignals` signature changed to accept optional `AnalysisResult` parameter — passed from the 4H branch.

## No circular dependency
Chain: `analyzer.ts → paper-engine.ts` (paper imports from analyzer? No — analyzer calls paper). `mtf-engine.ts → analyzer.ts` (getCachedAnalysis). `paper-engine.ts → mtf-engine.ts`. No cycle.

## Test runner path
tsx is not at workspace root. Correct command:
```
node --import ./node_modules/.pnpm/node_modules/tsx/dist/esm/index.cjs --test <test-files>
```
Run from `/home/runner/workspace`.

## Volatility factor boundary bug (test)
`calcVolFactor(2.0)` returns 0.70, NOT 0.55, because the condition is `> 2.0` (strict greater than). The test expectation must match the strict inequality.

## Performance factor max
`calcPerfFactor(100)` = 1.20 (formula ceiling before the 1.30 hard clamp). The formula `0.70 + ((100-30)/70)*0.50 = 1.20`. The 1.30 clamp only applies if formula exceeds it (it never does for valid inputs 0-100).

## Frontend pages added
- `/insights` — MTF cards + TQI + Correlation Matrix
- `/reports` — generate/view daily/weekly/monthly reports
- `/time-performance` — win rate/P&L by day/hour/session/pair/regime/setup/volatility
- All wired in App.tsx + nav-sidebar.tsx

## DB columns added to trades table
`tqi`, `tqiGrade`, `mtfAligned`, `mtfScore`, `dynamicRiskPct`, `explanation` (jsonb)

## All tests: 68/68 pass
4 test files in `lib/market-analysis/src/tests/v2-*.test.ts`
