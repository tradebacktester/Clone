# Opportunity Cost Report
## Phase 7.3 — Analysis Methodology

---

## Purpose

Opportunity Cost Analysis answers two questions every time KRYTOS evaluates a setup:

1. **If I trade:** What is the expected benefit and what downside am I accepting?
2. **If I skip:** What risk am I avoiding and what opportunity am I foregoing?

The result is a signed **Opportunity Cost Score** (-100 to +100) and an actionable **recommendation**.

---

## Formula

### If Trade Scenario

```
tradeBenefit  = expectedRR × expectedProbability     (upside value)
tradeDownside = expectedRisk                          (exposure)
tradeEV       = p × RR - (1-p) × 1.0                (expected value in R)
```

### If Skip Scenario

```
skipBenefit          = capitalAtRisk × 0.85           (risk avoided)
skipDownside         = tradeBenefit × 0.80            (opportunity missed)
riskAvoidedBySkipping = capitalAtRisk × 0.85
opportunityMissed    = tradeBenefit × 0.80
skipEV               ≈ small positive (capital preservation)
```

### Opportunity Cost Score

```
ocScore = (tradeEV - skipEV) × 25 + (executiveScore - 50) × 0.5
```

Clamped to [-100, 100].

- **Positive** → Trading has greater expected utility than skipping
- **Negative** → Skipping preserves more utility than trading
- **Near zero** → Ambiguous — waiting or reducing is rational

---

## Recommendation Logic

| Condition | Recommendation |
|-----------|---------------|
| ocScore > 30 AND confidence >= 65 | `trade` |
| ocScore < -20 OR riskScore >= 70 | `skip` |
| waitEV >= tradeEV × 0.85 | `wait` |
| riskScore >= 55 | `reduce` |
| Default | `wait` |

---

## Output Fields

| Field | Type | Description |
|-------|------|-------------|
| `analysisId` | string | Unique identifier (`oca_xxxxxxxx`) |
| `ifTrade.expectedBenefit` | number | Expected upside from executing |
| `ifTrade.potentialDownside` | number | Risk exposure from executing |
| `ifTrade.netExpectedValue` | number | EV in R units |
| `ifSkip.expectedBenefit` | number | Risk avoided by skipping |
| `ifSkip.potentialDownside` | number | Opportunity cost of skipping |
| `ifSkip.netExpectedValue` | number | EV from capital preservation |
| `opportunityCostScore` | number | -100 to 100 |
| `recommendation` | enum | trade / skip / wait / reduce |
| `confidence` | number | 0-100 confidence in this analysis |
| `reasoning` | string | Plain-English explanation |
| `riskAvoidedBySkipping` | number | Quantified risk avoidance |
| `opportunityMissedBySkipping` | number | Quantified missed upside |

---

## Interpretation Guide

| Score Range | Interpretation | Expected Recommendation |
|-------------|----------------|------------------------|
| +70 to +100 | Strong trade signal | `trade` |
| +30 to +70  | Moderate trade advantage | `trade` or `wait` |
| -10 to +30  | Marginal/uncertain | `wait` or `reduce` |
| -30 to -10  | Mild skip advantage | `skip` or `wait` |
| -100 to -30 | Strong skip/pause signal | `skip` or `reduce` |

---

## Scalability

The OC analysis completes in < 1ms per cycle (pure arithmetic, no I/O). It scales linearly with the number of simulation candidates and can process 1,000+ judgment cycles per second without performance degradation.
