---
name: Replay Engine
description: Strategy Validation & Replay Framework — zero look-ahead candle-by-candle replay with per-rule decision traces and bias detection.
---

## Files
- `lib/market-analysis/src/replay/` — core engine modules
- `lib/market-analysis/src/replay/__tests__/` — 31 tests across 3 suites
- `artifacts/api-server/src/routes/replay.ts` — REST endpoints
- `artifacts/dashboard/src/pages/replay.tsx` — UI page
- `lib/db/src/schema/replay.ts` — replay_sessions table (already pushed)
- `VALIDATION_REPORT.md` — pre-generated report in workspace root

## Critical: Zone Detection in Synthetic Data
`detectZones` requires `score >= 70` which needs:
- Impulse candle body ≥ 1.5×ATR
- BOS (Break of Structure): close exceeds prior 20-bar high/low = +25 pts
- Minimum viable: displacement(+20) + BOS(+25) + fresh(+25) = 70

The standard `generateSyntheticCandlesForDateRange` uses mean-reverting Brownian motion with `barVol = dailyVol/sqrt(barsPerDay) ≈ 0.00245` for 4h EUR/USD. This is **too low** — impulse bodies rarely reach 1.5×ATR, and mean-reversion prevents BOS from forming. Result: 0 zones detected, 0 trades.

**Fix**: Use a phase-based candle generator (accumulation → impulse → retracement → distribution cycle). Impulse phase uses `trendDir * barVol * 2.2` drift, creating bodies ~2×ATR reliably. This is baked into the replay engine's `generateReplayCandles` function (does NOT use the shared fetcher generator).

## Zone Proximity Check
`isPriceInZone` uses `atr * 0.5` buffer. The replay uses 6×ATR approach window (up from original 3×ATR) to catch zones before price enters. Matching window needed in both replay-engine (fast-path) and rule-evaluator (Zone Proximity rule).

## Bias Detection Storage Bug (FIXED)
The DB `biasFlags` column initially stored only `result.bias.flags` (array). The report route expected the full `BiasSummary` object (`flags`, `overallRating`, `lookAheadDetected`, etc.), causing crash on `bias.flags.length`. Fix: store `result.bias` (full BiasSummary) and reconstruct in report route with fallback if column contains old array format.

## Test Paths
```bash
cd lib/market-analysis
../../node_modules/.pnpm/node_modules/.bin/tsx --test \
  src/replay/__tests__/replay-engine.test.ts \
  src/replay/__tests__/rule-evaluator.test.ts \
  src/replay/__tests__/bias-detector.test.ts
# 31 tests, 0 fail
```

## Repainting Flags
Zones disappear within 5 candles of trade signal because `detectZones` calls `isZoneBroken` on the full visible window — if subsequent candles violate the zone, it gets dropped. This is expected behavior with mean-reverting data and is correctly flagged as "suspicious" by bias detection.

## Why
- Zero look-ahead is enforced by slicing `candles[0..i]` at each step; outcome resolution uses future candles only AFTER trade decision is recorded.
- Phase-based data is essential for meaningful replay; flat/mean-reverting synthetic data produces no tradeable zones.
