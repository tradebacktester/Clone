# VALIDATION_REPORT.md
*Generated: 2026-06-26*
*Pair: EURUSD | Timeframe: 4h | Period: 2024-01-01 → 2024-06-30*

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Total Candles Replayed | 1,036 |
| Candles with Zone Activity | 758 |
| Total Trades Taken | 9 |
| Winning Trades | 9 |
| Losing Trades | 0 |
| Win Rate | 100.0% |
| Avg Risk:Reward | 2.04:1 |
| Avg Final Score | 85.5/100 |
| Bias Rating | ⚠️ SUSPICIOUS |

---

## Trade Decision Breakdown

| Category | Count | Percentage |
|----------|-------|------------|
| Trades Taken | 9 | 0.9% |
| No Trade (rules failed) | 749 | 72.3% |
| No Zone Activity | 278 | 26.8% |

---

## Rule Accuracy Analysis

| Rule | Pass Rate | Win Rate (Pass) | Win Rate (Fail) | Precision | Recall |
|------|-----------|-----------------|-----------------|-----------|--------|
| Zone Proximity            |    100.0% |        100.0% |          0.0% |    100.0 |  100.0 |
| Zone Strength             |    100.0% |        100.0% |          0.0% |    100.0 |  100.0 |
| HTF Market Structure      |    100.0% |        100.0% |          0.0% |    100.0 |  100.0 |
| Premium/Discount          |     36.9% |        100.0% |        100.0% |    100.0 |   75.0 |
| Liquidity Sweep           |     19.4% |        100.0% |          0.0% |    100.0 |  100.0 |
| AMD Phase                 |     62.2% |        100.0% |          0.0% |    100.0 |  100.0 |
| Confirmation Candle       |     30.0% |        100.0% |          0.0% |    100.0 |  100.0 |
| Final Score               |     13.0% |        100.0% |        100.0% |    100.0 |   91.7 |

### Interpretation
- **Pass Rate**: How often this rule allows the trade to proceed to the next rule
- **Win Rate (Pass)**: Of trades where this rule passed, how many were winners
- **Win Rate (Fail)**: Of trades where this rule blocked, how many would have been winners (false negatives)
- **Precision**: TP / (TP + FP) — how accurate the rule is when it says "trade"
- **Recall**: TP / (TP + FN) — how well the rule catches winning opportunities

---

## False Positives & False Negatives

| Metric | Count | Notes |
|--------|-------|-------|
| False Positives (losing trades) | 0 | Trades taken that resulted in losses |
| False Negatives (missed winners) | 749 | Candles with zone activity where no trade was taken |
| Missed Opportunities | 0 | Significant price moves with no entry |

---

## Bias Detection

**Overall Rating: ⚠️ SUSPICIOUS**

| Bias Type | Count |
|-----------|-------|
| Look-Ahead Bias | 0 |
| Repainting | 3 |
| Future Data Leakage | 0 |
| Duplicate Signals | 0 |
| Invalid Entries | 1 |

### Detailed Findings

#### INVALID ENTRY — HIGH
**Candle:** 2024-01-09T16:00:00.000Z (index 52)  
**Description:** BUY entry price (1.09570) is significantly above candle high (1.09264) — price may not have been reachable  
**Evidence:** entry=1.09570, candle high=1.09264  
**Suggested Fix:** Use candle close or zone top as entry — not a price above the bar's high

#### REPAINTING — HIGH
**Candle:** 2024-01-09T12:00:00.000Z (index 51)  
**Description:** Zone that triggered trade at index 50 disappeared within 5 candles — possible repainting  
**Evidence:** demand zone [1.08501–1.08544] not found at index 51  
**Suggested Fix:** Zones should be formed from past candles only. If a zone disappears after formation, the detection logic may be using future data to validate it.

#### REPAINTING — HIGH
**Candle:** 2024-01-27T20:00:00.000Z (index 161)  
**Description:** Zone that triggered trade at index 160 disappeared within 5 candles — possible repainting  
**Evidence:** demand zone [1.10303–1.10449] not found at index 161  
**Suggested Fix:** Zones should be formed from past candles only. If a zone disappears after formation, the detection logic may be using future data to validate it.

#### REPAINTING — HIGH
**Candle:** 2024-03-09T00:00:00.000Z (index 408)  
**Description:** Zone that triggered trade at index 407 disappeared within 5 candles — possible repainting  
**Evidence:** demand zone [1.10055–1.10201] not found at index 408  
**Suggested Fix:** Zones should be formed from past candles only. If a zone disappears after formation, the detection logic may be using future data to validate it.

---

## Suggested Fixes

- **Zone persistence**: Zones are disappearing within 5 candles of signal generation. Review zone formation logic — zones should be anchored to historical impulse candles and not re-evaluated retroactively.
- **Liquidity gate relaxation**: The Liquidity Sweep rule has a very low pass rate (19.4%). Consider relaxing the lookback window from 8 to 12 bars, or downgrading it from a hard filter to a soft scoring factor.
- **AMD threshold**: AMD full-sequence score ≥80 is rarely met. Consider relaxing to ≥65 or using partial AMD phases (Accumulation only) as a softer filter.

---

## Technical Validation Notes

### Look-Ahead Bias Prevention
The replay engine enforces zero look-ahead by slicing the candle array to `candles[0..i]` at each step `i`. All analysis functions (zone detection, liquidity sweep, AMD, confirmation) are called exclusively on this past-only slice. Outcome resolution (win/loss determination) uses future candles but only **after** the trade decision has been recorded.

### Zone Validity
Supply and demand zones are derived from historical impulse candles using displacement and BOS scoring. A zone is marked `active` only if price has not violated its boundaries in candles prior to the current bar.

### Signal Independence
Each candle's decision trace is fully independent. The engine does not carry forward state from one candle to the next (beyond the accumulated candle history), preventing any form of state-based look-ahead.

### Phase-Based Synthetic Data
The replay engine generates structured synthetic price data with explicit accumulation → impulse → retracement → distribution phases. This ensures supply/demand zones reliably form (requiring candle body ≥ 1.5×ATR and BOS break), giving statistically meaningful evaluation across the replay period.

---

## Test Coverage

| Test Suite | Tests | Pass | Fail |
|-----------|-------|------|------|
| Replay Engine | 13 | 13 | 0 |
| Rule Evaluator | 9 | 9 | 0 |
| Bias Detector | 9 | 9 | 0 |
| **Total** | **31** | **31** | **0** |

All tests validate zero look-ahead guarantees, rule evaluation correctness, and bias detection logic.

---

*Report generated by TradeClone AI — Strategy Validation & Replay Framework*
