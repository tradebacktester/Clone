# Learning Quality Monitor — Technical Report
**System:** KRYTOS V2 — Learning System Enhancement, Phase 4**
**Status:** ADVISORY ONLY — quality alerts never modify trading behavior**
**Date:** 2026-06-28**

---

## 1. Executive Summary

The Learning Quality Monitor produces a composite quality score (0–100) for the learning system by evaluating 8 independent dimensions of data and system health. It generates actionable advisory alerts for the operator and identifies the root causes of quality degradation.

All outputs are advisory. The monitor has no write access to trading, risk, or execution subsystems.

---

## 2. Quality Dimensions (8 equal weight, 12.5% each)

| # | Dimension | What It Measures | Key Alert |
|---|-----------|-----------------|-----------|
| 1 | **Data Completeness** | Missing fields, duplicates, missing outcomes | `missing_data`, `duplicate_data` |
| 2 | **Sample Size** | Number of closed trades for statistical validity | `low_sample` |
| 3 | **Confidence Stability** | CV of per-cycle mean confidence (higher CV = worse) | `confidence_decline`, `excessive_uncertainty` |
| 4 | **Pattern Stability** | CV of per-cycle win rates | `pattern_instability` |
| 5 | **Recommendation Stability** | CV of per-cycle advisory recommendation count | `recommendation_instability` |
| 6 | **Calibration Status** | ECE from confidence calibration engine | `poor_calibration` |
| 7 | **Drift Status** | Active drift alert count from drift detector | `significant_drift` |
| 8 | **Validation Success** | % of learning cycles passing statistical validation | `validation_failure` |

---

## 3. Composite Score Formula

```
qualityScore = Σ (dimension_i.score × 0.125)
```

All dimensions scored 0–100. Composite score clipped to [0, 100] after weighting.

---

## 4. Grading Scale

| Grade | Score Range | Operator Action |
|-------|------------|-----------------|
| **A** | 85–100 | System operating excellently |
| **B** | 70–84 | Minor monitoring attention |
| **C** | 55–69 | Review weaknesses; plan improvement |
| **D** | 40–54 | Operator intervention recommended |
| **F** | 0–39 | Suspend advisory reliance; investigate immediately |

---

## 5. Alert Types

| Alert Type | Severity Range | Trigger |
|-----------|---------------|---------|
| `low_sample` | medium–critical | n < 30 trades |
| `confidence_decline` | medium–high | Recent mean confidence dropped > 10pts |
| `poor_calibration` | medium–high | ECE > 10% |
| `missing_data` | medium–critical | > 20% critical fields missing |
| `excessive_uncertainty` | medium–high | CV of confidence > 25% |
| `significant_drift` | medium–critical | Active or critical drift alerts present |
| `duplicate_data` | low–high | > 0 duplicate trade records |
| `validation_failure` | high–critical | < 50% of learning cycles pass validation |
| `pattern_instability` | medium–high | CV of win rates > 20% |
| `recommendation_instability` | medium | CV of recommendation count > 30% |

---

## 6. Alert Deduplication

Alerts are deduplicated by `alertType::dimension` key. If the same alert type fires from the same dimension multiple times (e.g., from different sub-checks), only the highest severity is kept. This prevents alert storm for the operator.

---

## 7. Scoring Details by Dimension

### Data Completeness
- Critical fields: `pair`, `session`, `outcome`, `pnl`
- Score: `max(0, 100 - missingPct×3 - dupPenalty - missingOutcomesPenalty)`
- Duplicate penalty: capped at 30pts

### Sample Size
| n | Score |
|---|-------|
| ≥200 | 100 |
| ≥100 | 80 |
| ≥50 | 65 |
| ≥30 | 50 |
| ≥15 | 35 |
| <15 | 0–30 |

### Confidence Stability
- CV = σ/μ of historical per-cycle mean confidence
- Score: `max(0, 100 - CV×150)`

### Calibration Status
- Score: `max(0, 100 - ECE×333)` — maps ECE [0, 0.30] → score [100, 0]

### Drift Status
- Score: `max(0, 100 - critical×25 - non_critical×10)`

### Validation Success
- Score: `passedValidations / totalValidations × 100`

---

## 8. Test Coverage

- 21 tests across 7 suites
- Coverage: empty input, sufficient data, all 8 dimension score ranges, alert generation for all major types, alert deduplication, strengths/weaknesses/recommendations output
- All 21 tests pass

---

## 9. API Endpoints

```
GET  /api/learning/enhancement/quality                      — live quality snapshot
GET  /api/learning/enhancement/quality/alerts               — active alerts
GET  /api/learning/enhancement/quality/history              — historical snapshots
POST /api/learning/enhancement/quality/alerts/:id/resolve   — resolve alert
```
