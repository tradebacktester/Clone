# Learning System Enhancement — Full Technical Report
**System:** KRYTOS V2 — Institutional-Grade Algorithmic Trading Platform**
**Phase:** 4 — Learning Reliability, Versioning & Calibration**
**Status:** ADVISORY ONLY — zero trading behavior modification**
**Date:** 2026-06-28**

---

## 1. Overview

Phase 4 adds four institutional-grade reliability and monitoring engines to the KRYTOS V2 learning system. These engines address the core operator concern: *"Can I trust the advisory outputs from the learning system?"*

The four engines are:

| Engine | What It Answers |
|--------|----------------|
| **Confidence Calibration** | Are predicted confidence scores accurate? |
| **Regime Transition Detection** | Has the market character fundamentally changed? |
| **Learning Version Control** | How has the learning system evolved across cycles? |
| **Quality Monitor** | Is the underlying data and system reliable? |

---

## 2. Architecture

### Library Layer (`lib/market-analysis/`)
Four new source files in `src/learning/learning-validation/`:

```
confidence-calibrator.ts      — Brier score, ECE, MCE, ACE, reliability diagram
regime-transition-detector.ts — Hurst, ATR, ADX proxy, rolling vol, CUSUM
version-controller.ts         — Semantic versioning, comparison, changelog
quality-monitor.ts            — 8-dimension quality score, alert generation
```

All functions are pure — no DB access, no side effects. They take data as input and return structured results.

### DB Layer (`lib/db/`)
Five new tables in `schema/learning-enhancement.ts`:

```sql
calibration_results           — one row per calibration run
regime_transitions            — one row per detected regime transition
learning_versions             — one row per version snapshot
learning_quality_snapshots    — one row per quality monitor run
quality_alerts                — one row per alert (resolved or active)
```

### API Layer (`artifacts/api-server/`)
New route file: `src/routes/learning-enhancement.ts`
15 endpoints mounted at `/api/learning/enhancement/*`
Wired into `src/routes/index.ts`

### Dashboard Layer (`artifacts/dashboard/`)
New page: `src/pages/learning-enhancement.tsx`
5 tabs: Overview, Calibration, Regime, Versions, Quality
Wired into `App.tsx` at `/learning-enhancement`
Nav link added to sidebar under Learning section

---

## 3. Component Detail

### 3.1 Confidence Calibration Engine

**Techniques:** Brier score, ECE (Expected Calibration Error), MCE, ACE, 10-bucket reliability diagram

**Inputs:** Closed trade features with outcome labels
**Outputs:** Calibration result with grade (A–F), status, trend, reliability buckets

**Key insight:** A well-calibrated 70% confidence signal should produce a ~70% win rate. Systematic deviation (overconfidence or underconfidence) reveals a gap between the learning system's self-assessment and reality.

**Test coverage:** 20 tests, all passing

### 3.2 Regime Transition Detection Engine

**Techniques:** Hurst exponent (R/S analysis), rolling volatility, ATR, ADX proxy, trend persistence (autocorrelation), CUSUM change-point detection

**Inputs:** Candle-like price data (real OANDA bars or synthetic from trade features)
**Outputs:** Regime state, detected transitions with evidence, regime history, regime timeline

**Key insight:** The market has 6 recognizable regimes (trending, ranging, volatile, low_volatility, expansion, compression). Transitions between regimes invalidate learning conclusions based on the prior regime. Detecting them early enables operators to re-run learning cycles with regime-appropriate data windows.

**Test coverage:** 18 tests, all passing

### 3.3 Learning Version Controller

**Techniques:** Semantic versioning (MAJOR.MINOR.PATCH), change classification, delta computation, text changelog generation

**Inputs:** Performance snapshot (win rate, confidence, health, validation, patterns, features)
**Outputs:** Version object with semver, comparison results, markdown changelog

**Versioning rules:**
- MAJOR: breaking degradation (health drop > 20pts, validation failed, method change)
- MINOR: positive growth or new capabilities
- PATCH: trivial data refresh or re-run

**Key insight:** Treating the learning system like software (with versioning) enables reproducible auditing, rollback reference points, and structured before/after comparison of any two system states.

**Test coverage:** 25 tests, all passing

### 3.4 Learning Quality Monitor

**Techniques:** Coefficient of variation analysis, missing data scoring, Drizzle ORM integration, alert generation and deduplication

**Inputs:** Features + historical cycle data + calibration ECE + drift alert counts
**Outputs:** 8-dimension quality snapshot, composite quality score (0–100), active alert list

**8 dimensions:** Data Completeness, Sample Size, Confidence Stability, Pattern Stability, Recommendation Stability, Calibration Status, Drift Status, Validation Success

**Key insight:** Advisory output reliability is only as good as the underlying data. The quality monitor gives the operator a single number (0–100) summarizing the trustworthiness of the entire learning system at any moment.

**Test coverage:** 21 tests, all passing

---

## 4. Test Summary

| Engine | Tests | Pass | Fail |
|--------|-------|------|------|
| Confidence Calibration | 20 | 20 | 0 |
| Regime Transition Detection | 18 | 18 | 0 |
| Learning Version Controller | 25 | 25 | 0 |
| Learning Quality Monitor | 21 | 21 | 0 |
| **Total** | **84** | **84** | **0** |

---

## 5. DB Schema

5 new tables, 0 existing tables modified. All new tables are append-only with no cascading deletes. Full schema in `lib/db/src/schema/learning-enhancement.ts`. Schema successfully pushed to PostgreSQL.

---

## 6. API Surface

15 endpoints at `/api/learning/enhancement/*`:
- 3 calibration endpoints
- 3 regime endpoints
- 4 version endpoints
- 4 quality endpoints
- 1 overview endpoint

All endpoints return `{ ok: boolean, data: ... }` envelope. Error responses return `{ ok: false, error: string }`.

---

## 7. Dashboard

5-tab React dashboard at `/learning-enhancement`:
- Real-time data via React Query (60s refresh)
- Reliability diagram (Recharts BarChart with color-coded buckets)
- Regime timeline (proportional colored segments)
- Version comparison tool (select two versions, get diff)
- Quality score with 8-dimension breakdown
- Alert center with severity sorting and resolve action

---

## 8. Advisory-Only Guarantee

Every component in Phase 4:
1. Has **read-only** access to trade data
2. Writes **only** to the 5 new enhancement DB tables
3. Has **no imports** from: `bot-engine`, `paper-engine`, `execution`, `risk`, `order-routing`, or any live trading module
4. Has **no ability** to modify: confidence computation, learning cycle triggers, trade signals, position sizing, or risk limits
5. UI clearly labels all outputs as "Advisory only"

This is not a policy — it is an architectural constraint enforced by module boundaries.
