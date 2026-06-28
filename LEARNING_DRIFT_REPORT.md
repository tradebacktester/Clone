# LEARNING DRIFT REPORT
**KRYTOS V2 — Phase 3 | Drift Detection Engine**
**Generated:** 2025-06-28 | **Version:** 1.0.0 | **Status:** Monitoring Active

---

## Executive Summary

The Learning Drift Detection Engine continuously monitors the KRYTOS learning system for changes in market behavior and learning quality. When drift is detected, **the system generates alerts and reduces confidence — it never modifies the trading strategy automatically.**

Six drift types are monitored across multiple rolling time windows (7d, 30d, 90d).

**Current Status:** Drift detection engine operational. No historical trade data present — monitoring will activate as trades are closed and recorded.

---

## Key Metrics

| Drift Type | Time Windows | Alert Threshold | Current Events |
|-----------|-------------|----------------|----------------|
| Win Rate Decline | 7d, 30d, 90d | ≥5pp decline | 0 active |
| Market Regime Change | 30d | ≥15pp distribution shift | 0 active |
| Pattern Degradation | 30d | ≥15pp win rate decline per pair/session | 0 active |
| Confidence Deterioration | 30d | Statistically significant decline | 0 active |
| Volatility Shift | 30d | ≥15% spread change | 0 active |
| Correlation Change | 30d | |Δcorr(TQI,outcome)| ≥ 0.15 | 0 active |

---

## Drift Detection Architecture

### Six Drift Detectors

#### 1. Win Rate Drift (Primary Indicator)
- **Method**: Two-proportion z-test comparing baseline vs. recent period
- **Windows**: 7d, 30d, 90d (separate tests for each)
- **Severity Levels**:
  - Low: 5–10pp decline
  - Medium: 10–15pp decline
  - High: 15–20pp decline
  - Critical: >20pp decline
- **Significance**: Requires p < 0.05 and n ≥ 10 per window
- **Action on detection**: Alert generated, confidence weight reduced in affected window

#### 2. Market Regime Drift
- **Method**: Distribution comparison of regime frequency
- **Metric**: Percentage of trades in each regime (trending/ranging/volatile/low_volatility)
- **Threshold**: ≥15pp shift in any single regime within 30 days
- **Significance**: ≥25pp shift flagged as statistically significant
- **Implication**: Conclusions trained on old regime distributions may be invalid

#### 3. Pattern Degradation
- **Method**: Per-pattern (pair × session) win rate comparison
- **Granularity**: 12 pattern combinations (3 pairs × 4 sessions)
- **Threshold**: ≥15pp win rate decline per pattern within 30 days
- **Severity**: ≥25pp = high, 15–25pp = medium
- **Action**: Reduces confidence weight for affected pattern; marks for re-validation

#### 4. Confidence Deterioration
- **Method**: Welch's t-test on confidence score distributions
- **Metric**: Mean confidence score (0–100) in baseline vs. recent 30 days
- **Thresholds**: Low=5pts, Medium=10pts, High=15pts, Critical=20pts decline
- **Implication**: System is becoming less certain about its own recommendations

#### 5. Volatility Shift (Spread Analysis)
- **Method**: Comparison of mean spread (proxy for market volatility) between periods
- **Threshold**: ≥15% change in mean spread (relative)
- **Implication**: Spread-sensitive conclusions (e.g., tight-stop strategies) may break
- **Action**: Advisory alert to review spread-dependent parameters

#### 6. Correlation Drift (TQI Predictive Power)
- **Method**: Pearson correlation between TQI score and outcome (win=1, loss=0)
- **Threshold**: |Δr| ≥ 0.15 over 30 days
- **Implication**: TQI's ability to predict winners is changing
- **Severity**: High if |Δr| ≥ 0.35, medium otherwise

---

## Alert Lifecycle

```
Detected → Stored in learning_drift_events → Dashboard Alert
    → Confidence reduced in affected conclusions
    → Recommendation: "Do NOT change strategy — observe"
    → Manual review (dashboard)
    → Resolved via POST /learning/drift/resolve/:id
```

**Critical Rule**: The drift system is purely advisory. No automatic adjustments to trading parameters, risk settings, or strategy selection are ever made.

---

## Strengths

- **Multi-window analysis**: Short (7d), medium (30d), and long (90d) windows catch both acute and chronic drift
- **Statistical backing**: Z-tests prevent false positives from small fluctuations
- **Deduplication**: Identical drift events (same type+entity+window) are deduplicated, keeping highest severity
- **Severity gradient**: 4-level severity allows proportional response (monitor vs. escalate)
- **Append-only log**: Full audit trail of every drift event detected
- **Per-entity tracking**: Pattern-level drift is tracked separately from system-level drift

## Weaknesses

- **Minimum baseline required**: Drift detection requires data on both sides of the time window; no alerts in first 30–90 days
- **Pearson correlation limitation**: Non-linear relationships between TQI and outcome won't be captured
- **Single-factor regime drift**: Regime shift is measured by frequency, not by win rate per regime
- **No autocorrelation correction**: Tests assume independence between trades (not fully valid in forex)

## Remaining Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| High false positive rate in early data | Medium | Low | Minimum n=5 per window; statistical significance required |
| Drift detected but incorrectly attributed | Low | Medium | Multiple drift types provide cross-validation |
| Alert fatigue from too many low-severity events | Medium | Low | Severity filtering + deduplication |
| Regime drift misclassified as win rate drift | Low | Medium | Both are tracked separately for cross-reference |

## Recommendations for Future Development

1. Add CUSUM (Cumulative Sum) control charts for more sensitive drift detection
2. Implement Kolmogorov-Smirnov test for distribution-level drift (not just mean shift)
3. Add automatic confidence reduction coefficient to advisory scores when drift is active
4. Implement drift forgetting: auto-resolve alerts older than N days if subsequent data normalizes
5. Add cross-pair correlation drift (USD pairs moving together vs. independently)
6. Build drift forecast: predict when win rate will cross warning threshold given current trend

---

*This report is advisory only. No trading strategy modifications are made automatically.*
