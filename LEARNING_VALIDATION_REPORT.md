# LEARNING VALIDATION REPORT
**KRYTOS V2 — Phase 3 | Learning Validation Engine**
**Generated:** 2025-06-28 | **Version:** 1.0.0 | **Status:** Operational

---

## Executive Summary

The Learning Validation Engine has been deployed as part of Phase 3 of the KRYTOS V2 Learning System. This engine provides institutional-grade statistical validation for every learning conclusion before it is consumed by any downstream advisory module.

**No learning conclusion is accepted without validation.** Every cycle passes through 8 statistical checks, and conclusions are only marked `passed` when all critical checks succeed.

**Current System State:** Awaiting trade data to populate validation history. The engine is fully operational and will validate every learning cycle as trades are executed.

---

## Key Metrics

| Metric | Current Value | Target | Status |
|--------|--------------|--------|--------|
| Minimum Sample Size Threshold | 30 trades | 30 | ✓ Configured |
| Statistical Significance Level | α = 0.05 | α ≤ 0.05 | ✓ Configured |
| Confidence Interval Width Target | ≤ 20pp | ≤ 20pp | ✓ Configured |
| Stability Grade Threshold | B (≥65/100) | B | ✓ Configured |
| Data Quality Threshold | ≥70/100 | 70 | ✓ Configured |
| Reproducibility Threshold | ≥60/100 | 60 | ✓ Configured |
| Outlier Influence Limit | <15% | 15% | ✓ Configured |
| Total Checks Per Validation | 8 | 8 | ✓ Complete |

---

## Validation Engine Architecture

### 8 Statistical Checks

1. **Minimum Sample Size** (Critical)
   - Requires n ≥ 30 trades before any statistical conclusion
   - Below 10: ERROR — conclusions blocked
   - 10–29: WARNING — degraded confidence
   - ≥ 30: PASSED

2. **Statistical Significance** (Binomial Z-Test)
   - Null hypothesis: win rate = 50% (random chance)
   - Z-score computed with two-tailed p-value
   - Requires p < 0.05 AND n ≥ 30 to pass
   - Uses standard error: √(p₀(1-p₀)/n)

3. **95% Confidence Interval** (Wilson Score Method)
   - Wilson CI chosen over normal approximation for small samples
   - Target: CI width ≤ 20 percentage points
   - Formula: (p̂ + z²/2n ± z·√((p̂(1-p̂)/n + z²/4n²))) / (1 + z²/n)

4. **Performance Stability** (Rolling Window Analysis)
   - Splits features into 4 equal time windows
   - Computes win rate in each window
   - Measures coefficient of variation (CV = σ/μ)
   - Grades: A (CV≤20%), B (CV≤35%), C (CV≤50%), D (CV≤65%), F (>65%)

5. **Data Quality** (Completeness + Conflict Detection)
   - Checks 6 critical fields per trade: pair, session, outcome, pnl, setupScore, tqi
   - Missing data penalty: 2× the missing percentage
   - Conflict detection: flags win rate >70% alongside avg RR <0.8
   - Minimum passing score: 70/100

6. **Confidence Interval Width**
   - Measures practical significance beyond p-values
   - Wide CI (>35pp) indicates insufficient data for reliable estimation

7. **Outlier Influence** (IQR + Jackknife)
   - IQR method identifies PnL outliers (1.5×IQR rule)
   - Jackknife delta: |win_rate_full − win_rate_without_outliers|
   - Influence score: outlier% + jackknife delta × 100
   - Threshold: <15% total influence

8. **Reproducibility** (Cycle-to-Cycle Variance)
   - Measures variance of win rates across historical learning cycles
   - High cycle variance (>5pp²) indicates unstable conclusions
   - Score: max(0, 100 − variance × 1000)

---

## Strengths

- **Statistical rigor**: Wilson score CI provides accurate coverage for small samples where normal approximation fails
- **Multi-dimensional validation**: No single metric can mask a failing conclusion
- **Explicit thresholds**: All pass/fail criteria are predetermined and auditable
- **Non-destructive**: Validation results are append-only, preserving full history
- **Explainability**: Every check generates a human-readable message and recommendation
- **Graceful degradation**: `degraded` status allows partial use of conclusions with caveats

## Weaknesses

- **Cold start problem**: Minimum sample of 30 trades means early validation cycles will always fail; this is by design
- **IQR outlier detection**: Less effective for bimodal PnL distributions common in high-RR strategies
- **Regime blind**: Current validation aggregates across all regimes; future versions should validate per-regime separately
- **No Bayesian prior**: Starting from scratch with each validation rather than updating beliefs incrementally

## Statistical Validity

All statistical methods used are classical, established, and interpretable:
- Wilson Score CI: standard for proportion estimation with finite samples
- Binomial Z-test: appropriate for win rate significance testing
- IQR method: robust to heavy-tailed distributions (forex PnL)
- Coefficient of Variation: industry standard for stability measurement

## Remaining Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Insufficient sample size for months | High (early) | Medium | Clear messaging; blocks conclusions below threshold |
| Regime-blind aggregation masking pattern degradation | Medium | High | Phase 4 will add per-regime validation |
| Survivorship bias in trade selection | Low | Medium | Load all closed trades including break-evens |
| Multiple testing inflation | Low | Low | Currently single hypothesis; monitor if tests expand |

## Recommendations for Future Development

1. Implement per-regime validation (trending vs ranging vs volatile)
2. Add Bayesian updating to leverage prior cycle results
3. Implement power analysis to determine required sample size per pattern
4. Add FDR correction if validating many patterns simultaneously
5. Consider bootstrap resampling for CI computation with heavy-tailed distributions
6. Add temporal autocorrelation tests (trades are not fully independent)

---

*This report is advisory only. The validation engine does not modify trading parameters or strategy behavior.*
