# Market Regime Transition Detection — Technical Report
**System:** KRYTOS V2 — Learning System Enhancement, Phase 4**
**Status:** ADVISORY ONLY — zero trading behavior modification**
**Date:** 2026-06-28**

---

## 1. Executive Summary

The Market Regime Transition Detector identifies when the market's statistical character changes — e.g., from trending to ranging, from calm to volatile. Regime transitions are critical events for the learning system because historical trade data accumulated in one regime may not apply to the new regime. This engine surfaces these transitions as operator alerts and advisory context.

No strategy parameters, risk limits, or execution thresholds are modified.

---

## 2. Statistical Methods

Five independent methods are combined to classify and detect transitions:

### 2.1 Hurst Exponent (R/S Analysis)
- **H < 0.45**: Mean-reverting (ranging market)
- **H ≈ 0.50**: Random walk (neutral)
- **H > 0.55**: Trending (persistent directional movement)
- Computed via R/S analysis over multiple lag windows, using OLS slope of log(R/S) vs log(lag)

### 2.2 Rolling Volatility
- Annualized standard deviation of log returns over a 20-candle window
- Compared against the full-window baseline to classify expansion/compression
- High volatility threshold: 1.5× baseline
- Low volatility threshold: 0.6× baseline

### 2.3 Average True Range (ATR)
- Standard 14-period ATR: `max(H-L, |H-Cprev|, |L-Cprev|)`
- ATR change % between windows is a key transition signal
- Used to compute `atrChangePct` stored on every transition

### 2.4 ADX Proxy (Directional Movement Proxy)
- Approximation: ratio of net price movement to total candle path length
- High ADX proxy (>40) indicates strong trending condition
- Does not require tick-level ±DI computation

### 2.5 CUSUM Change-Point Detection
- Cumulative sum of z-score deviations from the rolling mean
- Scores normalized to 0–100 (threshold at score 5 in raw form)
- `cusum_score > 70` → structural break classification
- Stored as `cusum_score` on the transition record

---

## 3. Transition Classification

| Transition Type | Trigger Condition |
|----------------|-----------------|
| `trend_reversal` | trending ↔ ranging |
| `expansion` | volatility increasing into expansion/volatile regime |
| `compression` | volatility decreasing into low_volatility/compression regime |
| `volatility_spike` | sudden ATR increase into volatile regime |
| `volatility_drop` | sudden ATR decrease into low_volatility |
| `structural_break` | CUSUM score > 70 |
| `regime_shift` | default for unclassified transitions |

---

## 4. Regime Labels

| Label | Characteristic |
|-------|---------------|
| `trending` | H > 0.55, ADX > 35, persistent direction |
| `ranging` | H < 0.45, ADX < 25, mean-reverting |
| `volatile` | Rolling vol > 1.5× baseline |
| `low_volatility` | Rolling vol < 0.6× baseline |
| `expansion` | Volatility above baseline but not extreme |
| `compression` | Volatility below baseline but not extreme |

---

## 5. Transition Confidence

Transition confidence (0–100) is computed as a weighted combination of:
- 30% weight: regime confidence of the previous regime
- 50% weight: regime confidence of the new regime
- 40% weight: CUSUM score (capped at 50)

Auto-confirmed if confidence ≥ 70%.

---

## 6. Data Flow

Regime analysis requires candles. When no OANDA connection is available, candles are synthesized from trade feature data (pnl sign and TQI drive simulated price movement). This is clearly a proxy — live broker integration will supply real tick/bar data.

---

## 7. Test Coverage

- 18 tests across 9 suites
- Coverage: insufficient data handling, trending/volatile/flat detection, all metric ranges, transition field completeness, OHLC validity, regime history builder
- All 18 tests pass

---

## 8. API Endpoints

```
GET  /api/learning/enhancement/regime/transitions   — stored transitions + history
GET  /api/learning/enhancement/regime/state         — current regime state (live)
POST /api/learning/enhancement/run-regime-analysis  — trigger regime detection
```
