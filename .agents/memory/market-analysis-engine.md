---
name: Market Analysis Engine
description: lib/market-analysis architecture, signal generation thresholds, and synthetic data quirks
---

## Package
`lib/market-analysis` — pure TypeScript, no external runtime deps, uses built-in fetch (Node 24).

## Signal confidence threshold
Set to **38** (was 55). Reason: synthetic GBM data doesn't produce AMD sequences, so base confidence from zone + session alone is ~40. Real Yahoo Finance data will score higher (AMD + liquidity grabs add 15-20 pts each).

## Synthetic data
Uses Ornstein-Uhlenbeck mean-reversion (`meanReversionSpeed = 0.03`) centered on base prices:
- EURUSD: 1.085, GBPUSD: 1.270, USDJPY: 149.5
- Without mean-reversion, GBM drifts away from zones → 0 signals

**Why:** Yahoo Finance is the primary data source. When unavailable (blocked, timeout), synthetic data is used. Mean-reversion keeps price near base → zones are detected near current price → signals fire.

## Signal detection
Two modes: "in zone" (isPriceInZone) OR "approaching zone" (within 3×ATR of zone boundary). Approaching signals get `"Approaching demand/supply zone"` factor (18pts) vs "Price in active zone" (28pts).

## Zone detection
Only persisted for 4h timeframe. 1d zones often 0 because synthetic data at daily granularity rarely creates large impulse candles with clear bases.

## Session detection
Uses `getBestSessionForPair()` — always returns a session tag (london/newyork/asian), never blocks signal generation. Pre-fix used `getCurrentSession()` which blocked signals after 20 UTC.

## DB persistence rule
Signals are only cleared+replaced when new signals exist. If no signals detected, DB signals preserved.

**How to apply:** Any change to signal generation confidence or thresholds should be tested with synthetic data first (run `runFullAnalysis('EURUSD', '4h')` and log signal count).
