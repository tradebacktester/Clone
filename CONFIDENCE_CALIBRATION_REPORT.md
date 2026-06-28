# Confidence Calibration Engine — Technical Report
**System:** KRYTOS V2 — Learning System Enhancement, Phase 4**
**Status:** ADVISORY ONLY — zero trading behavior modification**
**Date:** 2026-06-28**

---

## 1. Executive Summary

The Confidence Calibration Engine evaluates whether the learning system's predicted confidence scores accurately reflect realized trade outcomes. A perfectly calibrated system with 70% confidence should win approximately 70% of the time. Miscalibration — in either direction — reduces operator trust in advisory outputs and can distort learning quality signals.

This engine computes five calibration metrics and generates a reliability diagram (10-bucket decomposition) usable as operator reference. No trading parameters are modified.

---

## 2. Metrics Implemented

| Metric | Formula | Range | Interpretation |
|--------|---------|-------|----------------|
| **Brier Score** | `mean((p - o)²)` | 0–1 | 0=perfect, 0.25=random, 1=worst |
| **ECE** (Expected Calibration Error) | `Σ (|B|/n) × |conf_B - acc_B|` | 0–1 | Weighted avg bucket error |
| **MCE** (Maximum Calibration Error) | `max_bucket |conf - acc|` | 0–1 | Worst single bucket error |
| **ACE** (Average Calibration Error) | `mean_bucket |conf - acc|` | 0–1 | Unweighted bucket mean |
| **Calibration Error** | ECE (primary metric) | 0–1 | Primary operator metric |

### Reliability Diagram
- 10 equal-width buckets spanning 0–100% predicted confidence
- Each bucket shows: predicted mean vs. actual win rate vs. calibration error
- Bucket classification: `well_calibrated` (error < 5%), `overconfident` (predicted > actual), `underconfident` (predicted < actual), `empty`

---

## 3. Grading Scale

| Grade | ECE Threshold | Interpretation |
|-------|-------------|----------------|
| **A** | < 3% | Excellent — confidence scores are reliable |
| **B** | < 6% | Good — minor calibration drift |
| **C** | < 10% | Acceptable — monitor closely |
| **D** | < 15% | Poor — advisory outputs partially unreliable |
| **F** | ≥ 15% | Failed — do not trust confidence-based conclusions |

---

## 4. Status Classification

- **well_calibrated** — all non-empty buckets within 5% error
- **overconfident** — majority of buckets over-predict (system too confident)
- **underconfident** — majority of buckets under-predict
- **mixed** — combination of over/under confidence
- **uncalibrated** — insufficient data for assessment

---

## 5. Trend Detection

Trend is computed by comparing the ECE of the last two stored calibration runs:
- **improving** — ECE decreased by > 1pp
- **stable** — ECE within ±1pp
- **degrading** — ECE increased by > 1pp

---

## 6. Implementation Notes

- Confidence scores (0–100) are normalized to probabilities (0–1) before computation
- Minimum recommended sample: n ≥ 30 for reliable calibration
- Window options: 7d, 30d, 90d, all-time
- Results stored in `calibration_results` table; never overwrites prior results (append-only)
- The engine has no write access to confidence score computation — advisory only

---

## 7. Test Coverage

- 20 tests across 9 suites
- Coverage: empty input, small sample, reliability buckets, overconfident detection, underconfident detection, metric ranges, trend computation, window filtering
- All 20 tests pass

---

## 8. API Endpoints

```
GET  /api/learning/enhancement/calibration           — live + stored calibration
GET  /api/learning/enhancement/calibration/history   — historical calibration runs
POST /api/learning/enhancement/run-calibration       — trigger calibration run
```
