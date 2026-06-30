# Strategy Comparison Report

**Engine:** Autonomous Research & Self-Evolution Laboratory v1.0.0  
**Date:** 2026-06-30

---

## Comparison Methodology

Every experimental strategy is compared against the production baseline using a multi-metric statistical framework.

### Metrics Compared

| Metric | Production Source | Experimental Source | Higher = Better |
|--------|-----------------|---------------------|-----------------|
| Win Rate | All historical trades | Filtered with new config | Yes |
| Average R:R | Realized R:R column | Filtered R:R | Yes |
| Profit Factor | Gross profit / Gross loss | Filtered PF | Yes |
| Max Drawdown | Rolling peak-to-trough | Rolling peak-to-trough | No |
| Sharpe Ratio | Daily P&L volatility | Filtered Sharpe estimate | Yes |
| Total Return | Sum of all P&L | Filtered trade P&L sum | Yes |

### Statistical Significance Test

Win rate difference is tested using the **two-proportion z-test**:

```
z = |p1 - p2| / sqrt(pPool × (1 - pPool) × (1/n1 + 1/n2))
pPool = (p1×n1 + p2×n2) / (n1 + n2)
p-value = 2 × (1 - Φ(z))
```

A p-value < 0.05 is required for the difference to be considered statistically significant.

### Verdict Scoring (0–100)

```
verdictScore = 50 + improvementScore - regressionScore

improvementScore = sum of min(|pctChange|, 20) for improving metrics
regressionScore  = sum of min(|pctChange|, 20) for regressing metrics
```

| Score Range | Verdict |
|-------------|---------|
| ≥60 | SUPERIOR |
| 45–59 | EQUIVALENT |
| <45 | INFERIOR |

---

## Recommendation Mapping

| Verdict | Stat Significant | Recommendation |
|---------|-----------------|----------------|
| SUPERIOR | Yes | DEPLOY |
| SUPERIOR | No | CONTINUE TESTING |
| EQUIVALENT | Any | CONTINUE TESTING |
| INFERIOR | Any | ARCHIVE |
| (Failed validation) | N/A | ARCHIVE |

---

## Sample Size Requirements

- Minimum 5 filtered trades for basic comparison
- Statistical significance test requires n≥5 per group (n≥10 recommended)
- Walk-forward testing requires n≥20 total
- Out-of-sample validation uses last 20% of chronological history

---

## Risk-Adjusted Metrics

The comparison engine estimates the Sharpe ratio using:

```
sharpe = (avgPnl / stdDevPnl) × sqrt(252)
```

This is a simplified daily Sharpe estimate. For production deployment, a more rigorous time-series Sharpe with proper benchmark subtraction should be computed.

---

## Interpreting Results

### SUPERIOR + Statistically Significant
The experimental strategy demonstrates consistent improvement across multiple metrics, with the win rate difference unlikely due to random chance. **Recommendation: DEPLOY** (pending human approval).

### SUPERIOR + Not Statistically Significant
The experimental strategy looks better but the sample is too small to be confident. More trades are needed before conclusions can be drawn. **Recommendation: CONTINUE TESTING**.

### EQUIVALENT
The proposed change has neither significantly improved nor degraded performance. Consider whether the hypothesis addresses the right problem. **Recommendation: CONTINUE TESTING** or start a new hypothesis.

### INFERIOR
The experimental configuration performs worse than production on balance. The hypothesis should be rejected. **Recommendation: ARCHIVE**.
