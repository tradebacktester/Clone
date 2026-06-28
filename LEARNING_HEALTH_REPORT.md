# LEARNING HEALTH REPORT
**KRYTOS V2 — Phase 3 | Learning Health Monitor**
**Generated:** 2025-06-28 | **Version:** 1.0.0 | **Status:** Monitoring Active

---

## Executive Summary

The Learning Health Monitor provides a composite Learning Health Score (0–100) that aggregates 7 equally-weighted dimensions of learning system quality. This score is the primary readiness indicator for deciding whether advisory recommendations should be trusted.

**Threshold for advisory use**: Score ≥ 55 (Conditional) | Score ≥ 75 (Certified)

**Current Score**: Initializing — awaiting first learning cycle with trade data.

---

## Key Metrics

| Dimension | Weight | Score Range | Target |
|-----------|--------|------------|--------|
| Data Quality | 14.3% | 0–100 | ≥70 |
| Evidence Volume | 14.3% | 0–100 | ≥60 (100+ features) |
| Confidence Stability | 14.3% | 0–100 | ≥60 |
| Pattern Reliability | 14.3% | 0–100 | ≥60 |
| Validation Success Rate | 14.3% | 0–100 | ≥70 |
| Drift Detection Status | 14.3% | 0–100 | ≥70 |
| Recommendation Accuracy | 14.3% | 0–100 | ≥60 |

---

## Health Score Architecture

### Dimension 1: Data Quality (14.3%)
**Inputs**: data_quality_score, completeness_score, missing_data_pct (from latest validation)

**Formula**:
```
base = quality_score × 0.6 + completeness_score × 0.4
penalty = min(30, missing_data_pct × 2)
score = max(0, base - penalty)
```

**Interpretation**: Measures how clean and complete the trade data is. High missing data or conflicting evidence reduces this score sharply.

### Dimension 2: Evidence Volume (14.3%)
**Inputs**: total_features, total_cycles

**Formula**:
```
feature_score = min(100, features / 500 × 100)   # plateaus at 500 features
cycle_score   = min(100, cycles / 20 × 100)        # plateaus at 20 cycles
score = feature_score × 0.6 + cycle_score × 0.4
```

**Interpretation**: Measures how much historical experience the system has learned from. Ensures conclusions are not drawn from tiny samples.

### Dimension 3: Confidence Stability (14.3%)
**Inputs**: cycle_confidence_scores (last 20 cycles)

**Formula**:
```
cv = stddev(confidence_scores) / mean(confidence_scores)
score = max(0, min(100, 100 - cv × 100))
```

**Interpretation**: Measures consistency of overall system confidence across cycles. High variance indicates the system hasn't converged to stable conclusions.

### Dimension 4: Pattern Reliability (14.3%)
**Inputs**: total_patterns, reliable_patterns (is_insufficient=false AND statistical_confidence ≥ 60)

**Formula**:
```
reliability_ratio = reliable_patterns / total_patterns
volume_score      = min(100, total_patterns / 20 × 100)
score = reliability_ratio × 70 + volume_score × 0.30
```

**Interpretation**: Measures what fraction of detected patterns have sufficient statistical backing to be trusted.

### Dimension 5: Validation Success Rate (14.3%)
**Inputs**: passed_validations, total_validations, passed_cycles, total_cycles

**Formula**:
```
validation_success_rate = passed_validations / total_validations
cycle_success_rate      = passed_cycles / total_cycles
score = validation_success_rate × 60 + cycle_success_rate × 40
```

**Interpretation**: Measures the historical reliability of the validation process itself.

### Dimension 6: Drift Detection Status (14.3%)
**Inputs**: active_drift_alerts, critical_drift_alerts

**Formula**:
```
score = 100 - (critical_alerts × 25) - (non_critical_alerts × 10)
score = max(0, score)
```

**Interpretation**: Full score (100) when no active drift. Each critical alert costs 25 points; each high/medium alert costs 10 points.

### Dimension 7: Recommendation Accuracy (14.3%)
**Inputs**: recommendation_f1, brier_score

**Formula**:
```
f1_component    = f1_score × 100
brier_component = (1 - brier_score) × 100    # inverted: 0=perfect
score = f1_component × 0.6 + brier_component × 0.4
```

**Interpretation**: Measures how accurate the advisory recommendations have been. Tracks both directional accuracy (F1) and probabilistic calibration (Brier).

---

## Certification Levels

| Level | Score Range | Drift Condition | Meaning |
|-------|------------|----------------|---------|
| **Certified** | ≥75 | No critical alerts | Ready for Phase 4 Market Intelligence |
| **Conditional** | 55–74 | Any | Advisory use with caveats |
| **Not Ready** | <55 | Any | Advisory recommendations should not be used |

---

## Grading Scale

| Grade | Score | Interpretation |
|-------|-------|---------------|
| A | 85–100 | Institutional grade. Full confidence in advisory output |
| B | 70–84 | High quality. Minor gaps in evidence or stability |
| C | 55–69 | Acceptable. Use recommendations with caution |
| D | 40–54 | Below standard. Significant gaps present |
| F | 0–39 | Unacceptable. Do not rely on advisory output |

---

## Strengths

- **Equal weighting**: No single dimension can dominate or mask others
- **Trend visualization**: Health score tracked over time with AreaChart for trend analysis
- **Actionable breakdown**: Per-dimension scores identify exactly where to improve
- **Certification status**: Binary certified/conditional/not_ready maps directly to advisory policy
- **Automatic snapshots**: Every learning cycle generates a new health snapshot (append-only)
- **Narrative output**: System generates strengths, weaknesses, and recommendations automatically

## Weaknesses

- **Equal weighting assumption**: All 7 dimensions are treated as equally important; data quality may deserve higher weight
- **Linear aggregation**: Simple average may understate severity of a single F-grade dimension
- **Recommendation accuracy cold start**: Score defaults to 50 when no evaluation data exists, potentially inflating overall score
- **No time decay**: A passed validation from 90 days ago counts the same as yesterday's

## Remaining Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Evidence volume score inflated by re-runs on same data | Low | Medium | Cycle deduplication via cycle_id linkage |
| Drift status score masking chronic medium-severity drift | Medium | Medium | Alert escalation after N consecutive medium events |
| Health score used as sole proxy for strategy quality | Low | High | Documentation and UI clearly state score is advisory only |

## Recommendations for Future Development

1. Implement time-weighted dimension scoring (recent performance weighted higher)
2. Add minimum floor rule: any dimension score = 0 caps overall at 30 regardless of others
3. Implement health score forecast: project score trajectory based on evidence growth rate
4. Add comparative benchmarking: compare health score against a manually configured baseline
5. Phase 4 integration: Market Intelligence module should require Health Score ≥ 70 before consuming learning outputs

---

*The Learning Health Score is an internal quality metric. It does not directly influence trading decisions.*
