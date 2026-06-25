---
name: Monte Carlo Engine
description: Architecture, performance details, and API for the Monte Carlo simulation system.
---

## Location
`lib/market-analysis/src/backtest/montecarlo.ts` — exported from `lib/market-analysis/src/index.ts`

## Performance
- 10,000 simulations × 100 trades = 1M random draws in ~67ms server-side
- Uses `Float64Array` and `Int32Array` (typed arrays) instead of plain JS arrays for simulation data — critical for performance at scale
- Cap: `numSimulations` max 50,000, `numTrades` max 1,000 (enforced at API layer)

## Metrics calculated
1. **Probability of Ruin** — % of sims where final equity ≤ startingCapital × (1 − ruinThreshold)
2. **Worst Drawdown** — 99.5th percentile max drawdown across all sims
3. **Expected Drawdown** — arithmetic mean of per-sim max drawdown
4. **Expected Monthly Return** — mean of (finalEquity − startingCapital) / months
5. **Worst Losing Streak** — absolute max consecutive losses across all sims
6. **Best/Worst Case** — 95th / 5th percentile final equity

## Equity curve sampling
Stores 21-point sampled curves (not full paths) during the simulation loop, indexed at `sampleAt[i] = round(i/20 * numTrades)`. Picks 5 representative runs at 2nd, 10th, 50th, 90th, 98th percentile of final equity.

**Why:** Storing all 10,000 full paths at 100 trades = 1M floats. Sampling reduces this to 210K floats (21 × 10,000) with no meaningful loss of chart fidelity.

## API endpoint
`POST /api/analytics/monte-carlo`
- Derives `winRate`, `avgWin`, `avgLoss` from DB closed trades when `useHistoricalData !== false`
- Falls back to defaults (winRate=0.55, avgWin=150, avgLoss=80) if < 5 historical trades
- Returns full `MonteCarloResult` including histogram (20 buckets), 5 equity curves, all percentiles

## Dashboard page
`/monte-carlo` — left panel: parameter form (simulations, trades, capital, ruin threshold, trades/month, optional override stats). Right panel: key metric cards, probability-of-ruin gauge, equity curve chart, distribution histogram, percentile bar chart, risk summary table.

## Histogram coloring
Buckets colored green (≥ 120% capital), light-green (≥ 100%), amber (≥ 70%), red (< 70%). Uses Recharts `<Cell>` per bar.

## Tests
14 tests in `src/backtest/__tests__/montecarlo.test.ts`. Run with tsx --test. Key assertions: percentile ordering, histogram count/frequency totals, ruin threshold direction, positive/negative expectancy, all numeric fields finite.

## Pre-existing dashboard bug fixed
`activeSignals?.map is not a function` — caused by the old hook hitting `/api/signals/active` (404) instead of `/api/market/signals` (200). Fixed by adding `Array.isArray(activeSignals)` guard in dashboard.tsx.

**Why:** The hook URL was correct but the dashboard used `?.map` without first ensuring the value was an array. Non-array responses (e.g. error objects) would pass the optional chain but fail the call.
