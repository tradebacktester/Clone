# Learning System Monitoring — Operations Report
**System:** KRYTOS V2 — Learning System Enhancement, Phase 4**
**Status:** ADVISORY ONLY**
**Date:** 2026-06-28**

---

## 1. Monitoring Architecture

Phase 4 introduces a four-layer monitoring architecture over the learning system:

```
┌─────────────────────────────────────────────────────┐
│               LEARNING ENHANCEMENT LAYER             │
│  (Advisory only — zero trading behavior modification) │
├─────────────┬──────────────┬──────────────┬─────────┤
│ Calibration │    Regime    │  Versioning  │ Quality │
│  Engine     │  Transition  │  Controller  │ Monitor │
│             │  Detector    │              │         │
├─────────────┴──────────────┴──────────────┴─────────┤
│              LEARNING HEALTH LAYER (Phase 3)          │
│  Drift Detection, Health Monitor, Validation, etc.    │
├───────────────────────────────────────────────────────┤
│              CORE LEARNING PIPELINE                   │
│  AMD cycles, RL agent, Pattern scoring, Feature ext.  │
└───────────────────────────────────────────────────────┘
```

---

## 2. Data Flow

```
Closed trades (DB)
    ↓
extractFeatures() [@workspace/market-analysis]
    ↓
┌─────────────────────────────────────────────┐
│  runCalibration()         — ECE, Brier, MCE │
│  analyzeRegimeState()     — Hurst, ATR, ADX │
│  detectRegimeTransition() — CUSUM, struct.  │
│  buildLearningVersion()   — semver snapshot │
│  computeQualitySnapshot() — 8-dim quality  │
└─────────────────────────────────────────────┘
    ↓
DB (append-only)
    ↓
Dashboard: /learning-enhancement (5 tabs)
    ↓
Operator review (ADVISORY ONLY)
```

---

## 3. DB Tables Added

| Table | Rows Created By | Purpose |
|-------|-----------------|---------|
| `calibration_results` | `POST /run-calibration` | Stores each calibration run |
| `regime_transitions` | `POST /run-regime-analysis` | Stores detected transitions |
| `learning_versions` | `POST /create-version` | Version snapshots |
| `learning_quality_snapshots` | Future: auto-monitor loop | Quality snapshots over time |
| `quality_alerts` | Via quality monitor | Active/resolved alerts |

All tables are append-only. No existing tables were modified.

---

## 4. Dashboard: /learning-enhancement

The dashboard page provides 5 tabs:

| Tab | Content |
|----|---------|
| **Overview** | Calibration grade, regime, quality score, active version |
| **Calibration** | Reliability diagram, ECE history, status summary |
| **Regime** | Current regime state, transition history, regime timeline |
| **Versions** | Version list, comparison tool, changelog viewer |
| **Quality** | 8-dimension score, alert center, strengths/weaknesses |

---

## 5. Alert Monitoring Workflow

1. Operator opens `/learning-enhancement` → Quality tab
2. Alert Center shows active alerts sorted by severity
3. Operator reviews description + recommendation
4. Operator takes manual action (e.g., runs fresh calibration, investigates drift)
5. Operator clicks "Resolve" to mark alert as acknowledged
6. Alert is marked `resolved=true` with timestamp

---

## 6. Scheduled Analysis

Currently all four enhancement engines are on-demand (manual trigger via POST endpoints). The recommended operator schedule:

| Engine | Frequency |
|--------|-----------|
| Calibration | After each learning cycle completes |
| Regime Analysis | Daily |
| Version Snapshot | After each learning cycle completes |
| Quality Snapshot | Daily or after major data additions |

---

## 7. Key Thresholds Summary

| Metric | Warning | Critical |
|--------|---------|---------|
| ECE (calibration) | > 6% | > 15% |
| Quality Score | < 55 | < 40 |
| Sample Size | < 30 | < 15 |
| Validation Pass Rate | < 70% | < 50% |
| CUSUM Score (regime) | > 50 | > 70 |
| Hurst Exponent drift | ±0.1 from baseline | ±0.2 from baseline |
| Active Drift Alerts | > 2 | Critical drift present |

---

## 8. Non-Interference Guarantee

Phase 4 enhancement engines:
- Have **read-only** access to trade data via `extractFeatures()`
- Write **only** to the 5 new enhancement tables
- Have **no imports** from execution, bot control, risk management, or order routing modules
- Cannot modify: confidence score computation, learning cycle methodology, trade signals, position sizing, risk limits

This is enforced architecturally by the module boundaries — the enhancement library lives in `lib/market-analysis/src/learning/learning-validation/` with no circular dependencies to execution paths.
