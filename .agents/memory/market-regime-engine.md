---
name: Market Regime Engine
description: Architecture, quirks, and constraints for the market regime detection and adaptive weighting system.
---

## Module layout
`lib/market-analysis/src/market_regime/` — four files:
- `volatility_analyzer.ts` — ATR, volatility percentile (midpoint rank), range compression
- `trend_analyzer.ts` — ADX (+DI/-DI), market structure score from swing points
- `regime_detector.ts` — classifies into trending/ranging/volatile/low_volatility with confidence 0-100
- `adaptive_weights.ts` — per-regime weight profiles, `adaptRegimeWeights()` (min 30 samples), `calcRegimePerformance()`

## Percentile rank bug fix
The volatility percentile uses midpoint rank formula to handle ties:
```
percentile = ((strictBelow + 0.5 * equal) / total) * 100
```
Without this, all-equal ATR series (flat candles) score at 100th percentile → incorrectly detected as volatile.

## Regime detection thresholds
- volatile: volatilityPercentile ≥ 75 OR atrPercent ≥ 0.8%
- low_volatility: volatilityPercentile ≤ 25 AND atrPercent < 0.35%
- trending: adx ≥ 25 OR trendStrength ≥ 50
- ranging: everything else

## DB changes
- `market_regime` table: added adx_equivalent, regime_confidence, volatility_percentile, range_compression
- `trades` table: added regime, regime_confidence columns
- New tables: `regime_performance`, `regime_weights`

## API routes
- GET /api/regime/analytics — performance stats + current regimes per pair
- GET /api/regime/weights — adaptive weights per regime
- GET /api/regime/current — current regime detection for each pair

## Dashboard
Regimes page at `/regime` in nav sidebar (TrendingUp icon). Shows: best regime banner, per-regime stat cards, win rate bar chart, component win rate chart, adaptive weight profiles, detailed table.

## Test runner
Tests use Node.js built-in `node:test` + `node:assert`. Run with:
```
/home/runner/workspace/node_modules/.pnpm/node_modules/.bin/tsx --test src/market_regime/__tests__/regime.test.ts
```
Vitest blocked by package firewall (403). Use tsx + node:test instead.

## Test data note
`makeLowVolatilityCandles()` must include ~60 normal-vol candles first, then 20 flat candles. Without the history, all ATR values are equal and percentile = 50% (not ≤ 25%), so low_volatility regime won't trigger.

## Adaptive weights
- Base: zone=30%, liquidity=25%, amd=25%, confirmation=20%
- Per-regime defaults differ (e.g. trending boosts liquidity to 32%)
- Requires 30 trades per regime before adapting (learning rate=0.10)
- Min/max: 5%-60% per category, always normalized to sum=1.0
- Core strategy rules NEVER modified — only confidence weights adjust

**Why:** The 30-sample floor prevents the system from over-adapting to small samples, which would break signal quality in thin regimes.
